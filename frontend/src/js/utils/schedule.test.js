import { describe, expect, it } from "vitest";

import { SLOTS, centralToISO, dateInCentral, timeInCentral } from "./schedule";

describe("Central Time scheduling", () => {
  it("generates 32 half-hour launch starts", () => {
    expect(SLOTS).toHaveLength(32);
    expect(SLOTS[0]).toBe(360);
    expect(SLOTS.at(-1)).toBe(1290);
  });

  it("preserves arbitrary-minute local times", () => {
    const iso = centralToISO("2026-07-15", 14 * 60 + 7);

    expect(dateInCentral(new Date(iso))).toBe("2026-07-15");
    expect(timeInCentral(iso)).toBe("14:07");
  });

  it("uses CST in January", () => {
    expect(centralToISO("2026-01-15", 600)).toBe("2026-01-15T16:00:00.000Z");
  });

  it("uses CDT in July", () => {
    expect(centralToISO("2026-07-15", 600)).toBe("2026-07-15T15:00:00.000Z");
  });

  it.each([
    "2026-03-08", // Spring DST transition
    "2026-11-01", // Fall DST transition
  ])("preserves operating-hour times on %s", (date) => {
    for (const minutes of [360, 607, 1290, 1320]) {
      const iso = centralToISO(date, minutes);

      expect(dateInCentral(new Date(iso))).toBe(date);

      const hours = String(Math.floor(minutes / 60)).padStart(2, "0");

      const mins = String(minutes % 60).padStart(2, "0");

      expect(timeInCentral(iso)).toBe(`${hours}:${mins}`);
    }
  });

  it("keeps a 60-minute mission within the same local hour span", () => {
    const date = "2026-11-01";
    const startISO = centralToISO(date, 600);

    const endISO = new Date(new Date(startISO).getTime() + 60 * 60000).toISOString();

    expect(timeInCentral(startISO)).toBe("10:00");
    expect(timeInCentral(endISO)).toBe("11:00");
  });
});
