import React from "react";
import "./QueueProgress.css";

export default function QueueProgress({
    status = "WAITING",
    peopleAhead = 0,
    counterId = "Host Stand"
}) {
    let positionPercent = 35;
    let label = "Your party";
    let subtext = `${peopleAhead} parties ahead`;

    if (status === "CALLED") {
        positionPercent = 88;
        label = "Table ready";
        subtext = `Proceed to ${counterId}`;
    } else if (status === "SERVING") {
        positionPercent = 100;
        label = "Seated";
        subtext = "Enjoy your meal";
    } else if (status === "COMPLETED") {
        positionPercent = 100;
        label = "Complete";
        subtext = "Visit concluded";
    } else if (status === "CANCELLED") {
        positionPercent = 20;
        label = "Removed";
        subtext = "Removed from list";
    } else {
        if (peopleAhead === 0) {
            positionPercent = 80;
            subtext = "Next party in line";
        } else if (peopleAhead === 1) {
            positionPercent = 65;
            subtext = "1 party ahead";
        } else if (peopleAhead <= 3) {
            positionPercent = 50;
            subtext = `${peopleAhead} parties ahead`;
        } else {
            positionPercent = Math.max(20, 75 - peopleAhead * 8);
            subtext = `${peopleAhead} parties ahead`;
        }
    }

    return (
        <div className="queue-progress-flow" aria-label="Waiting list progression">
            <div className="progress-labels">
                <span className="label-start">Joined list</span>
                <span className="label-subtext">{subtext}</span>
                <span className="label-end">{counterId}</span>
            </div>

            <div className="progress-track-line">
                <div
                    className="progress-fill-line"
                    style={{ width: `${positionPercent}%` }}
                />
                <div
                    className={`progress-pin status-${status.toLowerCase()}`}
                    style={{ left: `${positionPercent}%` }}
                >
                    <span className="pin-dot" />
                    <span className="pin-tag">{label}</span>
                </div>
            </div>
        </div>
    );
}
