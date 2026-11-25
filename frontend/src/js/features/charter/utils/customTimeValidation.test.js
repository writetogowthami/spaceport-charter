import { describe, expect, it } from "vitest";
import { centralToISO } from "../../../shared/utils/schedule";
import { parseTime, validateCustomTime } from "./charterAvailability";

describe("Custom Time validation", () => {
  const date = "2026-07-15";

  const base = {
    customStart: "10:00",
    customEnd: "11:00",
    date,
    now: new Date(centralToISO(date, 360)).getTime() - 60000,
    windows: [],
    loading: false,
    availabilityIsCurrent: true,
    error: "",
  };

  it("parses valid times", () => {
    expect(parseTime("10:07")).toBe(607);
    expect(parseTime("22:00")).toBe(1320);
  });

  it("rejects invalid times", () => {
    expect(Number.isNaN(parseTime("25:00"))).toBe(true);
    expect(Number.isNaN(parseTime("10:99"))).toBe(true);
    expect(Number.isNaN(parseTime("9:30"))).toBe(true);
  });

  it("accepts a valid arbitrary-minute mission", () => {
    expect(
      validateCustomTime({
        ...base,
        customStart: "10:07",
        customEnd: "11:13",
      }).valid
    ).toBe(true);
  });

  it("treats incomplete input as neutral", () => {
    const result = validateCustomTime({
      ...base,
      customEnd: "11:",
    });

    expect(result.valid).toBe(false);
    expect(result.neutral).toBe(true);
  });

  it("rejects return times before launch", () => {
    const result = validateCustomTime({
      ...base,
      customEnd: "09:30",
    });

    expect(result.valid).toBe(false);
    expect(result.message).toContain("later than launch");
  });

  it("enforces operating hours", () => {
    expect(
      validateCustomTime({
        ...base,
        customStart: "05:59",
      }).valid
    ).toBe(false);

    expect(
      validateCustomTime({
        ...base,
        customEnd: "22:01",
      }).valid
    ).toBe(false);
  });

  it("allows a return exactly at closing", () => {
    expect(
      validateCustomTime({
        ...base,
        customStart: "21:00",
        customEnd: "22:00",
      }).valid
    ).toBe(true);
  });

  it("rejects launches in the past", () => {
    const result = validateCustomTime({
      ...base,
      now: new Date(centralToISO(date, 600)).getTime(),
    });

    expect(result.valid).toBe(false);
    expect(result.message).toContain("in the past");
  });

  it("rejects overlapping blocked windows", () => {
    const result = validateCustomTime({
      ...base,
      windows: [{ start: 630, end: 690 }],
    });

    expect(result.valid).toBe(false);
    expect(result.message).toContain("refueling buffer");
  });

  it("allows missions touching blocked-window boundaries", () => {
    expect(
      validateCustomTime({
        ...base,
        customEnd: "11:00",
        windows: [{ start: 660, end: 720 }],
      }).valid
    ).toBe(true);
  });

  it("blocks validation while availability loads", () => {
    const result = validateCustomTime({
      ...base,
      loading: true,
    });

    expect(result.valid).toBe(false);
    expect(result.neutral).toBe(true);
  });

  it("blocks stale availability", () => {
    const result = validateCustomTime({
      ...base,
      availabilityIsCurrent: false,
    });

    expect(result.valid).toBe(false);
    expect(result.neutral).toBe(true);
  });

  it("blocks validation after an availability error", () => {
    const result = validateCustomTime({
      ...base,
      error: "Network error",
    });

    expect(result.valid).toBe(false);
    expect(result.message).toContain("could not be verified");
  });
});
