const express = require("express");
const {
    customerCheckInController,
    registerController,
    loginController
} = require("../controllers/authController");

const router = express.Router();

router.post("/customer/check-in", customerCheckInController);
router.post("/register", registerController);
router.post("/login", loginController);

module.exports = router;
