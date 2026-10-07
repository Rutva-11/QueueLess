import React, { createContext, useState, useCallback } from "react";
import { authAPI } from "../api/client";

export const AuthContext = createContext(null);

function getInitialToken() {
    return localStorage.getItem("token") || localStorage.getItem("ql_token") || null;
}

function getInitialUser(token) {
    if (!token) return null;
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

    const logout = useCallback(() => {
        localStorage.removeItem("token");
        localStorage.removeItem("ql_token");
        localStorage.removeItem("ql_user");
        setToken(null);
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider value={{ user, token, loading, checkIn, login, register, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export { useAuth } from "./useAuth";
export default AuthProvider;
