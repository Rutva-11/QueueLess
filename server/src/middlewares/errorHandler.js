function errorHandler(err, req, res, next) {
    let statusCode = err.statusCode || 500;
    let errorMessage = err.message || "Internal Server Error";

    if (
        err.message === "Queue entry not found" ||
        err.message === "User not found" ||
        err.message === "Service not found"
    ) {
        statusCode = 404;
    } else if (
        err.message === "Customer already has an active queue entry" ||
        err.message === "Invalid status transition" ||
        err.code === 11000
    ) {
        statusCode = 409;
        if (err.code === 11000) {
            errorMessage = "Customer already has an active queue entry";
        }
    } else if (err.name === "CastError") {
        statusCode = 400;
        errorMessage = "Invalid ID format";
    }

    res.status(statusCode).json({
        error: errorMessage
    });
}

module.exports = errorHandler;
