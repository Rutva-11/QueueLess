import React, { createContext, useState, useCallback, useEffect } from "react";
import { authAPI } from "../api/client";

export const AuthContext = createContext(null);

function isTokenExpired(token) {
    if (!token || typeof token !== "string") return true;
    try {
        const parts = token.split(".");
        if (parts.length !== 3) return true;
        const payload = JSON.parse(atob(parts[1]));
        if (!payload.exp) return false;
        return payload.exp * 1000 <= Date.now();
    } catch {
        return true;
    }
}

function getInitialToken() {
    const token = localStorage.getItem("token") || localStorage.getItem("ql_token") || null;
    if (token && isTokenExpired(token)) {
        localStorage.removeItem("token");
        localStorage.removeItem("ql_token");
        localStorage.removeItem("ql_user");
        return null;
    }
    return token;
}

function getInitialUser(token) {
    if (!token || isTokenExpired(token)) {
        localStorage.removeItem("token");
        localStorage.removeItem("ql_token");
        localStorage.removeItem("ql_user");
        return null;
    }
    try {
        const savedUser = localStorage.getItem("ql_user");
        if (savedUser) {
            return JSON.parse(savedUser);
        }
        const payload = JSON.parse(atob(token.split(".")[1]));
        return {
            id: payload.userId || payload.id,
            role: payload.role || "USER",
            name: payload.name || "Customer"
        };
    } catch {
        localStorage.removeItem("token");
        localStorage.removeItem("ql_token");
        localStorage.removeItem("ql_user");
        return null;
    }
}

export function AuthProvider({ children }) {
    const [token, setToken] = useState(getInitialToken);
    const [user, setUser] = useState(() => getInitialUser(token));
    const [loading] = useState(false);

    const logout = useCallback(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("ql_token");
        localStorage.removeItem("ql_user");
        setToken(null);
        setUser(null);
    }, []);

    // Listen for global auth expiration events (e.g. from Axios or Socket.IO)
    useEffect(() => {
        const handleAuthExpired = () => {
            logout();
        };
        window.addEventListener("auth:expired", handleAuthExpired);
        return () => window.removeEventListener("auth:expired", handleAuthExpired);
    }, [logout]);

    const checkIn = useCallback(async (name, email) => {
        const res = await authAPI.checkIn({ name, email });
        const { token: jwt, user: userData } = res.data;
        localStorage.setItem("token", jwt);
        localStorage.setItem("ql_token", jwt);
        localStorage.setItem("ql_user", JSON.stringify(userData));
        setToken(jwt);
        setUser(userData);
        return userData;
    }, []);

    const login = useCallback(async (email, password) => {
        const res = await authAPI.login({ email, password });
        const { token: jwt, user: userData } = res.data;
        localStorage.setItem("token", jwt);
        localStorage.setItem("ql_token", jwt);
        localStorage.setItem("ql_user", JSON.stringify(userData));
        setToken(jwt);
        setUser(userData);
        return userData;
    }, []);

    const register = useCallback(async (name, email, password, role = "USER") => {
        // Backend creates user
        await authAPI.register({ name, email, password, role });
        // Automatically sign in to obtain authenticated session
        return await login(email, password);
    }, [login]);

    return (
        <AuthContext.Provider value={{ user, token, loading, checkIn, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export { useAuth } from "./useAuth";
export default AuthProvider;
