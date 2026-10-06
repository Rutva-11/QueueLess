const queue = [];
let tokenCounter = 1;

const transitions = {
    WAITING: ["CALLED", "CANCELLED"],
    CALLED: ["SERVING", "SKIPPED", "CANCELLED", "NO_SHOW"],
    SERVING: ["COMPLETED"]
};

function canTransition(currentStatus, nextStatus) {
    const allowedStatuses = transitions[currentStatus];

    if (!allowedStatuses) {
        return false;
    }

    for (let i = 0; i < allowedStatuses.length; i++) {
        if (allowedStatuses[i] === nextStatus) {
            return true;
        }
    }

    return false;
}

function joinQueue(customerId) {
    for (let i = 0; i < queue.length; i++) {
        if (
            queue[i].customerId === customerId &&
            ["WAITING", "CALLED", "SERVING"].includes(queue[i].status)
        ) {
            throw new Error("Customer already has an active queue entry");
        }
    }

    const entry = {
        id: `entry-${tokenCounter}`,
        customerId: customerId,
        token: `A-${String(tokenCounter).padStart(3, "0")}`,
        status: "WAITING"
    };

    queue.push(entry);
    tokenCounter++;

    return entry;
}

function callNext() {
    for (let i = 0; i < queue.length; i++) {
        if (queue[i].status === "WAITING") {
            if (!canTransition(queue[i].status, "CALLED")) {
                throw new Error("Invalid status transition");
            }

            queue[i].status = "CALLED";

            return queue[i];
        }
    }

    return null;
}

function startServing(entryId) {
    for (let i = 0; i < queue.length; i++) {
        if (queue[i].id === entryId) {

            if (!canTransition(queue[i].status, "SERVING")) {
                throw new Error("Invalid status transition");
            }

            queue[i].status = "SERVING";

            return queue[i];
        }
    }

    throw new Error("Queue entry not found");
}

function completeEntry(entryId) {
    for (let i = 0; i < queue.length; i++) {
        if (queue[i].id === entryId) {

            if (!canTransition(queue[i].status, "COMPLETED")) {
                throw new Error("Invalid status transition");
            }

            queue[i].status = "COMPLETED";

            return queue[i];
        }
    }

    throw new Error("Queue entry not found");
}

function cancelEntry(entryId) {
    for (let i = 0; i < queue.length; i++) {
        if (queue[i].id === entryId) {

            if (!canTransition(queue[i].status, "CANCELLED")) {
                throw new Error("Invalid status transition");
            }

            queue[i].status = "CANCELLED";

            return queue[i];
        }
    }

    throw new Error("Queue entry not found");
}

module.exports = {
    joinQueue,
    callNext,
    startServing,
    completeEntry,
    cancelEntry
};