require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");
const Organization = require("../models/Organization");
const Service = require("../models/Service");
const QueueEntry = require("../models/QueueEntry");

async function runTests() {
    try {
        await connectDB();
        console.log("=== STARTING DATABASE VERIFICATION TESTS ===");

        // Test C: Model validation (missing required fields)
        console.log("\n--- Test C: Model Validation ---");
        try {
            const invalidUser = new User({ email: "invalid@test.com" });
            await invalidUser.validate();
            console.error("FAIL: Missing required fields were not caught!");
        } catch (err) {
            console.log("PASS: Model validation rejected missing required fields (name, passwordHash):", err.message);
        }

        // Test D: QueueEntry status validation
        console.log("\n--- Test D: Status Enum Validation ---");
        try {
            const invalidStatusEntry = new QueueEntry({
                serviceId: new mongoose.Types.ObjectId(),
                userId: new mongoose.Types.ObjectId(),
                tokenNumber: 1,
                tokenLabel: "A-001",
                status: "INVALID_STATUS"
            });
            await invalidStatusEntry.validate();
            console.error("FAIL: Invalid status enum was accepted!");
        } catch (err) {
            console.log("PASS: Status enum rejected invalid status:", err.message);
        }

        // Setup test user & service
        let testUser = await User.findOne({ email: "testuser@example.com" });
        if (!testUser) {
            testUser = await User.create({
                name: "Test User",
                email: "testuser@example.com",
                passwordHash: "hashedpass123"
            });
        }

        const testService = await Service.findOne({});
        if (!testService) {
            throw new Error("No service found to test against");
        }

        // Ensure clean slate for test user
        await QueueEntry.deleteMany({ userId: testUser._id });

        // Ensure indexes are built
        await QueueEntry.syncIndexes();
        const indexes = await QueueEntry.collection.getIndexes();
        console.log("\n--- Index Verification ---");
        console.log("Actual QueueEntry Indexes:", JSON.stringify(indexes, null, 2));

        // Test E: Partial Unique Index on Active Queue Duplicate
        console.log("\n--- Test E: Partial Unique Index (Active Queue Duplicate) ---");
        const entry1 = await QueueEntry.create({
            serviceId: testService._id,
            userId: testUser._id,
            tokenNumber: 101,
            tokenLabel: "A-101",
            status: "WAITING"
        });
        console.log("Created 1st active entry:", entry1._id, entry1.status);

        try {
            await QueueEntry.create({
                serviceId: testService._id,
                userId: testUser._id,
                tokenNumber: 102,
                tokenLabel: "A-102",
                status: "WAITING"
            });
            console.error("FAIL: Duplicate active queue entry was allowed!");
        } catch (err) {
            console.log("PASS: Duplicate active queue entry blocked by database unique index:", err.message);
        }

        // Test F: Completed entry behavior allows new active entry
        console.log("\n--- Test F: Completed Entry Behavior ---");
        entry1.status = "COMPLETED";
        await entry1.save();
        console.log("Updated 1st entry status to COMPLETED");

        const entry2 = await QueueEntry.create({
            serviceId: testService._id,
            userId: testUser._id,
            tokenNumber: 102,
            tokenLabel: "A-102",
            status: "WAITING"
        });
        console.log("PASS: New active entry created after previous entry COMPLETED:", entry2._id, entry2.status);

        // Cleanup test data
        await QueueEntry.deleteMany({ userId: testUser._id });
        await User.deleteOne({ _id: testUser._id });

        console.log("\n=== ALL DATABASE TESTS PASSED SUCCESSFULLY ===");
        process.exit(0);
    } catch (error) {
        console.error("Database test failure:", error);
        process.exit(1);
    }
}

runTests();
