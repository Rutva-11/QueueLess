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

    let partySize = 2;
    if (user && user.name) {
        const sizeMatch = user.name.match(/\((?:party\s+of\s+)?(\d+)\)/i) || user.name.match(/(?:party\s+of\s+)(\d+)/i);
        if (sizeMatch && sizeMatch[1]) {
            partySize = parseInt(sizeMatch[1], 10);
        }
    }

    try {
        const entry = await QueueEntry.create({
            serviceId,
            userId,
            tokenNumber,
            tokenLabel,
            status: "WAITING",
            partySize
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
    entry.calledAt = new Date();
    await entry.save();

    return entry;
}

async function callSpecific(entryId) {
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

    if (!canTransition(entry.status, "CALLED")) {
        const error = new Error("Invalid status transition");
        error.statusCode = 409;
        throw error;
    }

    entry.status = "CALLED";
    entry.calledAt = new Date();
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
    entry.servedAt = new Date();
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
    entry.completedAt = new Date();
    await entry.save();

    await entry.populate([
        { path: "userId", select: "name email" },
        { path: "serviceId", select: "name tokenPrefix avgServiceMinutes" }
    ]);

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

function getStartOfToday(tz) {
    if (tz && typeof tz === "string") {
        try {
            const timeZone = tz.trim();
            const now = new Date();
            const dateParts = new Intl.DateTimeFormat("en-CA", {
                timeZone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit"
            }).formatToParts(now);

            const y = dateParts.find((p) => p.type === "year")?.value;
            const m = dateParts.find((p) => p.type === "month")?.value;
            const d = dateParts.find((p) => p.type === "day")?.value;

            if (y && m && d) {
                let candidate = new Date(`${y}-${m}-${d}T00:00:00.000Z`);
                const timeFormatter = new Intl.DateTimeFormat("en-US", {
                    timeZone,
                    hourCycle: "h23",
                    hour: "numeric",
                    minute: "numeric",
                    second: "numeric"
                });

                for (let i = 0; i < 3; i++) {
                    const parts = timeFormatter.formatToParts(candidate);
                    const h = parseInt(parts.find((p) => p.type === "hour")?.value || "0", 10);
                    const min = parseInt(parts.find((p) => p.type === "minute")?.value || "0", 10);
                    const s = parseInt(parts.find((p) => p.type === "second")?.value || "0", 10);

                    const partsDate = new Intl.DateTimeFormat("en-CA", {
                        timeZone,
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit"
                    }).formatToParts(candidate);
                    const candD = partsDate.find((p) => p.type === "day")?.value;
                    let diffMs;
                    if (candD !== d) {
                        diffMs = ((h - 24) * 3600 + min * 60 + s) * 1000;
                    } else {
                        diffMs = (h * 3600 + min * 60 + s) * 1000;
                    }

                    if (diffMs === 0) break;
                    candidate = new Date(candidate.getTime() - diffMs);
                }
                return candidate;
            }
        } catch {
            // fallback to server local midnight
        }
    }
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

async function getServiceHistory(serviceId, limit = 20, tz = null) {
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

    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const history = await QueueEntry.find({
        serviceId: service._id,
        status: "COMPLETED"
    })
        .sort({ completedAt: -1, updatedAt: -1 })
        .limit(safeLimit)
        .populate({ path: "userId", select: "name email" })
        .populate({ path: "serviceId", select: "name tokenPrefix avgServiceMinutes" })
        .lean();

    const startOfToday = getStartOfToday(tz);

    const clearedTodayCount = await QueueEntry.countDocuments({
        serviceId: service._id,
        status: "COMPLETED",
        $or: [
            { completedAt: { $gte: startOfToday } },
            { completedAt: null, updatedAt: { $gte: startOfToday } }
        ]
    });

    return {
        history,
        clearedTodayCount
    };
}

module.exports = {
    getAllServices,
    joinQueue,
    callNext,
    callSpecific,
    startServing,
    completeEntry,
    cancelEntry,
    getServiceQueue,
    getMyQueueEntry,
    getServiceHistory
};