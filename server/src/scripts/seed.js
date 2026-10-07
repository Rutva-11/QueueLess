require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const Organization = require("../models/Organization");
const Service = require("../models/Service");

async function seedData() {
    try {
        await connectDB();

        console.log("Seeding restaurant demo database...");

        // 1. Find or create "The Garden Table" restaurant organization
        let org = await Organization.findOne({ name: "The Garden Table" });
        if (!org) {
            // Check if legacy clinic organization exists and migrate it seamlessly
            org = await Organization.findOne({ name: "General Health Clinic" });
            if (org) {
                org.name = "The Garden Table";
                org.type = "RESTAURANT";
                org.address = "14 Grove Lane, Garden District";
                await org.save();
                console.log("Updated existing organization to:", org.name);
            } else {
                org = await Organization.create({
                    name: "The Garden Table",
                    type: "RESTAURANT",
                    address: "14 Grove Lane, Garden District"
                });
                console.log("Organization created:", org.name);
            }
        } else {
            org.type = "RESTAURANT";
            if (!org.address) org.address = "14 Grove Lane, Garden District";
            await org.save();
            console.log("Organization already exists:", org.name);
        }

        // 2. Deterministic Services: Main Dining (A) & Outdoor Dining (B)
        const servicesData = [
            {
                name: "Main Dining",
                legacyName: "General Consultation",
                avgServiceMinutes: 15,
                isActive: true,
                tokenPrefix: "A"
            },
            {
                name: "Outdoor Dining",
                legacyName: "Laboratory Test",
                avgServiceMinutes: 20,
                isActive: true,
                tokenPrefix: "B"
            }
        ];

        for (const sData of servicesData) {
            let service = await Service.findOne({
                organizationId: org._id,
                name: sData.name
            });

            if (!service && sData.legacyName) {
                // Check if legacy service exists and migrate in-place to preserve IDs
                service = await Service.findOne({
                    organizationId: org._id,
                    name: sData.legacyName
                });
                if (service) {
                    service.name = sData.name;
                    service.avgServiceMinutes = sData.avgServiceMinutes;
                    service.tokenPrefix = sData.tokenPrefix;
                    service.isActive = sData.isActive;
                    await service.save();
                    console.log("Migrated service in-place:", sData.legacyName, "->", service.name);
                }
            }

            if (!service) {
                service = await Service.create({
                    organizationId: org._id,
                    name: sData.name,
                    avgServiceMinutes: sData.avgServiceMinutes,
                    isActive: sData.isActive,
                    tokenPrefix: sData.tokenPrefix
                });
                console.log("Service created:", service.name);
            } else {
                console.log("Service verified:", service.name);
            }

            // Synchronize lastTokenNumber baseline with existing entries
            const maxEntry = await QueueEntry.findOne({ serviceId: service._id }).sort({ tokenNumber: -1 });
            const maxToken = maxEntry ? maxEntry.tokenNumber : 0;
            if (service.lastTokenNumber === undefined || service.lastTokenNumber === null || service.lastTokenNumber < maxToken) {
                service.lastTokenNumber = maxToken;
                await service.save();
                console.log(`Synchronized ${service.name} token counter to baseline:`, maxToken);
            }
        }

        console.log("Restaurant demo seeding completed successfully.");
        await mongoose.connection.close();
        process.exit(0);
    } catch (error) {
        console.error("Error seeding restaurant database:", error);
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
        }
        process.exit(1);
    }
}

seedData();
