function errorHandler(err, req, res, next) {
    let statusCode = err.statusCode || 500;

    if (err.message === "Queue entry not found") {
        statusCode = 404;
    } else if (
        err.message === "Customer already has an active queue entry" ||
        err.message === "Invalid status transition"
    ) {
        statusCode = 409;
    }

    res.status(statusCode).json({
        error: err.message || "Internal Server Error"
    });
}

module.exports = errorHandler;
