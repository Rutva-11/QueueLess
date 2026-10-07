const path = require("path");
require("dotenv").config({
    path: path.resolve(__dirname, "../../.env")
});

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const User = require("../models/User");

async function seedStaffUser() {
    try {
        await connectDB();

        const email = (process.env.DEV_STAFF_EMAIL || "staff@example.com").trim().toLowerCase();
        const role = (process.env.DEV_STAFF_ROLE || "STAFF").toUpperCase();
        const password = process.env.DEV_STAFF_PASSWORD;

        if (!password) {
            console.error("\n❌ DEV_STAFF_PASSWORD environment variable is required.");
            console.error("Usage: DEV_STAFF_PASSWORD=<password> npm run seed:staff");
            console.error("Optional: DEV_STAFF_EMAIL=staff@example.com DEV_STAFF_ROLE=STAFF\n");
            process.exit(1);
        }

        if (password.length < 6) {
            console.error("\n❌ DEV_STAFF_PASSWORD must be at least 6 characters long.\n");
            process.exit(1);
        }

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        let user = await User.findOne({ email });

        if (user) {
            user.passwordHash = passwordHash;
            user.role = role;
            if (!user.name) user.name = "Staff Member";
            await user.save();
            console.log("\n✅ Existing account updated for development staff testing:");
        } else {
            user = await User.create({
                name: "Staff Member",
                email,
                passwordHash,
                role
            });
            console.log("\n✅ New staff account created for development testing:");
        }

        console.log({
            id: user._id,
            email: user.email,
            role: user.role
        });
        console.log("You can now sign in at /login using the provided credentials.\n");

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error("Error setting up staff user:", error.message);
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
        }
        process.exit(1);
    }
}

seedStaffUser();
