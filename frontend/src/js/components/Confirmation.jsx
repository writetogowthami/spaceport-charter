import React, { useEffect, useRef } from "react";
import { dateInCentral, dateLabel, timeInCentral } from "../utils/schedule";

export default function Confirmation({ booking, ship, onAgain, onFleet }) {
  const headingRef = useRef(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  const date = dateInCentral(new Date(booking.startTime));

  const duration = Math.round((new Date(booking.endTime) - new Date(booking.startTime)) / 60000);

  const launchTime = timeInCentral(booking.startTime);
  const returnTime = timeInCentral(booking.endTime);

  return (
    <section className="confirmation confirmation-redesign" aria-live="polite">
      <div className="confirmation-hero">
        <div className="confirmation-hero-top">
          <span className="confirmation-kicker">PACIFIC SPACEPORT / MISSION CONTROL</span>
          <span className="confirmation-hero-mark" aria-hidden="true">
            ✦
          </span>
        </div>

        <div className="confirmation-success">
          <span className="confirmation-success-icon" aria-hidden="true">
            ✓
          </span>
          <span>RESERVATION CONFIRMED</span>
        </div>

        <h2 ref={headingRef} tabIndex="-1">
          You're cleared for launch.
        </h2>

        <p>Your spacecraft is reserved. Your mission details are ready below.</p>

        <div className="confirmation-hero-details">
          <div>
            <span className="confirmation-detail-label">SPACECRAFT</span>
            <strong>{ship?.name || `Ship ${booking.shipId}`}</strong>
          </div>

          {booking.id != null && (
            <div className="confirmation-reservation">
              <span className="confirmation-detail-label">RESERVATION</span>
              <strong>#{booking.id}</strong>
            </div>
          )}
        </div>
      </div>

      <div className="confirmation-pass">
        <div className="confirmation-pass-heading">
          <span>MISSION ITINERARY</span>
        </div>

        <div className="confirmation-pass-meta">
          <div>
            <span className="confirmation-detail-label">MISSION DATE</span>
            <strong>{dateLabel(date)}</strong>
          </div>

          <div>
            <span className="confirmation-detail-label">PILOT</span>
            <strong>{booking.pilotName}</strong>
          </div>
        </div>

        <div className="confirmation-timeline">
          <div className="confirmation-time">
            <span className="confirmation-detail-label">LAUNCH</span>
            <strong>{launchTime}</strong>
            <small>Central Time</small>
          </div>

          <div className="confirmation-flight-path" aria-hidden="true">
            <span />
            <div />
            <span />
          </div>

          <div className="confirmation-time confirmation-time-return">
            <span className="confirmation-detail-label">RETURN</span>
            <strong>{returnTime}</strong>
            <small>Central Time</small>
          </div>
        </div>

        <div className="confirmation-pass-footer">
          <span>{duration}-minute mission</span>
          <span>{ship?.refuelMinutes ?? 30}-minute refueling buffer between missions</span>
        </div>
      </div>

      <div className="confirmation-actions">
        <button type="button" className="btn-primary btn-book-again" onClick={onAgain}>
          Book another mission →
        </button>

        <button type="button" className="btn-outline" onClick={onFleet}>
          View Fleet Manager
        </button>
      </div>
    </section>
  );
}
