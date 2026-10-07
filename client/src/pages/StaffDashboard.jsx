import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { useSocket } from "../context/useSocket";
import { queueAPI } from "../api/client";
import "./StaffDashboard.css";

/* ─── Status label map ─────────────────────────────────── */
const STATUS_LABELS = {
    WAITING: "Waiting",
    CALLED: "Table ready",
    SERVING: "Seated",
    COMPLETED: "Cleared",
    CANCELLED: "Removed",
};

function StatusDot({ status }) {
    return (
        <span
            className={`sdot sdot--${status.toLowerCase()}`}
            aria-label={STATUS_LABELS[status] || status}
        />
    );
}

function StatusText({ status }) {
    return (
        <span className={`stext stext--${status.toLowerCase()}`}>
            {STATUS_LABELS[status] || status}
        </span>
    );
}

/* ─── Helpers ──────────────────────────────────────────── */
function fmtTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

function getCustomerName(entry) {
    if (!entry) return "—";
    const u = entry.userId;
    if (typeof u === "object" && u !== null) return u.name || u.email || "Party";
    return "Party";
}

/* ─── Component ────────────────────────────────────────── */
export default function StaffDashboard() {
    const { user, logout } = useAuth();
    const { socket, connected } = useSocket();
    const navigate = useNavigate();

    const DEMO_SERVICE_ID = import.meta.env.VITE_DEMO_SERVICE_ID || null;

    const [_services, setServices] = useState([]);
    const [serviceId, setServiceId] = useState(DEMO_SERVICE_ID || "");
    const [serviceName, setServiceName] = useState("Main Dining");

    const [queue, setQueue] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [actionLoading, setActionLoading] = useState({});

    /* ── Load available services ─────────────────────────── */
    useEffect(() => {
        queueAPI
            .services()
            .then((res) => {
                const list = Array.isArray(res.data) ? res.data : [];
                setServices(list);
                if (!serviceId && list.length > 0) {
                    setServiceId(list[0]._id);
                    setServiceName(list[0].name);
                } else {
                    const found = list.find((s) => s._id === serviceId);
                    if (found) setServiceName(found.name);
                }
            })
            .catch(() => {});
    }, [serviceId]);

    /* ── Fetch queue for the selected service ────────────── */
    const fetchQueue = useCallback(async (showSpinner = false) => {
        if (!serviceId) {
            setError("No service selected. Set VITE_DEMO_SERVICE_ID in client/.env.");
            setLoading(false);
            return;
        }
        if (showSpinner) setLoading(true);
        try {
            setError("");
            const res = await queueAPI.serviceQueue(serviceId);
            // API returns a plain array
            const raw = Array.isArray(res.data) ? res.data : [];
            setQueue(raw);
        } catch (err) {
            setError(
                err?.response?.data?.message ||
                    err?.response?.data?.error ||
                    "Failed to load the waiting list. Please try again."
            );
        } finally {
            setLoading(false);
        }
    }, [serviceId]);

    useEffect(() => {
        fetchQueue(true);
    }, [fetchQueue]);

    /* ── Socket real-time refresh ────────────────────────── */
    useEffect(() => {
        if (!socket) return;
        const refresh = () => fetchQueue();
        const events = ["queue:joined", "queue:called", "queue:started", "queue:completed", "queue:cancelled"];
        events.forEach((e) => socket.on(e, refresh));
        return () => events.forEach((e) => socket.off(e, refresh));
    }, [socket, fetchQueue]);

    /* ── Action helpers ──────────────────────────────────── */
    const withLoading = useCallback(async (key, fn) => {
        setActionLoading((prev) => ({ ...prev, [key]: true }));
        try {
            await fn();
            await fetchQueue();
        } catch (err) {
            setError(
                err?.response?.data?.message ||
                    err?.response?.data?.error ||
                    "Action failed. Please try again."
            );
        } finally {
            setActionLoading((prev) => ({ ...prev, [key]: false }));
        }
    }, [fetchQueue]);

    const handleCallNext = () =>
        withLoading("call-next", () => queueAPI.callNext(serviceId));

    const handleStart = (entryId) =>
        withLoading(entryId, () => queueAPI.startServing(entryId));

    const handleComplete = (entryId) =>
        withLoading(entryId, () => queueAPI.complete(entryId));

    const handleCancel = (entryId) =>
        withLoading(entryId, () => queueAPI.cancel(entryId));

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    /* ── Derived queue segments ──────────────────────────── */
    const serving = queue.filter((e) => e.status === "SERVING");
    const called  = queue.filter((e) => e.status === "CALLED");
    const waiting = queue.filter((e) => e.status === "WAITING");
    const past    = queue.filter((e) => ["COMPLETED", "CANCELLED"].includes(e.status));

    // "Current" is whoever is SERVING, then CALLED if none serving
    const current = serving[0] || called[0] || null;
    // Next in line: first WAITING, or remaining CALLED entries
    const nextUp = waiting[0] || null;
    // All waiting shown in the list
    const waitingList = waiting;
    const calledList  = called.filter((e) => e !== current);

    const waitingCount = waiting.length;
    const canCallNext  = !!serviceId && waitingCount > 0 && !actionLoading["call-next"];

    /* ── Render ──────────────────────────────────────────── */
    return (
        <div className="sd-shell">
            {/* ── Top bar ─────────────────────────────────── */}
            <header className="sd-topbar">
                <div className="sd-topbar-left">
                    <span className="sd-wordmark">The Garden Table</span>
                    <span className="sd-sep" aria-hidden>·</span>
                    <span className="sd-service-label">{serviceName}</span>
                </div>
                <div className="sd-topbar-right">
                    <span
                        className={`sd-live-pill ${connected ? "sd-live-pill--on" : "sd-live-pill--off"}`}
                        title={connected ? "Real-time connected" : "Disconnected"}
                    >
                        <span className="sd-live-dot" />
                        {connected ? "Live" : "Offline"}
                    </span>
                    {user?.name && (
                        <span className="sd-user-name">{user.name}</span>
                    )}
                    <button
                        className="sd-btn-ghost"
                        id="staff-sign-out-btn"
                        onClick={handleLogout}
                    >
                        Sign out
                    </button>
                </div>
            </header>

            {/* ── Page body ───────────────────────────────── */}
            <main className="sd-main">
                {/* ── Stats row ──────────────────────────── */}
                <div className="sd-stats-row">
                    <div className="sd-stat">
                        <span className="sd-stat-value">{waitingCount}</span>
                        <span className="sd-stat-label">waiting</span>
                    </div>
                    <div className="sd-stat">
                        <span className="sd-stat-value">{called.length}</span>
                        <span className="sd-stat-label">table ready</span>
                    </div>
                    <div className="sd-stat">
                        <span className="sd-stat-value">{serving.length}</span>
                        <span className="sd-stat-label">seated</span>
                    </div>
                    <div className="sd-stat sd-stat--faded">
                        <span className="sd-stat-value">{past.length}</span>
                        <span className="sd-stat-label">cleared today</span>
                    </div>
                </div>

                {/* ── Error banner ───────────────────────── */}
                {error && (
                    <div className="sd-error-bar" role="alert">
                        <span>{error}</span>
                        <button
                            className="sd-btn-ghost"
                            aria-label="Dismiss error"
                            onClick={() => setError("")}
                        >
                            ✕
                        </button>
                    </div>
                )}

                {/* ── Two-column layout ──────────────────── */}
                <div className="sd-body">
                    {/* ── LEFT: Current Table + Primary action ─── */}
                    <div className="sd-panel sd-panel--left">
                        {/* Current table block */}
                        <section className="sd-current-block">
                            <p className="sd-section-eyebrow">Current table</p>

                            {loading ? (
                                <LoadingDots />
                            ) : current ? (
                                <div className="sd-current-card">
                                    <div className="sd-current-token">
                                        {current.tokenLabel || `#${current.tokenNumber}`}
                                    </div>
                                    <div className="sd-current-meta">
                                        <span className="sd-current-name">
                                            {getCustomerName(current)}
                                        </span>
                                        <StatusText status={current.status} />
                                    </div>
                                    <p className="sd-current-time">
                                        {current.status === "CALLED" && "Table ready · Awaiting guests"}
                                        {current.status === "SERVING" && "Seated · Meal in progress"}
                                        {["WAITING"].includes(current.status) && `Joined list at ${fmtTime(current.createdAt)}`}
                                    </p>

                                    {/* Per-entry actions */}
                                    <div className="sd-current-actions">
                                        {current.status === "CALLED" && (
                                            <button
                                                className="sd-btn sd-btn--primary"
                                                id="staff-start-btn"
                                                onClick={() => handleStart(current._id)}
                                                disabled={!!actionLoading[current._id]}
                                            >
                                                {actionLoading[current._id] ? "…" : "Seat guests"}
                                            </button>
                                        )}
                                        {current.status === "SERVING" && (
                                            <button
                                                className="sd-btn sd-btn--primary"
                                                id="staff-complete-btn"
                                                onClick={() => handleComplete(current._id)}
                                                disabled={!!actionLoading[current._id]}
                                            >
                                                {actionLoading[current._id] ? "…" : "Clear table"}
                                            </button>
                                        )}
                                        {["WAITING", "CALLED", "SERVING"].includes(current.status) && (
                                            <button
                                                className="sd-btn sd-btn--cancel"
                                                id="staff-cancel-current-btn"
                                                onClick={() => handleCancel(current._id)}
                                                disabled={!!actionLoading[current._id]}
                                            >
                                                {actionLoading[current._id] ? "…" : "Remove from list"}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="sd-current-empty">
                                    <p className="sd-empty-primary">No table currently active.</p>
                                    <p className="sd-empty-secondary">
                                        Call the next party from the waiting list to begin.
                                    </p>
                                </div>
                            )}
                        </section>

                        {/* Divider */}
                        <div className="sd-divider" />

                        {/* Call next party block */}
                        <section className="sd-call-block">
                            {nextUp ? (
                                <div className="sd-next-preview">
                                    <p className="sd-section-eyebrow">Next party</p>
                                    <div className="sd-next-row">
                                        <span className="sd-next-token font-mono">
                                            {nextUp.tokenLabel || `#${nextUp.tokenNumber}`}
                                        </span>
                                        <span className="sd-next-name">
                                            {getCustomerName(nextUp)}
                                        </span>
                                        <StatusText status={nextUp.status} />
                                    </div>
                                </div>
                            ) : (
                                <p className="sd-section-eyebrow">
                                    {loading ? "" : "Waiting list is clear"}
                                </p>
                            )}

                            <button
                                className="sd-btn sd-btn--call-next"
                                id="staff-call-next-btn"
                                onClick={handleCallNext}
                                disabled={!canCallNext}
                            >
                                {actionLoading["call-next"] ? "Calling…" : "Call next party"}
                            </button>
                        </section>
                    </div>

                    {/* ── RIGHT: Waiting list ───────── */}
                    <div className="sd-panel sd-panel--right">
                        <section className="sd-queue-list-section">
                            <header className="sd-queue-list-header">
                                <p className="sd-section-eyebrow">
                                    Waiting list
                                    {waitingCount > 0 && (
                                        <span className="sd-count-badge">{waitingCount}</span>
                                    )}
                                </p>
                            </header>

                            {loading ? (
                                <LoadingDots />
                            ) : waitingList.length === 0 && calledList.length === 0 ? (
                                <div className="sd-empty-state">
                                    <p className="sd-empty-primary">No parties waiting.</p>
                                    <p className="sd-empty-secondary">
                                        Walk-in guests will appear here when they join the waiting list.
                                    </p>
                                </div>
                            ) : (
                                <div className="sd-queue-rows">
                                    {/* Called entries not yet serving */}
                                    {calledList.map((entry) => (
                                        <QueueRow
                                            key={entry._id}
                                            entry={entry}
                                            busy={!!actionLoading[entry._id]}
                                            onStart={handleStart}
                                            onCancel={handleCancel}
                                        />
                                    ))}
                                    {/* Waiting entries */}
                                    {waitingList.map((entry) => (
                                        <QueueRow
                                            key={entry._id}
                                            entry={entry}
                                            busy={!!actionLoading[entry._id]}
                                            onCancel={handleCancel}
                                        />
                                    ))}
                                </div>
                            )}
                        </section>

                        {/* Cleared today — collapsed at bottom */}
                        {past.length > 0 && (
                            <section className="sd-history-section">
                                <p className="sd-section-eyebrow sd-section-eyebrow--muted">
                                    Cleared today
                                    <span className="sd-count-badge sd-count-badge--muted">
                                        {past.length}
                                    </span>
                                </p>
                                <div className="sd-queue-rows sd-queue-rows--muted">
                                    {past.map((entry) => (
                                        <div key={entry._id} className="sd-row sd-row--muted">
                                            <span className="sd-row-token font-mono">
                                                {entry.tokenLabel || `#${entry.tokenNumber}`}
                                            </span>
                                            <span className="sd-row-name">
                                                {getCustomerName(entry)}
                                            </span>
                                            <StatusText status={entry.status} />
                                            <span className="sd-row-time">{fmtTime(entry.createdAt)}</span>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
}

/* ── Queue row sub-component ────────────────────────────── */
function QueueRow({ entry, busy, onStart, onComplete, onCancel }) {
    const id = entry._id;
    return (
        <div className={`sd-row sd-row--${entry.status.toLowerCase()}`}>
            <StatusDot status={entry.status} />
            <span className="sd-row-token font-mono">
                {entry.tokenLabel || `#${entry.tokenNumber}`}
            </span>
            <span className="sd-row-name">{getCustomerName(entry)}</span>
            <span className="sd-row-time">{fmtTime(entry.createdAt)}</span>
            <div className="sd-row-actions">
                {entry.status === "CALLED" && onStart && (
                    <button
                        className="sd-action-btn sd-action-btn--start"
                        onClick={() => onStart(id)}
                        disabled={busy}
                    >
                        {busy ? "…" : "Seat"}
                    </button>
                )}
                {entry.status === "SERVING" && onComplete && (
                    <button
                        className="sd-action-btn sd-action-btn--complete"
                        onClick={() => onComplete(id)}
                        disabled={busy}
                    >
                        {busy ? "…" : "Clear"}
                    </button>
                )}
                {["WAITING", "CALLED"].includes(entry.status) && onCancel && (
                    <button
                        className="sd-action-btn sd-action-btn--cancel"
                        onClick={() => onCancel(id)}
                        disabled={busy}
                    >
                        {busy ? "…" : "Remove"}
                    </button>
                )}
            </div>
        </div>
    );
}

/* ── Loading dots ───────────────────────────────────────── */
function LoadingDots() {
    return (
        <div className="sd-loading" aria-label="Loading">
            <span className="sd-loading-dot" />
            <span className="sd-loading-dot" />
            <span className="sd-loading-dot" />
        </div>
    );
}
