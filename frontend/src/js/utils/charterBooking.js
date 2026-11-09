import { centralToISO } from "./schedule";
import { trimPilotName } from "./pilotNamePolicy";

export function buildBookingPayload({
  shipId,
  pilotName,
  bookingMode,
  date,
  selected,
  duration,
  customStartMinutes,
  customEndMinutes,
}) {
  const isQuickBooking = bookingMode === "quick";

  const startMinutes = isQuickBooking ? selected : customStartMinutes;

  const endMinutes = isQuickBooking ? startMinutes + duration : customEndMinutes;

  const startTime = centralToISO(date, startMinutes);
  const endTime = centralToISO(date, endMinutes);

  return {
    shipId: Number(shipId),
    pilotName: trimPilotName(pilotName),
    startTime,
    endTime,
  };
}
