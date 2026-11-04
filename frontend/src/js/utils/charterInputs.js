export function normalizeTimeInput(raw, previous = "") {
  if (raw === "") return "";

  if (!/^[0-9:]*$/.test(raw)) return previous;
  if ((raw.match(/:/g) || []).length > 1) return previous;

  if (raw.includes(":")) {
    const [hours, minutes] = raw.split(":");

    if (!/^\d{1,2}$/.test(hours)) return previous;
    if (!/^\d{0,2}$/.test(minutes)) return previous;
    if (Number(hours) > 23) return previous;

    if (minutes.length > 0 && Number(minutes[0]) > 5) {
      return previous;
    }

    if (hours.length === 1 && minutes.length === 2) {
      return previous === "" ? `${hours.padStart(2, "0")}:${minutes}` : raw;
    }

    return raw;
  }

  // Do not format until all four digits are entered.
  if (!/^\d{1,4}$/.test(raw)) return previous;

  if (raw.length < 4) return raw;

  const hours = raw.slice(0, 2);
  const minutes = raw.slice(2, 4);

  if (Number(hours) > 23) return previous;
  if (Number(minutes) > 59) return previous;

  return `${hours}:${minutes}`;
}

export function isCompleteTime(value) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeCompletedTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);

  if (!match) return value;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (hours > 23 || minutes > 59) return value;

  return `${String(hours).padStart(2, "0")}:${match[2]}`;
}

export function capitalizePilotName(value) {
  return value.replace(
    /(^|[\s'-])(\p{L})/gu,
    (_, separator, letter) => separator + letter.toLocaleUpperCase()
  );
}

export function isValidPilotName(value) {
  const name = value.trim();

  if (name.length < 2 || name.length > 100) {
    return false;
  }

  return /^[\p{L}\p{M}][\p{L}\p{M}\s'-]*$/u.test(name);
}
