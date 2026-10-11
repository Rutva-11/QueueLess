import React, { useState, useEffect, useCallback, useRef } from "react";
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

function StatusText({ status }) {
    return (
        <span className={`stext stext--${status ? status.toLowerCase() : "waiting"}`}>
            {STATUS_LABELS[status] || status}
        </span>
    );
}

/* ─── Time formatting helpers ──────────────────────────── */
function fmtTime(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
    });
}

function getElapsedSeating(iso, now) {
    if (!iso) return "Seated";
    const diffMs = (now || Date.now()) - new Date(iso).getTime();
    if (diffMs < 0) return "< 1m seated";
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "< 1m seated";
    if (mins < 60) return `${mins}m seated`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return remMins > 0 ? `${hrs}h ${remMins}m seated` : `${hrs}h seated`;
}

function getPartyInfo(entry) {
    if (!entry) return { name: "Guest Party", size: 2, displaySize: "2 guests" };
    const u = entry.userId;
    const rawName = (typeof u === "object" && u !== null)
        ? (u.name || u.email || "Guest Party")
        : (entry.name || "Guest Party");

    let size = entry.partySize;
    const sizeMatch = rawName.match(/\((?:party\s+of\s+)?(\d+)\)/i) || rawName.match(/(?:party\s+of\s+)(\d+)/i);
    if (sizeMatch && sizeMatch[1]) {
        size = parseInt(sizeMatch[1], 10);
    } else if (!size || typeof size !== "number" || size < 1) {
        size = 2;
    }

    const cleanName = rawName.replace(/\s*\((?:party\s+of\s+)?\d+\)\s*/gi, "").trim() || rawName;

    return {
        name: cleanName,
        size,
        displaySize: size === 1 ? "1 guest" : `${size} guests`
    };
}

function dedupeHistory(entries) {
    if (!Array.isArray(entries)) return [];
    const seen = new Set();
    const result = [];
    for (const item of entries) {
        if (!item) continue;
        const id = item._id ? item._id.toString() : (item.entryId ? item.entryId.toString() : null);
        if (!id) {
            result.push(item);
            continue;
        }
        if (!seen.has(id)) {
            seen.add(id);
            result.push(item);
        }
    }
    return result;
}

/* ─── Main Component ───────────────────────────────────── */
export default function StaffDashboard() {
    const { user, logout } = useAuth();
    const { socket, connected } = useSocket();
    const navigate = useNavigate();

    const DEMO_SERVICE_ID = import.meta.env.VITE_DEMO_SERVICE_ID || null;

    const [services, setServices] = useState([]);
    const [serviceId, setServiceId] = useState(DEMO_SERVICE_ID || "");
    const [serviceName, setServiceName] = useState("Main Dining");
    const [avgServiceMinutes, setAvgServiceMinutes] = useState(15);

    const [queue, setQueue] = useState([]);
    const [history, setHistory] = useState([]);
    const [clearedTodayCount, setClearedTodayCount] = useState(0);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [actionLoading, setActionLoading] = useState({});
    const [now, setNow] = useState(() => Date.now());
    const clearedEntryIdsRef = useRef(new Set());

    /* ── Live elapsed clock ticker (every 30 seconds) ─────── */
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 30000);
        return () => clearInterval(timer);
    }, []);

    /* ── Listen for auth expiration ──────────────────────── */
    useEffect(() => {
        const handleAuthExpired = () => {
            logout();
            navigate("/login", {
                replace: true,
                state: { message: "Your session has expired. Please sign in again." }
            });
        };
        window.addEventListener("auth:expired", handleAuthExpired);
        return () => window.removeEventListener("auth:expired", handleAuthExpired);
    }, [logout, navigate]);

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
                    setAvgServiceMinutes(list[0].avgServiceMinutes || 15);
                } else if (serviceId) {
                    const found = list.find((s) => s._id === serviceId);
                    if (found) {
                        setServiceName(found.name);
                        setAvgServiceMinutes(found.avgServiceMinutes || 15);
                    }
                }
            })
            .catch((err) => {
                if (err?.response?.status === 401) {
                    logout();
                    navigate("/login", {
                        replace: true,
                        state: { message: "Your session has expired. Please sign in again." }
                    });
                }
            });
    }, [serviceId, logout, navigate]);

    /* ── Fetch active queue and completed history ────────── */
    const fetchAuthoritativeState = useCallback(async (showSpinner = false) => {
        if (!serviceId) {
            setError("No service selected. Set VITE_DEMO_SERVICE_ID in client/.env.");
            setLoading(false);
            return;
        }
        if (showSpinner) setLoading(true);

        try {
            setError("");
            const [queueRes, historyRes] = await Promise.allSettled([
                queueAPI.serviceQueue(serviceId),
                queueAPI.history(serviceId, 20)
            ]);

            if (queueRes.status === "fulfilled") {
                const rawQueue = Array.isArray(queueRes.value?.data) ? queueRes.value.data : [];
                setQueue(rawQueue);
            } else {
                const errStatus = queueRes.reason?.response?.status;
                if (errStatus === 401) {
                    logout();
                    navigate("/login", {
                        replace: true,
                        state: { message: "Your session has expired. Please sign in again." }
                    });
                    return;
                }
                throw queueRes.reason;
            }

            if (historyRes.status === "fulfilled") {
                const histData = historyRes.value?.data || {};
                const histList = Array.isArray(histData.history) ? histData.history : [];
                setHistory(dedupeHistory(histList));
                if (typeof histData.clearedTodayCount === "number") {
                    setClearedTodayCount(histData.clearedTodayCount);
                }
            } else {
                const errStatus = historyRes.reason?.response?.status;
                if (errStatus === 401) {
                    logout();
                    navigate("/login", {
                        replace: true,
                        state: { message: "Your session has expired. Please sign in again." }
                    });
                    return;
                }
                console.error("Failed to load completion history:", historyRes.reason);
                setError(
                    historyRes.reason?.response?.data?.message ||
                        historyRes.reason?.response?.data?.error ||
                        "Failed to update completion history."
                );
            }
        } catch (err) {
            const errStatus = err?.response?.status;
            if (errStatus === 401) {
                logout();
                navigate("/login", {
                    replace: true,
                    state: { message: "Your session has expired. Please sign in again." }
                });
                return;
            }

            // If we already have queue data and hit a transient network glitch, preserve the existing queue view
            setQueue((prevQueue) => {
                if (prevQueue.length > 0) {
                    setError("Connection interrupted. Reconnecting to live queue…");
                    return prevQueue;
                }
                setError(
                    err?.response?.data?.message ||
                        err?.response?.data?.error ||
                        "Failed to load queue data. Please try again."
                );
                return [];
            });
        } finally {
            setLoading(false);
        }
    }, [serviceId, logout, navigate]);

    useEffect(() => {
        fetchAuthoritativeState(true);
    }, [fetchAuthoritativeState]);

    /* ── Socket real-time synchronization ────────────────── */
    useEffect(() => {
        if (!socket || !serviceId) return;

        socket.emit("join:service", serviceId);

        let debounceTimer = null;
        const debouncedRefresh = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                fetchAuthoritativeState(false);
            }, 60);
        };

        const handleQueueCompleted = (payload) => {
            if (payload && (payload.entryId || payload._id)) {
                const id = (payload.entryId || payload._id).toString();
                const locallyInitiated = clearedEntryIdsRef.current.has(id);
                if (locallyInitiated) {
                    clearedEntryIdsRef.current.delete(id);
                }

                setQueue((prev) => prev.filter((e) => e._id !== id));
                setHistory((prev) => {
                    const alreadyExists = prev.some(
                        (h) => (h._id && h._id.toString() === id) || (h.entryId && h.entryId.toString() === id)
                    );
                    if (alreadyExists) return prev;

                    // If not initiated by this client, optimistically increment count
                    if (!locallyInitiated) {
                        setClearedTodayCount((c) => c + 1);
                    }

                    const newEntry = {
                        ...payload,
                        _id: id,
                        status: "COMPLETED",
                        completedAt: payload.completedAt || new Date().toISOString()
                    };
                    return dedupeHistory([newEntry, ...prev]);
                });
            }
            debouncedRefresh();
        };

        socket.on("queue:joined", debouncedRefresh);
        socket.on("queue:called", debouncedRefresh);
        socket.on("queue:started", debouncedRefresh);
        socket.on("queue:completed", handleQueueCompleted);
        socket.on("queue:cancelled", debouncedRefresh);
        socket.on("queue:updated", debouncedRefresh);
        socket.on("connect", debouncedRefresh);

        return () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            socket.emit("leave:service", serviceId);
            socket.off("queue:joined", debouncedRefresh);
            socket.off("queue:called", debouncedRefresh);
            socket.off("queue:started", debouncedRefresh);
            socket.off("queue:completed", handleQueueCompleted);
            socket.off("queue:cancelled", debouncedRefresh);
            socket.off("queue:updated", debouncedRefresh);
            socket.off("connect", debouncedRefresh);
        };
    }, [socket, serviceId, fetchAuthoritativeState]);

    /* ── Action helpers ──────────────────────────────────── */
    const withLoading = useCallback(async (key, fn) => {
        setActionLoading((prev) => ({ ...prev, [key]: true }));
        try {
            await fn();
            await fetchAuthoritativeState(false);
        } catch (err) {
            const errStatus = err?.response?.status;
            if (errStatus === 401) {
                logout();
                navigate("/login", {
                    replace: true,
                    state: { message: "Your session has expired. Please sign in again." }
                });
                return;
            }
            setError(
                err?.response?.data?.message ||
                    err?.response?.data?.error ||
                    "Action failed. Please try again."
            );
        } finally {
            setActionLoading((prev) => ({ ...prev, [key]: false }));
        }
    }, [fetchAuthoritativeState, logout, navigate]);

    const handleCallNext = () =>
        withLoading("call-next", () => queueAPI.callNext(serviceId));

    const handleCallParty = (entryId) =>
        withLoading(entryId, () => queueAPI.callParty(entryId));

    const handleStart = (entryId) =>
        withLoading(entryId, () => queueAPI.startServing(entryId));

    const handleComplete = async (entryId) => {
        const partyBeingCleared = queue.find((e) => e._id === entryId);
        clearedEntryIdsRef.current.add(entryId);

        await withLoading(entryId, async () => {
            const res = await queueAPI.complete(entryId);
            const completedData = res?.data || {};

            // 1. Immediately remove from active queue (disappears from Seated Parties)
            setQueue((prevQueue) => prevQueue.filter((e) => e._id !== entryId));

            // 2. Prepend to history without duplicates
            const partyToAdd = {
                ...(partyBeingCleared || {}),
                ...completedData,
                _id: entryId,
                status: "COMPLETED",
                completedAt: completedData.completedAt || new Date().toISOString()
            };

            setHistory((prevHistory) => dedupeHistory([partyToAdd, ...prevHistory]));

            // 3. Immediately increment clearedTodayCount
            setClearedTodayCount((prev) => Math.max(prev + 1, 1));
        });
    };

    const handleCancel = (entryId) =>
        withLoading(entryId, () => queueAPI.cancel(entryId));

    const handleSelectService = (id) => {
        const found = services.find((s) => s._id === id);
        if (found) {
            setServiceId(found._id);
            setServiceName(found.name);
            setAvgServiceMinutes(found.avgServiceMinutes || 15);
        }
    };

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    /* ── Derived queue segments ──────────────────────────── */
    const waiting = queue.filter((e) => e.status === "WAITING");
    const called = queue.filter((e) => e.status === "CALLED");
    const serving = queue.filter((e) => e.status === "SERVING");

    // Table-ready party (first CALLED entry)
    const primaryCalled = called[0] || null;
    const additionalCalled = called.slice(1);

    const waitingCount = waiting.length;
    const canCallNext = !!serviceId && waitingCount > 0 && !actionLoading["call-next"];

    /* ── Render ──────────────────────────────────────────── */
    return (
        <div className="sd-shell">
            {/* ── Top bar ─────────────────────────────────── */}
            <header className="sd-topbar">
                <div className="sd-topbar-left">
                    <span className="sd-wordmark">The Garden Table</span>
                    <span className="sd-sep" aria-hidden>·</span>
                    {services.length > 1 ? (
                        <select
                            className="sd-service-select"
                            value={serviceId}
                            onChange={(e) => handleSelectService(e.target.value)}
                            aria-label="Dining area"
                        >
                            {services.map((s) => (
                                <option key={s._id} value={s._id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <span className="sd-service-label">{serviceName}</span>
                    )}
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
                {/* ── A. Operational summary ───────────────── */}
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
                        <span className="sd-stat-value">{clearedTodayCount}</span>
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

                {/* ── Two-column body ────────────────────── */}
                <div className="sd-body">
                    {/* ══════════════════════════════════════════════
                        LEFT COLUMN: Table Ready & Waiting List
                       ══════════════════════════════════════════════ */}
                    <div className="sd-panel sd-panel--left">
                        {/* ── B. Current Table-Ready Party ── */}
                        <section className="sd-current-block">
                            <div className="sd-block-header">
                                <p className="sd-section-eyebrow">
                                    Table ready
                                    {called.length > 0 && (
                                        <span className="sd-count-badge sd-count-badge--called">
                                            {called.length}
                                        </span>
                                    )}
                                </p>
                            </div>

                            {loading ? (
                                <LoadingDots />
                            ) : primaryCalled ? (
                                (() => {
                                    const primaryParty = getPartyInfo(primaryCalled);
                                    return (
                                        <div className="sd-current-card">
                                            <div className="sd-current-token">
                                                {primaryCalled.tokenLabel || `#${primaryCalled.tokenNumber}`}
                                            </div>
                                            <div className="sd-current-meta">
                                                <span className="sd-current-name">
                                                    {primaryParty.name}
                                                </span>
                                                <span className="sd-party-size-pill">
                                                    {primaryParty.displaySize}
                                                </span>
                                                <StatusText status={primaryCalled.status} />
                                            </div>
                                            <p className="sd-current-time">
                                                Table ready · Awaiting guests at host stand
                                                {primaryCalled.calledAt && ` · Called ${fmtTime(primaryCalled.calledAt)}`}
                                            </p>

                                            {/* Action buttons */}
                                            <div className="sd-current-actions">
                                                <button
                                                    className="sd-btn sd-btn--primary"
                                                    id="staff-start-btn"
                                                    onClick={() => handleStart(primaryCalled._id)}
                                                    disabled={!!actionLoading[primaryCalled._id]}
                                                >
                                                    {actionLoading[primaryCalled._id] ? "Seating guests…" : "Seat guests"}
                                                </button>
                                                <button
                                                    className="sd-btn sd-btn--cancel"
                                                    id="staff-cancel-current-btn"
                                                    onClick={() => handleCancel(primaryCalled._id)}
                                                    disabled={!!actionLoading[primaryCalled._id]}
                                                >
                                                    {actionLoading[primaryCalled._id] ? "Removing…" : "Remove from list"}
                                                </button>
                                            </div>

                                            {/* Additional called parties if any */}
                                            {additionalCalled.length > 0 && (
                                                <div className="sd-subcalled-group">
                                                    <p className="sd-subcalled-title">Also table ready:</p>
                                                    {additionalCalled.map((party) => {
                                                        const subParty = getPartyInfo(party);
                                                        return (
                                                            <div key={party._id} className="sd-subcalled-row">
                                                                <span className="sd-row-token font-mono">
                                                                    {party.tokenLabel || `#${party.tokenNumber}`}
                                                                </span>
                                                                <div className="sd-subcalled-meta">
                                                                    <span className="sd-subcalled-name">{subParty.name}</span>
                                                                    <span className="sd-party-size-tag">{subParty.displaySize}</span>
                                                                </div>
                                                                <div className="sd-subcalled-actions">
                                                                    <button
                                                                        className="sd-action-btn sd-action-btn--start"
                                                                        onClick={() => handleStart(party._id)}
                                                                        disabled={!!actionLoading[party._id]}
                                                                    >
                                                                        {actionLoading[party._id] ? "…" : "Seat"}
                                                                    </button>
                                                                    <button
                                                                        className="sd-action-btn sd-action-btn--cancel"
                                                                        onClick={() => handleCancel(party._id)}
                                                                        disabled={!!actionLoading[party._id]}
                                                                    >
                                                                        {actionLoading[party._id] ? "…" : "Remove"}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()
                            ) : (
                                <div className="sd-current-empty">
                                    <p className="sd-empty-primary">No table currently awaiting seating.</p>
                                    <p className="sd-empty-secondary">
                                        {waitingCount > 0
                                            ? `${waitingCount} ${waitingCount === 1 ? "party" : "parties"} waiting. Call the next party when a table is prepared.`
                                            : "Waiting list is clear. Walk-in guests will appear when they join."}
                                    </p>
                                    <button
                                        className="sd-btn sd-btn--call-next sd-btn--call-empty"
                                        id="staff-call-next-empty-btn"
                                        onClick={handleCallNext}
                                        disabled={!canCallNext}
                                        title={waitingCount === 0 ? "No parties waiting in queue" : "Call next party"}
                                    >
                                        {actionLoading["call-next"] ? "Calling…" : "Call next party"}
                                    </button>
                                </div>
                            )}
                        </section>

                        {/* Divider */}
                        <div className="sd-divider" />

                        {/* ── C. Waiting list ─────────────── */}
                        <section className="sd-queue-list-section">
                            <header className="sd-queue-list-header">
                                <p className="sd-section-eyebrow">
                                    Waiting list
                                    {waitingCount > 0 && (
                                        <span className="sd-count-badge">{waitingCount}</span>
                                    )}
                                </p>
                                <button
                                    className="sd-btn-compact-call"
                                    id="staff-call-next-btn"
                                    onClick={handleCallNext}
                                    disabled={!canCallNext}
                                    title={waitingCount === 0 ? "No parties waiting in queue" : "Call next party"}
                                >
                                    {actionLoading["call-next"] ? "Calling…" : "Call next party"}
                                </button>
                            </header>

                            {loading ? (
                                <LoadingDots />
                            ) : waiting.length === 0 ? (
                                <div className="sd-empty-state">
                                    <p className="sd-empty-primary">Waiting list is clear.</p>
                                    <p className="sd-empty-secondary">
                                        Walk-in guests will appear here as soon as they join the waiting list.
                                    </p>
                                </div>
                            ) : (
                                <div className="sd-queue-rows">
                                    {waiting.map((entry, idx) => {
                                        const pos = idx + 1;
                                        const estWaitMinutes = pos * avgServiceMinutes;
                                        const pInfo = getPartyInfo(entry);
                                        return (
                                            <div key={entry._id} className="sd-row sd-row--waiting">
                                                <div className="sd-pos-badge" title={`Position #${pos}`}>
                                                    #{pos}
                                                </div>
                                                <span className="sd-row-token font-mono">
                                                    {entry.tokenLabel || `#${entry.tokenNumber}`}
                                                </span>
                                                <div className="sd-row-details">
                                                    <div className="sd-row-name-wrap">
                                                        <span className="sd-row-name">
                                                            {pInfo.name}
                                                        </span>
                                                        <span className="sd-party-size-tag">
                                                            {pInfo.displaySize}
                                                        </span>
                                                    </div>
                                                    <span className="sd-row-subtext">
                                                        Joined {fmtTime(entry.createdAt)} · ~{estWaitMinutes}m wait
                                                    </span>
                                                </div>
                                                <div className="sd-row-actions">
                                                    <button
                                                        className="sd-action-btn sd-action-btn--call"
                                                        id={`staff-call-btn-${entry._id}`}
                                                        onClick={() => handleCallParty(entry._id)}
                                                        disabled={!!actionLoading[entry._id]}
                                                        title="Call this party to host stand"
                                                    >
                                                        {actionLoading[entry._id] ? "…" : "Call party"}
                                                    </button>
                                                    <button
                                                        className="sd-action-btn sd-action-btn--cancel"
                                                        onClick={() => handleCancel(entry._id)}
                                                        disabled={!!actionLoading[entry._id]}
                                                        title="Remove from list"
                                                    >
                                                        {actionLoading[entry._id] ? "…" : "Remove"}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    </div>

                    {/* ══════════════════════════════════════════════
                        RIGHT COLUMN: Seated Parties & History
                       ══════════════════════════════════════════════ */}
                    <div className="sd-panel sd-panel--right">
                        {/* ── D. Seated parties (Important New Section) ── */}
                        <section className="sd-seated-section">
                            <header className="sd-seated-header">
                                <div>
                                    <p className="sd-section-eyebrow">
                                        Seated parties
                                        {serving.length > 0 && (
                                            <span className="sd-count-badge sd-count-badge--serving">
                                                {serving.length}
                                            </span>
                                        )}
                                    </p>
                                    <p className="sd-section-sub">
                                        Active dining room tables · Clear table when meal concludes
                                    </p>
                                </div>
                            </header>

                            {loading ? (
                                <LoadingDots />
                            ) : serving.length === 0 ? (
                                <div className="sd-empty-state">
                                    <p className="sd-empty-primary">No tables currently seated.</p>
                                    <p className="sd-empty-secondary">
                                        When a table-ready party is seated, their active dining status appears here.
                                    </p>
                                </div>
                            ) : (
                                <div className="sd-seated-grid">
                                    {serving.map((entry) => {
                                        const seatedTimeIso = entry.servedAt || entry.updatedAt;
                                        const elapsedText = getElapsedSeating(seatedTimeIso, now);
                                        const pInfo = getPartyInfo(entry);
                                        return (
                                            <div key={entry._id} className="sd-seated-card">
                                                <div className="sd-seated-card-top">
                                                    <span className="sd-seated-token font-mono">
                                                        {entry.tokenLabel || `#${entry.tokenNumber}`}
                                                    </span>
                                                    <span className="sd-elapsed-badge">
                                                        {elapsedText}
                                                    </span>
                                                </div>
                                                <div className="sd-seated-card-body">
                                                    <div className="sd-seated-name-wrap">
                                                        <span className="sd-seated-name">
                                                            {pInfo.name}
                                                        </span>
                                                        <span className="sd-party-size-tag sd-party-size-tag--seated">
                                                            {pInfo.displaySize}
                                                        </span>
                                                    </div>
                                                    <span className="sd-seated-time">
                                                        Seated at {fmtTime(seatedTimeIso)}
                                                    </span>
                                                </div>
                                                <div className="sd-seated-card-actions">
                                                    <button
                                                        className="sd-btn sd-btn--complete"
                                                        id={`staff-clear-btn-${entry._id}`}
                                                        onClick={() => handleComplete(entry._id)}
                                                        disabled={!!actionLoading[entry._id]}
                                                    >
                                                        {actionLoading[entry._id] ? "Clearing…" : "Clear table"}
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        {/* Divider */}
                        <div className="sd-divider" />

                        {/* ── E. Recently cleared parties ── */}
                        <section className="sd-history-section">
                            <header className="sd-history-header">
                                <p className="sd-section-eyebrow sd-section-eyebrow--muted">
                                    Recently cleared
                                    {history.length > 0 && (
                                        <span className="sd-count-badge sd-count-badge--muted">
                                            {history.length}
                                        </span>
                                    )}
                                </p>
                            </header>

                            {loading ? (
                                <LoadingDots />
                            ) : history.length === 0 ? (
                                <div className="sd-empty-state sd-empty-state--compact">
                                    <p className="sd-empty-secondary">
                                        No tables cleared yet today. Completed dining parties will appear here.
                                    </p>
                                </div>
                            ) : (
                                <div className="sd-queue-rows sd-queue-rows--history">
                                    {history.map((entry) => {
                                        const pInfo = getPartyInfo(entry);
                                        return (
                                            <div key={entry._id} className="sd-row sd-row--history">
                                                <span className="sd-row-token font-mono">
                                                    {entry.tokenLabel || `#${entry.tokenNumber}`}
                                                </span>
                                                <div className="sd-history-name-wrap">
                                                    <span className="sd-row-name">
                                                        {pInfo.name}
                                                    </span>
                                                    <span className="sd-history-size">
                                                        {pInfo.displaySize}
                                                    </span>
                                                </div>
                                                <span className="sd-status-cleared-pill">
                                                    Cleared
                                                </span>
                                                <span className="sd-row-time">
                                                    {fmtTime(entry.completedAt || entry.updatedAt)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>
                    </div>
                </div>
            </main>
        </div>
    );
}

/* ── Loading dots sub-component ─────────────────────────── */
function LoadingDots() {
    return (
        <div className="sd-loading" aria-label="Loading">
            <span className="sd-loading-dot" />
            <span className="sd-loading-dot" />
            <span className="sd-loading-dot" />
        </div>
    );
}
