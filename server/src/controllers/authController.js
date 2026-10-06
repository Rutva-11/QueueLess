const { registerUser, loginUser } = require("../services/authService");

async function registerController(req, res, next) {
    try {
        const { name, email, password } = req.body || {};
        const user = await registerUser(name, email, password);
        res.status(201).json(user);
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
    registerController,
    loginController
};
