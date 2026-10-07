const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true
        },
        passwordHash: {
            type: String,
            required: [
                function () {
                    return this.role === "STAFF" || this.role === "ADMIN";
                },
                "Password hash is required for staff and admin accounts"
            ]
        },
        role: {
            type: String,
            enum: ["USER", "STAFF", "ADMIN"],
            default: "USER"
        },
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization"
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("User", userSchema);
