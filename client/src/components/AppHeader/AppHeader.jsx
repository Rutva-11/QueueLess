import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import "./AppHeader.css";

/**
 * AppHeader — calm, editorial header.
 * Quiet. Simple. Functional.
 */
export default function AppHeader({
    serviceName = ""
}) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    return (
        <header className="app-header">
            <div className="header-inner">
                <div className="header-brand-block">
                    <span className="brand-title">QueueLess</span>
                    <span className="service-subtitle">
                        The Garden Table{serviceName ? ` · ${serviceName}` : " · Walk-in Dining"}
                    </span>
                </div>

                {user && (
                    <div className="header-user-block">
                        <div className="user-info">
                            <span className="user-display-name">{user.name}</span>
                            <span className="user-role-label">
                                {user.role === "STAFF" || user.role === "ADMIN" ? user.role : "Account"}
                            </span>
                        </div>
                        <button
                            type="button"
                            className="header-signout-btn"
                            onClick={handleLogout}
                            aria-label="Sign out"
                        >
                            Sign out
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
}
