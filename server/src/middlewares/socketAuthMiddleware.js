const jwt = require("jsonwebtoken");

function socketAuth(socket, next) {
    const auth = socket.handshake.auth || {};
    const headers = socket.handshake.headers || {};

    let token = auth.token;

    if (!token && headers.authorization && typeof headers.authorization === "string") {
        if (headers.authorization.startsWith("Bearer ")) {
            token = headers.authorization.substring(7).trim();
        } else {
            token = headers.authorization.trim();
        }
    }

    if (!token || typeof token !== "string" || token.trim() === "") {
        const error = new Error("Authentication required");
        error.data = { code: "UNAUTHORIZED", message: "Authentication required" };
        return next(error);
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        const error = new Error("Server configuration error: JWT_SECRET is missing");
        error.data = { code: "SERVER_ERROR", message: "JWT configuration missing" };
        return next(error);
    }

    try {
        const decoded = jwt.verify(token.trim(), jwtSecret);

        if (!decoded || !decoded.userId) {
            const error = new Error("Invalid or expired token");
            error.data = { code: "INVALID_TOKEN", message: "Invalid token payload" };
            return next(error);
        }

        socket.user = {
            userId: decoded.userId,
            role: decoded.role || "USER"
        };

        next();
    } catch (err) {
        const error = new Error("Invalid or expired token");
        error.data = { code: "INVALID_TOKEN", message: err.message };
        return next(error);
    }
}

module.exports = {
    socketAuth
};
