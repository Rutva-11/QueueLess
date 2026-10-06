const path = require("path");
require("dotenv").config({
    path: path.resolve(__dirname, "../.env")
});

const express = require("express");
const queueRoutes = require("./routes/queueRoutes");
const authRoutes = require("./routes/authRoutes");
const connectDatabase = require("./config/database");

const errorHandler = require("./middlewares/errorHandler");

const app = express();

app.use(express.json());

app.use("/api/auth", authRoutes);

const PORT = 3000;

app.get("/", (req, res) => {
    res.send("QueueLess API is running");
});

app.use("/api/queue", queueRoutes);

app.use(errorHandler);

connectDatabase();

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});