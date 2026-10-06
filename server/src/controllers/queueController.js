const {
    joinQueue,
    callNext,
    startServing,
    completeEntry,
    cancelEntry
} = require("../services/queueService");

async function joinQueueController(req, res, next) {
    try {
        if (!req.user || !req.user.userId) {
            const error = new Error("Authentication required");
            error.statusCode = 401;
            throw error;
        }

        const userId = req.user.userId;
        const { serviceId } = req.body || {};

        if (!serviceId || typeof serviceId !== "string" || serviceId.trim() === "") {
            const error = new Error("Service ID is required");
            error.statusCode = 400;
            throw error;
        }

        const entry = await joinQueue(userId, serviceId.trim());
        res.json(entry);
    } catch (error) {
        next(error);
    }
}

async function callNextController(req, res, next) {
    try {
        const { serviceId } = req.body || {};

        if (!serviceId || typeof serviceId !== "string" || serviceId.trim() === "") {
            const error = new Error("Service ID is required");
            error.statusCode = 400;
            throw error;
        }

        const entry = await callNext(serviceId.trim());
        res.json(entry);
    } catch (error) {
        next(error);
    }
}

async function startServingController(req, res, next) {
    try {
        const { id } = req.params;

        if (!id || typeof id !== "string" || id.trim() === "") {
            const error = new Error("Queue entry ID is required");
            error.statusCode = 400;
            throw error;
        }

        const entry = await startServing(id.trim());
        res.json(entry);
    } catch (error) {
        next(error);
    }
}

async function completeEntryController(req, res, next) {
    try {
        const { id } = req.params;

        if (!id || typeof id !== "string" || id.trim() === "") {
            const error = new Error("Queue entry ID is required");
            error.statusCode = 400;
            throw error;
        }

        const entry = await completeEntry(id.trim());
        res.json(entry);
    } catch (error) {
        next(error);
    }
}

async function cancelEntryController(req, res, next) {
    try {
        const { id } = req.params;

        if (!id || typeof id !== "string" || id.trim() === "") {
            const error = new Error("Queue entry ID is required");
            error.statusCode = 400;
            throw error;
        }

        const entry = await cancelEntry(id.trim());
        res.json(entry);
    } catch (error) {
        next(error);
    }
}

module.exports = {
    joinQueueController,
    callNextController,
    startServingController,
    completeEntryController,
    cancelEntryController
};