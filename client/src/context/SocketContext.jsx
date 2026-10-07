import React, { createContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./useAuth";

export const SocketContext = createContext(null);

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:3000";

export function SocketProvider({ children }) {
    const { token, user } = useAuth();
    const [socket, setSocket] = useState(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        // Only establish real-time socket when user is authenticated
        if (!token || !user) {
            setConnected(false);
            setSocket(null);
            return;
        }

        const socketInstance = io(SOCKET_URL, {
            auth: { token },
            transports: ["websocket", "polling"],
            reconnectionAttempts: 5,
            reconnectionDelay: 1000
        });

        socketInstance.on("connect", () => {
            setConnected(true);
        });

        socketInstance.on("connected", (data) => {
            setConnected(true);
            if (import.meta.env.DEV) {
                console.log("[Socket] Connected identity:", data);
            }
        });

        socketInstance.on("disconnect", () => {
            setConnected(false);
        });

        socketInstance.on("connect_error", (err) => {
            console.warn("[Socket] connection error:", err.message);
            setConnected(false);
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
            setSocket(null);
            setConnected(false);
        };
    }, [token, user]);

    return (
        <SocketContext.Provider value={{ socket, connected }}>
            {children}
        </SocketContext.Provider>
    );
}

export { useSocket } from "./useSocket";
export default SocketProvider;
