const express = require("express");

const {
    joinQueueController,
    callNextController,
    startServingController,
    completeEntryController,
    cancelEntryController
} = require("../controllers/queueController");

const router = express.Router();

router.post("/join", joinQueueController);
router.post("/call-next", callNextController);
router.post("/:id/start", startServingController);
router.post("/:id/complete", completeEntryController);
router.post("/:id/cancel", cancelEntryController);

console.log("Queue routes loaded");

module.exports = router;