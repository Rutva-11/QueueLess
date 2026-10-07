const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema(
    {
        organizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Organization",
            required: [true, "Organization ID is required"]
        },
        name: {
            type: String,
            required: [true, "Service name is required"],
            trim: true
        },
        avgServiceMinutes: {
            type: Number,
            default: 15,
            min: [1, "Average service minutes must be at least 1"]
        },
        isActive: {
            type: Boolean,
            default: true
        },
        tokenPrefix: {
            type: String,
            default: "A",
            trim: true
        },
        lastTokenNumber: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Service", serviceSchema);
