const { Server } = require("socket.io");
const { socketAuth } = require("../middlewares/socketAuthMiddleware");

let io = null;

function initSocketServer(httpServer) {
    io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    // Enforce JWT authentication on all incoming connections
    io.use(socketAuth);

    io.on("connection", (socket) => {
        const userId = socket.user?.userId;
        const role = socket.user?.role;

        console.log(`Socket connected: ${socket.id} (user: ${userId}, role: ${role})`);

        // Automatically join private user room
        if (userId) {
            socket.join(`user:${userId}`);
        }

        // Automatically join staff room if user has STAFF or ADMIN role
        if (role === "STAFF" || role === "ADMIN") {
            socket.join("staff");
        }

        // Send connection acknowledgement to client with authenticated identity
        socket.emit("connected", {
            socketId: socket.id,
            userId,
            role
        });

        // Client joins a specific service's room for live queue updates
        socket.on("join:service", (serviceId, callback) => {
            if (!serviceId || typeof serviceId !== "string" || serviceId.trim() === "") {
                if (typeof callback === "function") {
                    callback({ success: false, error: "Service ID is required" });
                }
                return;
            }
            const room = `service:${serviceId.trim()}`;
            socket.join(room);
            console.log(`Socket ${socket.id} joined room ${room}`);
            if (typeof callback === "function") {
                callback({ success: true, room });
            }
        });

        // Client leaves a specific service's room
        socket.on("leave:service", (serviceId, callback) => {
            if (!serviceId || typeof serviceId !== "string" || serviceId.trim() === "") {
                if (typeof callback === "function") {
                    callback({ success: false, error: "Service ID is required" });
                }
                return;
            }
            const room = `service:${serviceId.trim()}`;
            socket.leave(room);
            console.log(`Socket ${socket.id} left room ${room}`);
            if (typeof callback === "function") {
                callback({ success: true, room });
            }
        });

        socket.on("disconnect", (reason) => {
            console.log(`Socket disconnected: ${socket.id} (${reason})`);
        });
    });

    return io;
}

function getIO() {
    if (!io) {
        throw new Error("Socket.IO has not been initialized");
    }
    return io;
}

module.exports = {
    initSocketServer,
    getIO
};
