const express = require("express");

const {
    getServicesController,
    joinQueueController,
    callNextController,
    callSpecificController,
    startServingController,
    completeEntryController,
    cancelEntryController,
    getServiceQueueController,
    getMyQueueEntryController,
    getServiceHistoryController
} = require("../controllers/queueController");

const { authenticate } = require("../middlewares/authMiddleware");
const { requireRole } = require("../middlewares/roleMiddleware");

const router = express.Router();

// Read APIs
router.get("/services", authenticate, getServicesController);
router.get("/my", authenticate, getMyQueueEntryController);
router.get("/service/:serviceId", authenticate, getServiceQueueController);
router.get("/service/:serviceId/history", authenticate, requireRole("STAFF", "ADMIN"), getServiceHistoryController);

// Queue operations
router.post("/join", authenticate, joinQueueController);
router.post("/call-next", authenticate, requireRole("STAFF", "ADMIN"), callNextController);
router.post("/:id/call", authenticate, requireRole("STAFF", "ADMIN"), callSpecificController);
router.post("/:id/start", authenticate, requireRole("STAFF", "ADMIN"), startServingController);
router.post("/:id/complete", authenticate, requireRole("STAFF", "ADMIN"), completeEntryController);
router.post("/:id/cancel", authenticate, cancelEntryController);

console.log("Queue routes loaded");

module.exports = router;