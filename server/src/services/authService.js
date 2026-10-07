const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Customer Passwordless Check-in
 * Reuses existing USER identity or creates a new one.
 * Never allows passwordless access to STAFF or ADMIN accounts.
 */
async function customerCheckIn(name, email) {
    if (!name || typeof name !== "string" || name.trim() === "") {
        const error = new Error("Name is required");
        error.statusCode = 400;
        throw error;
    }

    if (!email || typeof email !== "string" || email.trim() === "") {
        const error = new Error("Email is required");
        error.statusCode = 400;
        throw error;
    }

    const normalizedEmail = email.toLowerCase().trim();

    let user = await User.findOne({ email: normalizedEmail });

    if (user) {
        // Prevent passwordless authentication for staff or admin accounts
        if (user.role === "STAFF" || user.role === "ADMIN") {
            const error = new Error("This email is registered as a staff account. Please use staff sign-in.");
            error.statusCode = 403;
            throw error;
        }

        // Update customer name if provided
        if (name.trim() && user.name !== name.trim()) {
            user.name = name.trim();
            await user.save();
        }
    } else {
        // Create new USER customer without password
        user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            role: "USER"
        });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        const error = new Error("Server configuration error: JWT_SECRET is missing");
        error.statusCode = 500;
        throw error;
    }

    const payload = {
        userId: user._id,
        role: user.role
    };

    const options = {};
    if (process.env.JWT_EXPIRES_IN) {
        options.expiresIn = process.env.JWT_EXPIRES_IN;
    }

    const token = jwt.sign(payload, jwtSecret, options);

    return {
        token,
        user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role
        }
    };
}

async function registerUser(name, email, password) {
    if (!name || typeof name !== "string" || name.trim() === "") {
        const error = new Error("Name is required");
        error.statusCode = 400;
        throw error;
    }

    if (!email || typeof email !== "string" || email.trim() === "") {
        const error = new Error("Email is required");
        error.statusCode = 400;
        throw error;
    }

    if (!password || typeof password !== "string" || password.trim() === "") {
        const error = new Error("Password is required");
        error.statusCode = 400;
        throw error;
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
        const error = new Error("User already exists");
        error.statusCode = 409;
        throw error;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
        name: name.trim(),
        email: normalizedEmail,
        passwordHash,
        role: "USER"
    });

    const userObj = user.toObject();
    delete userObj.passwordHash;

    return userObj;
}

async function loginUser(email, password) {
    if (!email || typeof email !== "string" || email.trim() === "") {
        const error = new Error("Email is required");
        error.statusCode = 400;
        throw error;
    }

    if (!password || typeof password !== "string" || password.trim() === "") {
        const error = new Error("Password is required");
        error.statusCode = 400;
        throw error;
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
        const error = new Error("Invalid email or password");
        error.statusCode = 401;
        throw error;
    }

    if (!user.passwordHash) {
        const error = new Error("Invalid email or password");
        error.statusCode = 401;
        throw error;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
        const error = new Error("Invalid email or password");
        error.statusCode = 401;
        throw error;
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
        const error = new Error("Server configuration error: JWT_SECRET is missing");
        error.statusCode = 500;
        throw error;
    }

    const payload = {
        userId: user._id,
        role: user.role
    };

    const options = {};
    if (process.env.JWT_EXPIRES_IN) {
        options.expiresIn = process.env.JWT_EXPIRES_IN;
    }

    const token = jwt.sign(payload, jwtSecret, options);

    return {
        token,
        user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role
        }
    };
}

module.exports = {
    customerCheckIn,
    registerUser,
    loginUser
};
