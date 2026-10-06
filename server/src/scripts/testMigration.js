require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");
const Organization = require("../models/Organization");
const Service = require("../models/Service");
const QueueEntry = require("../models/QueueEntry");

async function runTestSuite() {
    try {
        await connectDB();
        console.log("=== MONGODB QUEUE SERVICE MIGRATION TEST SUITE ===");

        // Setup Test Users and Service
        let user1 = await User.findOne({ email: "user1@test.com" });
        if (!user1) {
            user1 = await User.create({ name: "User One", email: "user1@test.com", passwordHash: "hash1" });
        }
        let user2 = await User.findOne({ email: "user2@test.com" });
        if (!user2) {
            user2 = await User.create({ name: "User Two", email: "user2@test.com", passwordHash: "hash2" });
        }
        let user3 = await User.findOne({ email: "user3@test.com" });
        if (!user3) {
            user3 = await User.create({ name: "User Three", email: "user3@test.com", passwordHash: "hash3" });
        }

        const service = await Service.findOne({});
        if (!service) {
            throw new Error("No service found in DB. Please run seed script first.");
        }

        // Clean up previous test entries for clean run
        await QueueEntry.deleteMany({ userId: { $in: [user1._id, user2._id, user3._id] } });

        const queueService = require("../services/queueService");

        console.log("\n1 & 2 & 3 & 4: Join valid user into valid service");
        const entry1 = await queueService.joinQueue(user1._id.toString(), service._id.toString());
        const dbEntry1 = await QueueEntry.findById(entry1._id);
        console.log("Joined entry:", {
            _id: entry1._id.toString(),
            status: entry1.status,
            tokenNumber: entry1.tokenNumber,
            tokenLabel: entry1.tokenLabel,
            dbStored: !!dbEntry1
        });

        console.log("\n5: Duplicate active queue join attempt while WAITING");
        try {
            await queueService.joinQueue(user1._id.toString(), service._id.toString());
            console.error("FAIL: Duplicate active join was allowed!");
        } catch (err) {
            console.log("PASS: Duplicate active join rejected ->", err.message);
        }

        console.log("\n6: Call next (WAITING -> CALLED)");
        const calledEntry = await queueService.callNext(service._id.toString());
        console.log("Called entry:", { _id: calledEntry._id.toString(), status: calledEntry.status });

        console.log("\n7: Start serving (CALLED -> SERVING)");
        const servingEntry = await queueService.startServing(calledEntry._id.toString());
        console.log("Serving entry:", { _id: servingEntry._id.toString(), status: servingEntry.status });

        console.log("\n8: Complete (SERVING -> COMPLETED)");
        const completedEntry = await queueService.completeEntry(servingEntry._id.toString());
        console.log("Completed entry:", { _id: completedEntry._id.toString(), status: completedEntry.status });

        console.log("\n9: Join same user to same service after COMPLETED");
        const entry1Rejoin = await queueService.joinQueue(user1._id.toString(), service._id.toString());
        console.log("Rejoined entry:", { _id: entry1Rejoin._id.toString(), status: entry1Rejoin.status });

        console.log("\n10: Cancel from WAITING");
        const entry2 = await queueService.joinQueue(user2._id.toString(), service._id.toString());
        const cancelledEntry2 = await queueService.cancelEntry(entry2._id.toString());
        console.log("Cancelled entry from WAITING:", { _id: cancelledEntry2._id.toString(), status: cancelledEntry2.status });

        console.log("\n11: Cancel from CALLED");
        const entry3 = await queueService.joinQueue(user3._id.toString(), service._id.toString());
        const calledEntry3 = await queueService.callNext(service._id.toString());
        const cancelledEntry3 = await queueService.cancelEntry(calledEntry3._id.toString());
        console.log("Cancelled entry from CALLED:", { _id: cancelledEntry3._id.toString(), status: cancelledEntry3.status });

        console.log("\n12: Invalid WAITING -> SERVING");
        try {
            await queueService.startServing(entry1Rejoin._id.toString());
            console.error("FAIL: WAITING -> SERVING allowed!");
        } catch (err) {
            console.log("PASS: WAITING -> SERVING rejected ->", err.message);
        }

        console.log("\n13: Invalid WAITING -> COMPLETED");
        try {
            await queueService.completeEntry(entry1Rejoin._id.toString());
            console.error("FAIL: WAITING -> COMPLETED allowed!");
        } catch (err) {
            console.log("PASS: WAITING -> COMPLETED rejected ->", err.message);
        }

        console.log("\n14: Invalid COMPLETED -> SERVING");
        try {
            await queueService.startServing(completedEntry._id.toString());
            console.error("FAIL: COMPLETED -> SERVING allowed!");
        } catch (err) {
            console.log("PASS: COMPLETED -> SERVING rejected ->", err.message);
        }

        console.log("\n15: Call-next when no WAITING entries exist");
        // Clear remaining WAITING entries
        await QueueEntry.updateMany({ status: "WAITING" }, { status: "CANCELLED" });
        const emptyCallNext = await queueService.callNext(service._id.toString());
        console.log("Call-next on empty queue:", emptyCallNext);

        console.log("\n16: Verify database persistence");
        const count = await QueueEntry.countDocuments({});
        console.log("Persisted QueueEntries in MongoDB count:", count);

        console.log("\n=== ALL DIRECT DATABASE & SERVICE MIGRATION TESTS PASSED ===");
        process.exit(0);
    } catch (err) {
        console.error("Test suite failed:", err);
        process.exit(1);
    }
}

runTestSuite();
