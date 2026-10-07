import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import "./Auth.css";

export default function CheckInPage() {
    const { checkIn } = useAuth();
    const navigate = useNavigate();

    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError("");

        if (!name.trim()) {
            setError("Please enter your party name.");
            return;
        }

        if (!email.trim()) {
            setError("Please enter your email address.");
            return;
        }

        setLoading(true);

        try {
            await checkIn(name.trim(), email.trim());
            navigate("/dashboard", { replace: true });
        } catch (err) {
            const status = err?.response?.status;
            const backendMsg = err?.response?.data?.error || err?.response?.data?.message;

            if (status === 403) {
                setError(backendMsg || "This email is registered as a staff account. Please use staff sign-in.");
            } else if (status === 400) {
                setError(backendMsg || "Please check your name and email address.");
            } else if (status === 409) {
                setError(backendMsg || "You already have an active session. Please proceed.");
            } else if (status >= 500) {
                setError("Server temporarily unavailable. Please try again shortly.");
            } else if (!err.response) {
                setError("Cannot connect to server. Please check your network.");
            } else {
                setError(backendMsg || "Check-in failed. Please try again.");
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
                    <span className="auth-tagline">The Garden Table · Walk-in Dining</span>
                </div>

                <h1 className="auth-title">Find your place at the table</h1>
                <p className="auth-subtitle">Join the walk-in waiting list and we'll alert you when your table is ready.</p>

                <form className="auth-form" onSubmit={handleSubmit} noValidate>
                    <div className="field-group">
                        <label htmlFor="customer-name" className="field-label">Party name</label>
                        <input
                            id="customer-name"
                            type="text"
                            className="field-input"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Jane Smith"
                            autoComplete="name"
                            required
                            disabled={loading}
                        />
                    </div>

                    <div className="field-group">
                        <label htmlFor="customer-email" className="field-label">Email address</label>
                        <input
                            id="customer-email"
                            type="email"
                            className="field-input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            autoComplete="email"
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
                        disabled={loading || !name.trim() || !email.trim()}
                    >
                        {loading ? "Joining list…" : "Join the waiting list"}
                    </button>
                </form>

                <p className="auth-switch">
                    Host or staff member?{" "}
                    <Link to="/login" className="auth-link">Host sign in</Link>
                </p>
            </div>
        </div>
    );
}
