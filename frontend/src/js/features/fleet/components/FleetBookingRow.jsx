import React from "react";
import TimeRange from "../../../shared/components/TimeRange";
import { dateLabel, timeInCentral } from "../../../shared/utils/schedule";

export default function FleetBookingRow({ booking, bookingDate, now, onRequestCancellation }) {
  const isCancelled = booking.status === "cancelled";
  const canCancel = booking.status === "confirmed" && Date.parse(booking.startTime) > now;

  return (
    <div className={`booking-row ${isCancelled ? "booking-row-cancelled" : ""}`}>
      <div className="booking-pilot">
        <div className="booking-identity">
          <strong>{booking.pilotName}</strong>

          {booking.id != null && <small>Reservation #{booking.id}</small>}

          {isCancelled && (
            <span className="booking-cancelled-label">
              <span aria-hidden="true">×</span>
              Cancelled
            </span>
          )}

          {canCancel && (
            <button
              type="button"
              className="booking-cancel-button"
              aria-label={`Cancel booking ${booking.id} for ${booking.pilotName}`}
              onClick={() => onRequestCancellation(booking)}
            >
              <span className="booking-cancel-icon" aria-hidden="true">
                ×
              </span>
              Cancel booking
            </button>
          )}
        </div>
      </div>

      <div className="booking-schedule">
        <TimeRange start={timeInCentral(booking.startTime)} end={timeInCentral(booking.endTime)} />

        <time dateTime={booking.startTime}>{dateLabel(bookingDate ?? "")}</time>
      </div>
    </div>
  );
}
