const mongoose = require("mongoose");

const queueEntrySchema = new mongoose.Schema(
    {
        serviceId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Service",
            required: [true, "Service ID is required"]
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: [true, "User ID is required"]
        },
        tokenNumber: {
            type: Number,
            required: [true, "Token number is required"]
        },
        tokenLabel: {
            type: String,
            required: [true, "Token label is required"],
            trim: true
        },
        status: {
            type: String,
            enum: ["WAITING", "CALLED", "SERVING", "COMPLETED", "CANCELLED", "SKIPPED", "NO_SHOW"],
            default: "WAITING"
        },
        counterId: {
            type: String,
            default: null
        }
    },
    {
        timestamps: true
    }
);

queueEntrySchema.index(
    { userId: 1, serviceId: 1 },
    {
        unique: true,
        partialFilterExpression: {
            status: { $in: ["WAITING", "CALLED", "SERVING"] }
        }
    }
);

queueEntrySchema.index(
    { serviceId: 1, tokenNumber: 1 },
    { unique: true }
);

module.exports = mongoose.model("QueueEntry", queueEntrySchema);
