const {
    getAllServices,
    joinQueue,
    callNext,
    startServing,
    completeEntry,
    cancelEntry,
    getServiceQueue,
    getMyQueueEntry
} = require("../services/queueService");

const {
    emitQueueJoined,
    emitQueueCalled,
    emitQueueStarted,
    emitQueueCompleted,
    emitQueueCancelled
} = require("../sockets/queueEmitter");

async function getServicesController(req, res, next) {
    try {
        const services = await getAllServices();
        res.json(services);
    } catch (error) {
        next(error);
    }
}

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
        emitQueueJoined(entry);
        res.status(201).json(entry);
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

        if (!entry) {
            return res.json({ message: "No one is waiting in the queue" });
        }

        emitQueueCalled(entry);
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
        emitQueueStarted(entry);
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
        emitQueueCompleted(entry);
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

        const entry = await cancelEntry(id.trim(), req.user);
        emitQueueCancelled(entry);
        res.json(entry);
    } catch (error) {
        next(error);
    }
}

async function getServiceQueueController(req, res, next) {
    try {
        const { serviceId } = req.params;

        if (!serviceId || typeof serviceId !== "string" || serviceId.trim() === "") {
            const error = new Error("Service ID is required");
            error.statusCode = 400;
            throw error;
        }

        const entries = await getServiceQueue(serviceId.trim());
        res.json(entries);
    } catch (error) {
        next(error);
    }
}

async function getMyQueueEntryController(req, res, next) {
    try {
        if (!req.user || !req.user.userId) {
            const error = new Error("Authentication required");
            error.statusCode = 401;
            throw error;
        }

        const entry = await getMyQueueEntry(req.user.userId);
        res.json(entry);
    } catch (error) {
        next(error);
    }
}

module.exports = {
    getServicesController,
    joinQueueController,
    callNextController,
    startServingController,
    completeEntryController,
    cancelEntryController,
    getServiceQueueController,
    getMyQueueEntryController
};