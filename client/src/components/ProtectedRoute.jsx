import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";

/**
 * ProtectedRoute — guards routes that require authentication and role authorization.
 * @param {string[]} roles - If provided, only these roles can access the route.
 */
export default function ProtectedRoute({ children, roles }) {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "100vh",
                gap: "0.5rem"
            }}>
                <span className="loading-dot" />
                <span className="loading-dot" />
                <span className="loading-dot" />
            </div>
        );
    }

    if (!user) {
        const isStaffRoute = roles && (roles.includes("STAFF") || roles.includes("ADMIN"));
        return <Navigate to={isStaffRoute ? "/login" : "/"} replace />;
    }

    if (roles && roles.length > 0) {
        const userRole = (user.role || "").toUpperCase();
        const normalizedRoles = roles.map(r => r.toUpperCase());

        // Allow "USER" to match "CUSTOMER" and vice versa
        const isAuthorized = normalizedRoles.includes(userRole) ||
            (normalizedRoles.includes("CUSTOMER") && userRole === "USER") ||
            (normalizedRoles.includes("USER") && userRole === "CUSTOMER");

        if (!isAuthorized) {
            const isStaffRole = userRole === "STAFF" || userRole === "ADMIN";
            return <Navigate to={isStaffRole ? "/staff" : "/dashboard"} replace />;
        }
    }

    return children;
}
