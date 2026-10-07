const path = require("path");
require("dotenv").config({
    path: path.resolve(__dirname, "../.env")
});

const http = require("http");
const express = require("express");
const cors = require("cors");
const queueRoutes = require("./routes/queueRoutes");
const authRoutes = require("./routes/authRoutes");
const connectDatabase = require("./config/database");

const errorHandler = require("./middlewares/errorHandler");
const { initSocketServer } = require("./sockets/socketServer");

const app = express();

function isAllowedOrigin(origin) {
    if (!origin) return true;
    if (process.env.CLIENT_ORIGIN) {
        const configured = process.env.CLIENT_ORIGIN.split(",").map((o) => o.trim());
        if (configured.includes(origin)) return true;
    }
    if (origin === "http://localhost:5173" || origin === "http://localhost:5174" || origin === "http://127.0.0.1:5173" || origin === "http://127.0.0.1:5174") {
        return true;
    }
    if (process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return true;
    }
    return false;
}

const corsOptions = {
    origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());

app.use("/api/auth", authRoutes);

const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
    res.send("QueueLess API is running");
});

app.use("/api/queue", queueRoutes);

app.use(errorHandler);

connectDatabase();

const server = http.createServer(app);
initSocketServer(server);

server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});