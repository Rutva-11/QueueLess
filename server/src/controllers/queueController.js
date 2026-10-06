const {
    joinQueue,
    callNext,
    startServing,
    completeEntry,
    cancelEntry
} = require("../services/queueService");

function joinQueueController(req, res, next) {
    try {
        const customerId = req.body && req.body.customerId;

        if (!customerId || typeof customerId !== "string" || customerId.trim() === "") {
            const error = new Error("Customer ID is required");
            error.statusCode = 400;
            throw error;
        }

        const entry = joinQueue(customerId.trim());
        res.json(entry);
    } catch (error) {
        next(error);
    }
}

function callNextController(req, res, next) {
    try {
        const entry = callNext();
        res.json(entry);
    } catch (error) {
        next(error);
    }
}

function startServingController(req, res, next) {
    try {
        const { id } = req.params;

        if (!id || typeof id !== "string" || id.trim() === "") {
            const error = new Error("Queue entry ID is required");
            error.statusCode = 400;
            throw error;
        }

        const entry = startServing(id.trim());
        res.json(entry);
    } catch (error) {
        next(error);
    }
}

function completeEntryController(req, res, next) {
    try {
        const { id } = req.params;

        if (!id || typeof id !== "string" || id.trim() === "") {
            const error = new Error("Queue entry ID is required");
            error.statusCode = 400;
            throw error;
        }

        const entry = completeEntry(id.trim());
        res.json(entry);
    } catch (error) {
        next(error);
    }
}

function cancelEntryController(req, res, next) {
    try {
        const { id } = req.params;

        if (!id || typeof id !== "string" || id.trim() === "") {
            const error = new Error("Queue entry ID is required");
            error.statusCode = 400;
            throw error;
        }

        const entry = cancelEntry(id.trim());
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