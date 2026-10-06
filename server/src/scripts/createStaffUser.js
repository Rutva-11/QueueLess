const path = require("path");
require("dotenv").config({
    path: path.resolve(__dirname, "../../.env")
});

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const connectDB = require("../config/db");
const User = require("../models/User");

async function createStaffUser() {
    try {
        await connectDB();

        const email = "staff@example.com";
        let user = await User.findOne({ email });

        if (user) {
            console.log("User already exists:");
        } else {
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash("Staff1234", salt);

            user = await User.create({
                name: "Test Staff",
                email,
                passwordHash,
                role: "STAFF"
            });
            console.log("Staff user created successfully:");
        }

        console.log({
            _id: user._id,
            email: user.email,
            role: user.role
        });

        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error("Error creating staff user:", error.message);
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
        }
        process.exit(1);
    }
}

createStaffUser();
