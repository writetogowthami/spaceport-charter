import {
  centralToISO,
  dateInCentral,
  dateLabel,
  timeInCentral,
  hhmm,
  isValidDate,
} from "./schedule";
import { isCompleteTime } from "./charterInputs";

export const OPENING_MINUTES = 360;
export const CLOSING_MINUTES = 1320;

export function parseTime(value) {
  if (!/^\d{2}:\d{2}$/.test(value)) return NaN;

  const [hours, minutes] = value.split(":").map(Number);

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return NaN;
  }

  return hours * 60 + minutes;
}

export function overlapsBlockedWindow(start, end, windows) {
  return windows.some((window) => start < window.end && end > window.start);
}

export function isQuickSlotAvailable({
  start,
  duration,
  date,
  now,
  windows,
  availabilityIsCurrent,
  loading,
  error,
}) {
  if (!isValidDate(date) || !availabilityIsCurrent || loading || error) {
    return false;
  }

  const end = start + duration;

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    start < OPENING_MINUTES ||
    end > CLOSING_MINUTES
  ) {
    return false;
  }

  const startISO = centralToISO(date, start);
  const endISO = centralToISO(date, end);

  const startInstant = new Date(startISO);
  const endInstant = new Date(endISO);

  // Reject conversions that do not round-trip to the requested Central times.
  if (
    !Number.isFinite(startInstant.getTime()) ||
    !Number.isFinite(endInstant.getTime()) ||
    dateInCentral(startInstant) !== date ||
    dateInCentral(endInstant) !== date ||
    timeInCentral(startISO) !== hhmm(start) ||
    timeInCentral(endISO) !== hhmm(end) ||
    endInstant.getTime() <= startInstant.getTime()
  ) {
    return false;
  }

  if (startInstant.getTime() <= now) {
    return false;
  }

  return !overlapsBlockedWindow(start, end, windows);
}

export function validateCustomTime({
  customStart,
  customEnd,
  date,
  now,
  windows,
  loading,
  availabilityIsCurrent,
  error,
}) {
  if (!isValidDate(date)) {
    return { valid: false, neutral: true, message: "Choose a mission date to check availability." };
  }
  const start = parseTime(customStart);
  const end = parseTime(customEnd);

  if (!isCompleteTime(customStart) || !isCompleteTime(customEnd)) {
    return {
      valid: false,
      neutral: true,
      message: "Enter both times in HH:mm format.",
    };
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return {
      valid: false,
      message: "Enter valid launch and return times.",
      fields: [!Number.isFinite(start) && "launch", !Number.isFinite(end) && "return"].filter(
        Boolean
      ),
    };
  }

  if (end <= start) {
    return {
      valid: false,
      message: "Return time must be later than launch time.",
    };
  }

  if (start < OPENING_MINUTES || end > CLOSING_MINUTES) {
    return {
      valid: false,
      message: "Missions must be between 06:00 and 22:00 Central Time.",
    };
  }

  const startISO = centralToISO(date, start);
  const endISO = centralToISO(date, end);

  const startInstant = new Date(startISO);
  const endInstant = new Date(endISO);

  if (
    dateInCentral(startInstant) !== date ||
    dateInCentral(endInstant) !== date ||
    timeInCentral(startISO) !== customStart ||
    timeInCentral(endISO) !== customEnd
  ) {
    return {
      valid: false,
      message: "These times are not valid on the selected Central Time date.",
    };
  }

  if (startInstant.getTime() <= now) {
    return {
      valid: false,
      message: `Launch on ${dateLabel(date)} at ${customStart} CT is in the past. Choose a future launch time.`,
    };
  }

  if (endInstant.getTime() <= startInstant.getTime()) {
    return {
      valid: false,
      message: "Return time must be later than launch time.",
    };
  }

  if (loading || !availabilityIsCurrent) {
    return {
      valid: false,
      neutral: true,
      message: "Checking spacecraft availability…",
    };
  }

  if (error) {
    return {
      valid: false,
      message: "Availability could not be verified. Please retry.",
    };
  }

  if (overlapsBlockedWindow(start, end, windows)) {
    return {
      valid: false,
      message:
        "This mission overlaps an unavailable window, " +
        "including the spacecraft's required refueling buffer. " +
        "Choose another launch or return time.",
    };
  }

  return { valid: true, message: "" };
}
