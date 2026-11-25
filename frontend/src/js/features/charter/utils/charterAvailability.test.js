import { describe, expect, it } from "vitest";
import { isQuickSlotAvailable, overlapsBlockedWindow } from "./charterAvailability";
import { centralToISO } from "../../../shared/utils/schedule";

describe("Charter availability", () => {
  const date = "2026-07-15";
  const now = new Date(centralToISO(date, 360)).getTime() - 60000;

  const base = {
    start: 600,
    duration: 60,
    date,
    now,
    windows: [],
    availabilityIsCurrent: true,
    loading: false,
    error: "",
  };

  it("allows an available future mission", () => {
    expect(isQuickSlotAvailable(base)).toBe(true);
  });

  it("rejects a mission that extends past closing", () => {
    expect(
      isQuickSlotAvailable({
        ...base,
        start: 1290,
        duration: 60,
      })
    ).toBe(false);
  });

  it("allows a mission ending exactly at closing", () => {
    expect(
      isQuickSlotAvailable({
        ...base,
        start: 1260,
        duration: 60,
      })
    ).toBe(true);
  });

  it("rejects a launch in the past", () => {
    expect(
      isQuickSlotAvailable({
        ...base,
        now: new Date(centralToISO(date, 600)).getTime(),
      })
    ).toBe(false);
  });

  it("rejects overlapping blocked windows", () => {
    expect(
      isQuickSlotAvailable({
        ...base,
        windows: [{ start: 630, end: 690 }],
      })
    ).toBe(false);
  });

  it("allows missions touching a blocked-window boundary", () => {
    expect(overlapsBlockedWindow(600, 660, [{ start: 660, end: 720 }])).toBe(false);
    expect(overlapsBlockedWindow(720, 780, [{ start: 660, end: 720 }])).toBe(false);
  });

  it("rejects availability that belongs to an old selection", () => {
    expect(
      isQuickSlotAvailable({
        ...base,
        availabilityIsCurrent: false,
      })
    ).toBe(false);
  });

  it("rejects availability while loading", () => {
    expect(
      isQuickSlotAvailable({
        ...base,
        loading: true,
      })
    ).toBe(false);
  });

  it("rejects availability when the API fails", () => {
    expect(
      isQuickSlotAvailable({
        ...base,
        error: "Unable to load availability",
      })
    ).toBe(false);
  });
});
