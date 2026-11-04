export const TZ = "America/Chicago";

export const SHIPS = [
  { id: 1, name: "USS Wanderer" },
  { id: 2, name: "Nostromo" },
  { id: 3, name: "Serenity" },
  { id: 4, name: "Rocinante" },
  { id: 5, name: "Millennium Falcon" },
];

export const DURATIONS = [60, 90, 120, 150, 180, 240];
export const SLOTS = Array.from({ length: 32 }, (_, i) => 360 + i * 30);

export const pad = (n) => String(n).padStart(2, "0");
export const hhmm = (n) => `${pad(Math.floor(n / 60))}:${pad(n % 60)}`;

export function centralParts(date) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value])
  );
}

export function dateInCentral(date = new Date()) {
  const p = centralParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

export function timeInCentral(iso) {
  const p = centralParts(new Date(iso));
  return `${p.hour}:${p.minute}`;
}

export function dateLabel(date) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00Z`));
}

export function dateTimeLabel(iso) {
  return `${dateLabel(dateInCentral(new Date(iso)))} · ${timeInCentral(iso)} CT`;
}

export function shiftDate(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Convert Central local time into an absolute UTC timestamp.
export function centralToISO(date, minutes) {
  const [year, month, day] = date.split("-").map(Number);

  const wallUTC = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);

  let instant = wallUTC;

  for (let i = 0; i < 3; i++) {
    const p = centralParts(new Date(instant));

    const observed = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);

    instant += wallUTC - observed;
  }

  return new Date(instant).toISOString();
}

export function asArray(value, keys) {
  if (Array.isArray(value)) return value;

  for (const key of keys) {
    if (Array.isArray(value?.[key])) {
      return value[key];
    }
  }

  return [];
}

export function normalizeBooking(b) {
  return {
    id: b.id ?? b.bookingId ?? b.booking_id,
    shipId: Number(b.shipId ?? b.ship_id),
    pilotName: b.pilotName ?? b.pilot_name ?? "Unknown pilot",
    startTime: b.startTime ?? b.start_time,
    endTime: b.endTime ?? b.end_time,
  };
}

export function windowMinutes(value, date) {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return NaN;

  if (/^\d{1,2}:\d{2}$/.test(value)) {
    const [h, m] = value.split(":").map(Number);
    return h * 60 + m;
  }

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return NaN;
  }

  const p = centralParts(d);

  const dayOffset = Math.round(
    (Date.parse(`${p.year}-${p.month}-${p.day}T12:00:00Z`) - Date.parse(`${date}T12:00:00Z`)) /
      86400000
  );

  return dayOffset * 1440 + Number(p.hour) * 60 + Number(p.minute);
}

export function parseAvailability(raw, date) {
  // Blocked windows must come from the backend.
  // They must include the required refueling buffer.
  const source = Array.isArray(raw)
    ? raw
    : (raw?.unavailableWindows ??
      raw?.unavailable_windows ??
      raw?.blockedWindows ??
      raw?.blocked_windows ??
      raw?.unavailable ??
      raw?.blocked ??
      raw?.windows);

  if (!Array.isArray(source)) {
    throw new Error("Availability API did not return a list of blocked windows.");
  }

  return source
    .map((w) =>
      Array.isArray(w)
        ? { start: w[0], end: w[1] }
        : {
            start: w.startTime ?? w.start_time ?? w.start,
            end: w.endTime ?? w.end_time ?? w.end,
          }
    )
    .map((w) => ({
      start: windowMinutes(w.start, date),
      end: windowMinutes(w.end, date),
    }))
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start);
}
