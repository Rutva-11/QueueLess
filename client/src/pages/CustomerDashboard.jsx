import React, { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/useAuth";
import { useSocket } from "../context/useSocket";
import { queueAPI } from "../api/client";
import AppHeader from "../components/AppHeader/AppHeader";
import TokenCard from "../components/TokenCard/TokenCard";
import QueueProgress from "../components/QueueProgress/QueueProgress";
import "./CustomerDashboard.css";

function formatTime(isoString) {
    if (!isoString) return "";
    return new Date(isoString).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function CustomerDashboard() {
    const { user } = useAuth();
    const { socket } = useSocket();

    const [services, setServices] = useState([]);
    const [selectedServiceId, setSelectedServiceId] = useState(() => import.meta.env.VITE_DEMO_SERVICE_ID || "");
    const [entry, setEntry] = useState(null);
    const [peopleAhead, setPeopleAhead] = useState(0);
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [error, setError] = useState("");

    // 1. Fetch available services
    const fetchServices = useCallback(async () => {
        try {
            const res = await queueAPI.services();
            const list = Array.isArray(res.data) ? res.data : [];
            setServices(list);
            if (list.length > 0 && !selectedServiceId) {
                setSelectedServiceId(list[0]._id);
            }
        } catch {
            // Graceful fallback to env if services endpoint has issues
            if (import.meta.env.VITE_DEMO_SERVICE_ID) {
                setSelectedServiceId(import.meta.env.VITE_DEMO_SERVICE_ID);
            }
        }
    }, [selectedServiceId]);

    // 2. Fetch customer's active queue entry
    const fetchMyEntry = useCallback(async () => {
        try {
            setError("");
            const res = await queueAPI.myEntry();
            const activeEntry = res.data;
            setEntry(activeEntry);

            // Compute people ahead if in WAITING status
            if (activeEntry && activeEntry.status === "WAITING") {
                const sId = typeof activeEntry.serviceId === "object"
                    ? activeEntry.serviceId?._id
                    : activeEntry.serviceId;
                if (sId) {
                    try {
                        const queueRes = await queueAPI.serviceQueue(sId);
                        const queueList = Array.isArray(queueRes.data) ? queueRes.data : [];
                        const waitingQueue = queueList.filter(e => e.status === "WAITING");
                        const myIdx = waitingQueue.findIndex(e => String(e._id) === String(activeEntry._id));
                        setPeopleAhead(myIdx > 0 ? myIdx : 0);
                    } catch {
                        setPeopleAhead(0);
                    }
                }
            } else {
                setPeopleAhead(0);
            }
        } catch (err) {
            if (err?.response?.status === 404) {
                // No active queue entry — normal state
                setEntry(null);
                setPeopleAhead(0);
            } else if (!err.response) {
                setError("Cannot connect to server. Please check your network.");
            } else {
                setError("Unable to load queue status. Please try refreshing.");
            }
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial load
    useEffect(() => {
        fetchServices();
        fetchMyEntry();
    }, [fetchServices, fetchMyEntry]);

    // Socket.IO event listener for real-time synchronization
    useEffect(() => {
        if (!socket) return;

        const currentServiceId = entry
            ? (typeof entry.serviceId === "object" ? entry.serviceId?._id : entry.serviceId)
            : selectedServiceId;

        if (currentServiceId) {
            socket.emit("join:service", currentServiceId);
        }

        // On any queue lifecycle event, refetch the authoritative REST state
        const handleQueueEvent = () => {
            fetchMyEntry();
        };

        socket.on("queue:joined", handleQueueEvent);
        socket.on("queue:called", handleQueueEvent);
        socket.on("queue:started", handleQueueEvent);
        socket.on("queue:completed", handleQueueEvent);
        socket.on("queue:cancelled", handleQueueEvent);
        socket.on("queue:updated", handleQueueEvent);

        return () => {
            if (currentServiceId) {
                socket.emit("leave:service", currentServiceId);
            }
            socket.off("queue:joined", handleQueueEvent);
            socket.off("queue:called", handleQueueEvent);
            socket.off("queue:started", handleQueueEvent);
            socket.off("queue:completed", handleQueueEvent);
            socket.off("queue:cancelled", handleQueueEvent);
            socket.off("queue:updated", handleQueueEvent);
        };
    }, [socket, entry, selectedServiceId, fetchMyEntry]);

    // Join queue handler
    const handleJoinQueue = async () => {
        if (!selectedServiceId) {
            setError("Please select a service before taking a ticket.");
            return;
        }

        setError("");
        setJoining(true);

        try {
            const res = await queueAPI.join(selectedServiceId);
            setEntry(res.data);
            fetchMyEntry();
        } catch (err) {
            const status = err?.response?.status;
            if (status === 409) {
                setError("You already have an active ticket in this service.");
                fetchMyEntry();
            } else {
                setError(err?.response?.data?.error || err?.response?.data?.message || "Could not take ticket. Please try again.");
            }
        } finally {
            setJoining(false);
        }
    };

    // Cancel ticket handler
    const handleConfirmCancel = async () => {
        if (!entry?._id) return;

        setCancelling(true);
        setShowCancelModal(false);
        setError("");

        try {
            await queueAPI.cancel(entry._id);
            setEntry(null);
            setPeopleAhead(0);
        } catch (err) {
            setError(err?.response?.data?.error || "Could not cancel ticket. Please try again.");
        } finally {
            setCancelling(false);
        }
    };

    // Helper data extraction
    const serviceObj = typeof entry?.serviceId === "object" ? entry.serviceId : null;
    const currentServiceName = serviceObj?.name ||
        services.find(s => s._id === selectedServiceId)?.name ||
        "Main Dining";

    const avgMinutes = serviceObj?.avgServiceMinutes || 15;
    const estWait = peopleAhead * avgMinutes;

    return (
        <div className="customer-page-shell">
            <AppHeader serviceName={currentServiceName} />

            <main className="main-content">
                <div className="customer-view">
                    {error && (
                        <div className="dashboard-alert error-banner" role="alert">
                            <span>{error}</span>
                            <button
                                type="button"
                                className="alert-dismiss-btn"
                                onClick={() => setError("")}
                                aria-label="Dismiss message"
                            >
                                ✕
                            </button>
                        </div>
                    )}

                    {loading ? (
                        <div className="dashboard-loading view-loading" aria-label="Loading your queue status">
                            <span className="loading-dot" />
                            <span className="loading-dot" />
                            <span className="loading-dot" />
                        </div>
                    ) : !entry ? (
                        /* Customer Has No Active Ticket */
                        <div className="waiting-room-empty">
                            <div className="empty-header">
                                <span className="empty-kicker">The Garden Table · Welcome, {user?.name || "Guest"}</span>
                                <h1 className="empty-title">Find your place at the table</h1>
                                <p className="empty-description">
                                    Join the waiting list and we'll let you know when your table is ready.
                                </p>
                            </div>

                            {services.length > 0 && (
                                <div className="service-selection-group">
                                    <label htmlFor="service-select" className="service-label">Available dining</label>
                                    <div className="service-card-list">
                                        {services.map(svc => {
                                            const isSelected = selectedServiceId === svc._id;
                                            return (
                                                <button
                                                    key={svc._id}
                                                    type="button"
                                                    className={`service-option-card ${isSelected ? "is-selected" : ""}`}
                                                    onClick={() => setSelectedServiceId(svc._id)}
                                                >
                                                    <div className="service-option-top">
                                                        <span className="service-option-name">{svc.name}</span>
                                                        <span className="service-option-prefix font-mono">Series {svc.tokenPrefix}</span>
                                                    </div>
                                                    <span className="service-option-wait">
                                                        Average wait ~{svc.avgServiceMinutes || 15} min
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <button
                                type="button"
                                className="btn-take-ticket"
                                onClick={handleJoinQueue}
                                disabled={joining || !selectedServiceId}
                            >
                                {joining ? "Joining list…" : "Join the waiting list"}
                            </button>
                        </div>
                    ) : (
                        /* Customer Has An Active Ticket */
                        <div className="ticket-active-view">
                            {entry.status === "CALLED" && (
                                <div className="call-notification-banner" role="status">
                                    <span className="banner-pulse" />
                                    <span>Your table is ready! Please proceed to the host stand.</span>
                                </div>
                            )}

                            <section className="view-ticket-hero">
                                <TokenCard
                                    serviceName={currentServiceName}
                                    tokenLabel={entry.tokenLabel || `#${entry.tokenNumber}`}
                                    status={entry.status}
                                    peopleAhead={peopleAhead}
                                    estimatedWaitMinutes={estWait}
                                    counterId="Host Stand"
                                    issuedAt={formatTime(entry.createdAt)}
                                />
                            </section>

                            <section className="view-progress">
                                <QueueProgress
                                    status={entry.status}
                                    peopleAhead={peopleAhead}
                                    counterId="Host Stand"
                                />
                            </section>

                            {/* Customer Actions */}
                            {entry.status === "WAITING" && (
                                <div className="ticket-action-bar">
                                    <button
                                        type="button"
                                        className="btn-cancel-ticket"
                                        onClick={() => setShowCancelModal(true)}
                                        disabled={cancelling}
                                    >
                                        {cancelling ? "Withdrawing…" : "Leave waiting list"}
                                    </button>
                                </div>
                            )}

                            {entry.status === "COMPLETED" && (
                                <div className="completed-reset-bar">
                                    <p className="completed-thank-you">Thanks for dining with us! We hope you enjoyed your visit.</p>
                                    <button
                                        type="button"
                                        className="btn-new-ticket"
                                        onClick={() => setEntry(null)}
                                    >
                                        Join waiting list again
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </main>

            {/* Confirmation Dialog */}
            {showCancelModal && (
                <div className="modal-backdrop dialog-overlay" onClick={() => setShowCancelModal(false)}>
                    <div className="modal-sheet dialog-box" onClick={(e) => e.stopPropagation()}>
                        <h3 className="modal-title dialog-title">Leave waiting list?</h3>
                        <p className="modal-text dialog-desc">
                            You will surrender party ticket <strong>{entry?.tokenLabel}</strong> and forfeit your place on the dining waitlist.
                        </p>
                        <div className="modal-action-row dialog-buttons">
                            <button
                                type="button"
                                className="modal-btn secondary dialog-btn cancel"
                                onClick={() => setShowCancelModal(false)}
                            >
                                Keep my place
                            </button>
                            <button
                                type="button"
                                className="modal-btn danger dialog-btn confirm"
                                onClick={handleConfirmCancel}
                            >
                                Leave list
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
