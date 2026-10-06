require("dotenv").config();

const express = require("express");
const queueRoutes = require("./routes/queueRoutes");
const connectDatabase = require("./config/database");

const errorHandler = require("./middlewares/errorHandler");

const app = express();

app.use(express.json());

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