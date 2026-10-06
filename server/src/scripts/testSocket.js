/**
 * Temporary development test client for Socket.IO connection verification.
 * Uses Node's built-in WebSocket to test handshake, connect, and disconnect.
 */

const SERVER_URL = process.env.SERVER_URL || "ws://localhost:3000/socket.io/?EIO=4&transport=websocket";

console.log(`Connecting to Socket.IO server at ${SERVER_URL}...`);

const ws = new WebSocket(SERVER_URL);

ws.onopen = () => {
    console.log("Underlying transport connected.");
};

ws.onmessage = (event) => {
    const data = String(event.data);

    if (data.startsWith("0")) {
        // Engine.IO open packet: send Socket.IO CONNECT packet (40)
        ws.send("40");
    } else if (data.startsWith("40")) {
        // Socket.IO connect packet: 40{"sid":"..."}
        try {
            const payload = JSON.parse(data.slice(2));
            console.log(`Socket.IO connected successfully! Socket ID: ${payload.sid}`);
        } catch {
            console.log(`Socket.IO connected: ${data}`);
        }

        // Disconnect cleanly after short pause
        setTimeout(() => {
            console.log("Disconnecting socket client...");
            ws.close();
        }, 300);
    }
};

ws.onclose = () => {
    console.log("Socket client disconnected cleanly.");
    process.exit(0);
};

ws.onerror = (err) => {
    console.error("Socket connection error:", err);
    process.exit(1);
};
