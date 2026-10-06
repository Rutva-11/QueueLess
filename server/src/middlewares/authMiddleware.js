const jwt = require("jsonwebtoken");

function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
        const error = new Error("Authentication required");
        error.statusCode = 401;
        return next(error);
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        const error = new Error("Server configuration error: JWT_SECRET is missing");
        error.statusCode = 500;
        return next(error);
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
        const error = new Error("Authentication required");
        error.statusCode = 401;
        return next(error);
    }

    try {
        const decoded = jwt.verify(token, jwtSecret);
        req.user = decoded;
        next();
    } catch (err) {
        const error = new Error("Invalid or expired token");
        error.statusCode = 401;
        return next(error);
    }
}

module.exports = {
    authenticate
};
