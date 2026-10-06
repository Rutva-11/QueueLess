const mongoose = require("mongoose");

const organizationSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Organization name is required"],
            trim: true
        },
        type: {
            type: String,
            trim: true,
            default: "GENERAL"
        },
        address: {
            type: String,
            trim: true
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("Organization", organizationSchema);
