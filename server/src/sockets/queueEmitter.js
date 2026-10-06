const { getIO } = require("./socketServer");

function safeGetIO() {
    try {
        return getIO();
    } catch {
        return null;
    }
}

function formatEntryPayload(entry) {
    if (!entry) return null;
    return {
        entryId: entry._id ? entry._id.toString() : entry.entryId,
        serviceId: entry.serviceId ? (entry.serviceId._id ? entry.serviceId._id.toString() : entry.serviceId.toString()) : null,
        userId: entry.userId ? (entry.userId._id ? entry.userId._id.toString() : entry.userId.toString()) : null,
        tokenNumber: entry.tokenNumber,
        tokenLabel: entry.tokenLabel,
        status: entry.status,
        counterId: entry.counterId || null,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt
    };
}

function emitQueueJoined(entry) {
    const io = safeGetIO();
    if (!io) return;

    const payload = formatEntryPayload(entry);
    if (!payload || !payload.serviceId) return;

    // Service-level notification
    io.to(`service:${payload.serviceId}`).emit("queue:joined", payload);
    io.to(`service:${payload.serviceId}`).emit("queue:updated", {
        serviceId: payload.serviceId,
        action: "JOINED",
        entry: payload
    });

    // Customer-specific notification
    if (payload.userId) {
        io.to(`user:${payload.userId}`).emit("queue:joined", payload);
    }
}

function emitQueueCalled(entry) {
    const io = safeGetIO();
    if (!io) return;

    const payload = formatEntryPayload(entry);
    if (!payload || !payload.serviceId) return;

    // Service-level notification (e.g. TV display board, active queue monitor)
    io.to(`service:${payload.serviceId}`).emit("queue:called", payload);
    io.to(`service:${payload.serviceId}`).emit("queue:updated", {
        serviceId: payload.serviceId,
        action: "CALLED",
        entry: payload
    });

    // Customer-specific private notification (alerts user their turn has arrived)
    if (payload.userId) {
        io.to(`user:${payload.userId}`).emit("queue:called", payload);
    }
}

function emitQueueStarted(entry) {
    const io = safeGetIO();
    if (!io) return;

    const payload = formatEntryPayload(entry);
    if (!payload || !payload.serviceId) return;

    // Service-level notification
    io.to(`service:${payload.serviceId}`).emit("queue:started", payload);
    io.to(`service:${payload.serviceId}`).emit("queue:updated", {
        serviceId: payload.serviceId,
        action: "STARTED",
        entry: payload
    });

    // Customer-specific notification
    if (payload.userId) {
        io.to(`user:${payload.userId}`).emit("queue:started", payload);
    }
}

function emitQueueCompleted(entry) {
    const io = safeGetIO();
    if (!io) return;

    const payload = formatEntryPayload(entry);
    if (!payload || !payload.serviceId) return;

    // Service-level notification
    io.to(`service:${payload.serviceId}`).emit("queue:completed", payload);
    io.to(`service:${payload.serviceId}`).emit("queue:updated", {
        serviceId: payload.serviceId,
        action: "COMPLETED",
        entry: payload
    });

    // Customer-specific notification
    if (payload.userId) {
        io.to(`user:${payload.userId}`).emit("queue:completed", payload);
    }
}

function emitQueueCancelled(entry) {
    const io = safeGetIO();
    if (!io) return;

    const payload = formatEntryPayload(entry);
    if (!payload || !payload.serviceId) return;

    // Service-level notification
    io.to(`service:${payload.serviceId}`).emit("queue:cancelled", payload);
    io.to(`service:${payload.serviceId}`).emit("queue:updated", {
        serviceId: payload.serviceId,
        action: "CANCELLED",
        entry: payload
    });

    // Customer-specific notification
    if (payload.userId) {
        io.to(`user:${payload.userId}`).emit("queue:cancelled", payload);
    }
}

module.exports = {
    emitQueueJoined,
    emitQueueCalled,
    emitQueueStarted,
    emitQueueCompleted,
    emitQueueCancelled,
    formatEntryPayload
};
