import { centralToISO } from "./schedule";
import { capitalizePilotName } from "./charterInputs";

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
  const startTime =
    bookingMode === "quick" ? centralToISO(date, selected) : centralToISO(date, customStartMinutes);

  const endTime =
    bookingMode === "quick"
      ? new Date(new Date(startTime).getTime() + duration * 60000).toISOString()
      : centralToISO(date, customEndMinutes);

  return {
    shipId: Number(shipId),
    pilotName: capitalizePilotName(pilotName.trim()),
    startTime,
    endTime,
  };
}
