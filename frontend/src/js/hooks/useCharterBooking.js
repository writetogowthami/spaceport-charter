import { useRef, useState } from "react";
import { api } from "../../api";
import { normalizeBooking } from "../utils/schedule";
import { buildBookingPayload } from "../utils/charterBooking";

export function useCharterBooking({ onBooked, onConflict }) {
  const [submitting, setSubmitting] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [confirmation, setConfirmation] = useState(null);

  const submissionLock = useRef(false);

  async function submitBooking({
    canSubmit,
    shipId,
    pilotName,
    bookingMode,
    date,
    selected,
    duration,
    customStartMinutes,
    customEndMinutes,
  }) {
    if (!canSubmit || submissionLock.current) return;

    submissionLock.current = true;
    setSubmitting(true);
    setBookingError("");

    try {
      const payload = buildBookingPayload({
        shipId,
        pilotName,
        bookingMode,
        date,
        selected,
        duration,
        customStartMinutes,
        customEndMinutes,
      });

      const response = await api.createBooking(payload);

      const result = response?.booking ?? response?.data ?? response;

      const confirmed = normalizeBooking({
        ...payload,
        ...(result && typeof result === "object" ? result : {}),
      });

      setConfirmation(confirmed);
      onBooked();

      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (err) {
      if (err.status === 409) {
        onConflict();

        setBookingError(
          "Mission could not be confirmed: " +
            `${err.message} Availability was refreshed. ` +
            (bookingMode === "quick"
              ? "Your previous launch selection was cleared; choose another available time."
              : "Review the updated schedule and choose another mission window.")
        );
      } else {
        setBookingError(`Mission could not be confirmed: ${err.message}`);
      }
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  }

  function resetBooking() {
    setConfirmation(null);
    setBookingError("");
  }

  return {
    submitting,
    bookingError,
    setBookingError,
    confirmation,
    submitBooking,
    resetBooking,
  };
}
