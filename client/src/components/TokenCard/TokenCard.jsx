import React from "react";
import "./TokenCard.css";

export default function TokenCard({
    serviceName = "Main Dining",
    tokenLabel = "A-001",
    status = "WAITING",
    peopleAhead = 0,
    estimatedWaitMinutes = 15,
    counterId = "Host Stand",
    issuedAt = ""
}) {
    const statusMeta = {
        WAITING: {
            stateClass: "state-waiting",
            dotColor: "var(--status-waiting)",
            label: "Waiting for a table",
            headline: peopleAhead === 0 ? "You're next in line" : (peopleAhead === 1 ? "1 party ahead of you" : `${peopleAhead} parties ahead of you`),
            subtext: "Please wait in the reception or bar area. We'll alert you as soon as your table is ready.",
            waitDisplay: estimatedWaitMinutes > 0 ? `~${estimatedWaitMinutes} min` : "Soon"
        },
        CALLED: {
            stateClass: "state-called",
            dotColor: "var(--status-called)",
            label: "Your table is ready",
            headline: "Your table is ready",
            subtext: `Please proceed to the ${counterId || "Host Stand"} to be seated.`,
            waitDisplay: "Now"
        },
        SERVING: {
            stateClass: "state-serving",
            dotColor: "var(--status-serving)",
            label: "You're seated",
            headline: "You're seated",
            subtext: "Enjoy your meal. Let your server know if you need anything.",
            waitDisplay: "Dining"
        },
        COMPLETED: {
            stateClass: "state-completed",
            dotColor: "var(--status-completed)",
            label: "Visit complete",
            headline: "Thanks for dining with us",
            subtext: "We hope you enjoyed your visit. Come back soon!",
            waitDisplay: "Finished"
        },
        CANCELLED: {
            stateClass: "state-cancelled",
            dotColor: "var(--status-cancelled)",
            label: "Removed from waiting list",
            headline: "Removed from list",
            subtext: "Your party has been removed from the dining waitlist.",
            waitDisplay: "—"
        }
    };

    const current = statusMeta[status] || statusMeta.WAITING;

    return (
        <article className={`queue-ticket ${current.stateClass}`} aria-label={`Dining ticket ${tokenLabel}`}>
            {/* Top Ticket Header */}
            <div className="ticket-header">
                <span className="ticket-service-name">{serviceName}</span>
                <div className="ticket-status-pill">
                    <span className="ticket-status-dot" style={{ backgroundColor: current.dotColor }} />
                    <span className="ticket-status-text">{current.label}</span>
                </div>
            </div>

            {/* Subtle ticket divider with circular perforation notches */}
            <div className="ticket-divider-strip">
                <div className="notch notch-left" />
                <div className="dashed-separator" />
                <div className="notch notch-right" />
            </div>

            {/* Token Hero */}
            <div className="ticket-body">
                <span className="ticket-eyebrow">Your party token</span>
                <div className="token-display font-mono">{tokenLabel}</div>
                <div className="ticket-status-message">
                    <p className="ticket-headline">{current.headline}</p>
                    <p className="ticket-subtext">{current.subtext}</p>
                </div>
            </div>

            {/* Bottom Details Row */}
            <div className="ticket-details-row">
                <div className="detail-item">
                    <span className="detail-label">Parties ahead</span>
                    <span className="detail-value">
                        {status === "WAITING" ? peopleAhead : "0"}
                    </span>
                </div>
                <div className="detail-divider" />
                <div className="detail-item">
                    <span className="detail-label">Estimated wait</span>
                    <span className="detail-value">{current.waitDisplay}</span>
                </div>
                <div className="detail-divider" />
                <div className="detail-item">
                    <span className="detail-label">Table / Stand</span>
                    <span className="detail-value">
                        {status === "CALLED" || status === "SERVING" ? counterId : "On call"}
                    </span>
                </div>
            </div>

            {issuedAt && (
                <div className="ticket-footer">
                    <span className="ticket-issued-text">Issued at {issuedAt}</span>
                </div>
            )}
        </article>
    );
}
