require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Organization = require("../models/Organization");
const Service = require("../models/Service");

async function seedData() {
    try {
        await connectDB();

        console.log("Seeding database...");

        // Check or create Organization
        let org = await Organization.findOne({ name: "General Health Clinic" });
        if (!org) {
            org = await Organization.create({
                name: "General Health Clinic",
                type: "CLINIC",
                address: "123 Main Street, Suite 100"
            });
            console.log("Organization created:", org.name);
        } else {
            console.log("Organization already exists:", org.name);
        }

        // Check or create Services for this Organization
        const servicesData = [
            {
                name: "General Consultation",
                avgServiceMinutes: 15,
                isActive: true,
                tokenPrefix: "A"
            },
            {
                name: "Laboratory Test",
                avgServiceMinutes: 10,
                isActive: true,
                tokenPrefix: "B"
            }
        ];

        for (const sData of servicesData) {
            let service = await Service.findOne({
                organizationId: org._id,
                name: sData.name
            });
            if (!service) {
                service = await Service.create({
                    organizationId: org._id,
                    ...sData
                });
                console.log("Service created:", service.name);
            } else {
                console.log("Service already exists:", service.name);
            }
        }

        console.log("Seeding completed successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Error seeding database:", error);
        process.exit(1);
    }
}

seedData();
