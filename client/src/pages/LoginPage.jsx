import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import "./Auth.css";

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();

    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (!email.trim() || !password) {
            setError("Please enter your email and password.");
            return;
        }

        setLoading(true);

        try {
            const user = await login(email.trim(), password);
            const userRole = (user?.role || "").toUpperCase();
            if (userRole === "STAFF" || userRole === "ADMIN") {
                navigate("/staff", { replace: true });
            } else {
                navigate("/dashboard", { replace: true });
            }
        } catch (err) {
            const status = err?.response?.status;
            const backendMsg = err?.response?.data?.error || err?.response?.data?.message;

            if (status === 401) {
                setError(backendMsg || "Incorrect email or password. Please try again.");
            } else if (status === 403) {
                setError(backendMsg || "Access denied. Please check your credentials.");
            } else if (status === 404) {
                setError("Account not found. Please verify your email.");
            } else if (status >= 500) {
                setError("Server temporarily unavailable. Please try again shortly.");
            } else if (!err.response) {
                setError("Cannot connect to server. Please check your network.");
            } else {
                setError(backendMsg || "Sign in failed. Please try again.");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-box">
                <div className="auth-brand">
                    <span className="auth-wordmark">QueueLess</span>
                    <span className="auth-tagline">The Garden Table · Host Stand</span>
                </div>

                <h1 className="auth-title">Host & Staff sign in</h1>
                <p className="auth-subtitle">Sign in to manage the dining waitlist, seat guests, and clear tables.</p>

                <form className="auth-form" onSubmit={handleSubmit} noValidate>
                    <div className="field-group">
                        <label htmlFor="staff-email" className="field-label">Host or staff email</label>
                        <input
                            id="staff-email"
                            type="email"
                            className="field-input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="host@gardentable.com"
                            autoComplete="email"
                            required
                            disabled={loading}
                        />
                    </div>

                    <div className="field-group">
                        <label htmlFor="staff-password" className="field-label">Password</label>
                        <input
                            id="staff-password"
                            type="password"
                            className="field-input"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            required
                            disabled={loading}
                        />
                    </div>

                    {error && (
                        <p className="auth-error" role="alert">
                            {error}
                        </p>
                    )}

                    <button
                        type="submit"
                        className="auth-btn-primary"
                        disabled={loading || !email.trim() || !password}
                    >
                        {loading ? "Signing in…" : "Sign in"}
                    </button>
                </form>

                <p className="auth-switch">
                    Guest joining the waitlist?{" "}
                    <Link to="/" className="auth-link">Find your place at the table</Link>
                </p>
            </div>
        </div>
    );
}
