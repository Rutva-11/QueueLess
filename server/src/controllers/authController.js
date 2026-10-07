const {
    customerCheckIn,
    registerUser,
    loginUser
} = require("../services/authService");

async function customerCheckInController(req, res, next) {
    try {
        const { name, email } = req.body || {};
        const authData = await customerCheckIn(name, email);
        res.status(200).json(authData);
    } catch (error) {
        next(error);
    }
}

async function registerController(req, res, next) {
    try {
        const { name, email, password } = req.body || {};
        if (password) {
            const user = await registerUser(name, email, password);
            return res.status(201).json(user);
        }
        const authData = await customerCheckIn(name, email);
        return res.status(200).json(authData);
    } catch (error) {
        next(error);
    }
}

async function loginController(req, res, next) {
    try {
        const { email, password } = req.body || {};
        const authData = await loginUser(email, password);
        res.status(200).json(authData);
    } catch (error) {
        next(error);
    }
}

module.exports = {
    customerCheckInController,
    registerController,
    loginController
};
