const QueueEntry = require("../models/QueueEntry");
const User = require("../models/User");
const Service = require("../models/Service");

const transitions = {
    WAITING: ["CALLED", "CANCELLED"],
    CALLED: ["SERVING", "SKIPPED", "CANCELLED", "NO_SHOW"],
    SERVING: ["COMPLETED"]
};

function canTransition(currentStatus, nextStatus) {
    const allowedStatuses = transitions[currentStatus];

    if (!allowedStatuses) {
        return false;
    }

    for (let i = 0; i < allowedStatuses.length; i++) {
        if (allowedStatuses[i] === nextStatus) {
            return true;
        }
    }

    return false;
}

async function joinQueue(userId, serviceId) {
    let user;
    try {
        user = await User.findById(userId);
    } catch (err) {
        if (err.name === "CastError") {
            const error = new Error("User not found");
            error.statusCode = 404;
            throw error;
        }
        throw err;
    }

    if (!user) {
        const error = new Error("User not found");
        error.statusCode = 404;
        throw error;
    }

    let service;
    try {
        service = await Service.findById(serviceId);
    } catch (err) {
        if (err.name === "CastError") {
            const error = new Error("Service not found");
            error.statusCode = 404;
            throw error;
        }
        throw err;
    }

    if (!service) {
        const error = new Error("Service not found");
        error.statusCode = 404;
        throw error;
    }

    if (!service.isActive) {
        const error = new Error("Service is not active");
        error.statusCode = 400;
        throw error;
    }

    const existingActive = await QueueEntry.findOne({
        userId,
        serviceId,
        status: { $in: ["WAITING", "CALLED", "SERVING"] }
    });

    if (existingActive) {
        const error = new Error("Customer already has an active queue entry");
        error.statusCode = 409;
        throw error;
    }

    // Baseline synchronization: if lastTokenNumber is uninitialized,
    // synchronize it with max(tokenNumber) from existing entries in this service.
    if (service.lastTokenNumber === undefined || service.lastTokenNumber === null) {
        const lastEntry = await QueueEntry.findOne({ serviceId }).sort({ tokenNumber: -1 });
        const baseline = lastEntry ? lastEntry.tokenNumber : 0;
        await Service.updateOne(
            { _id: serviceId, $or: [{ lastTokenNumber: { $exists: false } }, { lastTokenNumber: { $lt: baseline } }] },
            { $set: { lastTokenNumber: baseline } }
        );
    }

    // Atomic per-service token allocation using MongoDB $inc
    const updatedService = await Service.findByIdAndUpdate(
        serviceId,
        { $inc: { lastTokenNumber: 1 } },
        { returnDocument: "after" }
    );

    const tokenNumber = updatedService.lastTokenNumber;
    const prefix = updatedService.tokenPrefix || "A";
    const tokenLabel = `${prefix}-${String(tokenNumber).padStart(3, "0")}`;

    try {
        const entry = await QueueEntry.create({
            serviceId,
            userId,
            tokenNumber,
            tokenLabel,
            status: "WAITING"
        });

        return entry;
    } catch (err) {
        if (err.code === 11000) {
            const error = new Error("Customer already has an active queue entry");
            error.statusCode = 409;
            throw error;
        }
        throw err;
    }
}

async function callNext(serviceId) {
    let service;
    try {
        service = await Service.findById(serviceId);
    } catch (err) {
        if (err.name === "CastError") {
            const error = new Error("Service not found");
            error.statusCode = 404;
            throw error;
        }
        throw err;
    }

    if (!service) {
        const error = new Error("Service not found");
        error.statusCode = 404;
        throw error;
    }

    const entry = await QueueEntry.findOne({
        serviceId,
        status: "WAITING"
    }).sort({ createdAt: 1 });

    if (!entry) {
        return null;
    }

    if (!canTransition(entry.status, "CALLED")) {
        const error = new Error("Invalid status transition");
        error.statusCode = 409;
        throw error;
    }

    entry.status = "CALLED";
    await entry.save();

    return entry;
}

async function startServing(entryId) {
    let entry;
    try {
        entry = await QueueEntry.findById(entryId);
    } catch (err) {
        if (err.name === "CastError") {
            const error = new Error("Queue entry not found");
            error.statusCode = 404;
            throw error;
        }
        throw err;
    }

    if (!entry) {
        const error = new Error("Queue entry not found");
        error.statusCode = 404;
        throw error;
    }

    if (!canTransition(entry.status, "SERVING")) {
        const error = new Error("Invalid status transition");
        error.statusCode = 409;
        throw error;
    }

    entry.status = "SERVING";
    await entry.save();

    return entry;
}

async function completeEntry(entryId) {
    let entry;
    try {
        entry = await QueueEntry.findById(entryId);
    } catch (err) {
        if (err.name === "CastError") {
            const error = new Error("Queue entry not found");
            error.statusCode = 404;
            throw error;
        }
        throw err;
    }

    if (!entry) {
        const error = new Error("Queue entry not found");
        error.statusCode = 404;
        throw error;
    }

    if (!canTransition(entry.status, "COMPLETED")) {
        const error = new Error("Invalid status transition");
        error.statusCode = 409;
        throw error;
    }

    entry.status = "COMPLETED";
    await entry.save();

    return entry;
}

async function cancelEntry(entryId, user) {
    let entry;
    try {
        entry = await QueueEntry.findById(entryId);
    } catch (err) {
        if (err.name === "CastError") {
            const error = new Error("Queue entry not found");
            error.statusCode = 404;
            throw error;
        }
        throw err;
    }

    if (!entry) {
        const error = new Error("Queue entry not found");
        error.statusCode = 404;
        throw error;
    }

    if (user && user.role === "USER" && entry.userId.toString() !== user.userId) {
        const error = new Error("Access denied");
        error.statusCode = 403;
        throw error;
    }

    if (!canTransition(entry.status, "CANCELLED")) {
        const error = new Error("Invalid status transition");
        error.statusCode = 409;
        throw error;
    }

    entry.status = "CANCELLED";
    await entry.save();

    return entry;
}

async function getServiceQueue(serviceId) {
    let service;
    try {
        service = await Service.findById(serviceId);
    } catch (err) {
        if (err.name === "CastError") {
            const error = new Error("Service not found");
            error.statusCode = 404;
            throw error;
        }
        throw err;
    }

    if (!service) {
        const error = new Error("Service not found");
        error.statusCode = 404;
        throw error;
    }

    const entries = await QueueEntry.find({
        serviceId,
        status: { $in: ["WAITING", "CALLED", "SERVING"] }
    })
        .sort({ tokenNumber: 1 })
        .populate({ path: "userId", select: "name email" })
        .populate({ path: "serviceId", select: "name tokenPrefix avgServiceMinutes" });

    return entries;
}

async function getMyQueueEntry(userId) {
    const entry = await QueueEntry.findOne({
        userId,
        status: { $in: ["WAITING", "CALLED", "SERVING"] }
    })
        .populate({ path: "serviceId", select: "name tokenPrefix avgServiceMinutes" });

    if (!entry) {
        const error = new Error("No active queue entry found");
        error.statusCode = 404;
        throw error;
    }

    return entry;
}

async function getAllServices() {
    return await Service.find({ isActive: true }).select("_id name avgServiceMinutes tokenPrefix isActive").lean();
}

module.exports = {
    getAllServices,
    joinQueue,
    callNext,
    startServing,
    completeEntry,
    cancelEntry,
    getServiceQueue,
    getMyQueueEntry
};