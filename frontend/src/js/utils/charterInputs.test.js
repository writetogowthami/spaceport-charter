import { describe, expect, it } from "vitest";

import {
  normalizeTimeInput,
  isCompleteTime,
  normalizeCompletedTime,
  isValidPilotName,
} from "./charterInputs";

describe("pilot-name validation", () => {
  it.each([
    "Alex Nova",
    "José Álvarez",
    "O'Connor",
    "Anne-Marie",
    "de la Cruz",
    "McDonald",
    "  alex nova  ",
    "A\u0301lex",
    "A".repeat(100),
  ])("accepts valid name: %s", (name) => {
    expect(isValidPilotName(name)).toBe(true);
  });

  it.each([
    "",
    " ",
    "A",
    "A".repeat(101),
    "Alex123",
    "Alex!",
    "Alex_Nova",
    "Alex\tNova",
    "Alex\nNova",
    "Alex\u0000Nova",
    "Alex🚀",
    null,
    undefined,
  ])("rejects invalid name: %s", (name) => {
    expect(isValidPilotName(name)).toBe(false);
  });
});

describe("Charter time input", () => {
  it("rejects alphabetic characters", () => {
    expect(normalizeTimeInput("12a", "12")).toBe("12");
  });

  it("formats four digits", () => {
    expect(normalizeTimeInput("1430")).toBe("14:30");
  });

  it("rejects invalid hours", () => {
    expect(normalizeTimeInput("2530", "14:30")).toBe("14:30");
  });

  it("rejects invalid minutes", () => {
    expect(normalizeTimeInput("1469", "14:30")).toBe("14:30");
  });

  it("normalizes single-digit hours", () => {
    expect(normalizeCompletedTime("6:30")).toBe("06:30");
  });

  it("recognizes complete times", () => {
    expect(isCompleteTime("06:30")).toBe(true);
    expect(isCompleteTime("6:30")).toBe(false);
  });
  it("normalizes a complete single-digit hour immediately", () => {
    expect(normalizeTimeInput("6:30")).toBe("06:30");
  });

  it("preserves incomplete single-digit hour input", () => {
    expect(normalizeTimeInput("6:")).toBe("6:");
    expect(normalizeTimeInput("6:3")).toBe("6:3");
  });

  it("allows editing a completed time", () => {
    expect(normalizeTimeInput("06:3", "06:30")).toBe("06:3");
    expect(normalizeTimeInput("", "06:30")).toBe("");
  });

  it("rejects invalid time values", () => {
    expect(normalizeTimeInput("24:00", "12:00")).toBe("12:00");
    expect(normalizeTimeInput("6:60", "12:00")).toBe("12:00");
  });

  it("produces a valid time immediately after completion", () => {
    const value = normalizeTimeInput("6:30");

    expect(value).toBe("06:30");
    expect(isCompleteTime(value)).toBe(true);
  });
  it("accepts arbitrary valid minutes", () => {
    expect(normalizeTimeInput("14:07")).toBe("14:07");
    expect(normalizeTimeInput("21:59")).toBe("21:59");
    expect(normalizeTimeInput("0001")).toBe("00:01");
  });

  it("rejects extra characters and extra colons", () => {
    expect(normalizeTimeInput("14:300", "14:30")).toBe("14:30");
    expect(normalizeTimeInput("14::30", "14:30")).toBe("14:30");
    expect(normalizeTimeInput("14:3a", "14:30")).toBe("14:30");
  });

  it("preserves partial edits", () => {
    expect(normalizeTimeInput("14:3", "14:30")).toBe("14:3");
    expect(normalizeTimeInput("14:", "14:30")).toBe("14:");
    expect(normalizeTimeInput("", "14:30")).toBe("");
  });

  it("does not accept incomplete times as valid", () => {
    expect(isCompleteTime("6:3")).toBe(false);
    expect(isCompleteTime("06:3")).toBe(false);
    expect(isCompleteTime("")).toBe(false);
  });

  it("normalizes completed times without changing minutes", () => {
    expect(normalizeCompletedTime("6:07")).toBe("06:07");
    expect(normalizeCompletedTime("14:07")).toBe("14:07");
  });
  it("allows editing the hour of an existing time", () => {
    expect(normalizeTimeInput("1:20", "17:20")).toBe("1:20");
    expect(normalizeTimeInput("15:20", "1:20")).toBe("15:20");
    expect(normalizeTimeInput("12:20", "1:20")).toBe("12:20");
    expect(normalizeTimeInput("13:20", "1:20")).toBe("13:20");
  });

  it("normalizes a single-digit hour when editing finishes", () => {
    expect(normalizeCompletedTime("1:20")).toBe("01:20");
    expect(normalizeCompletedTime("6:30")).toBe("06:30");
  });
});

describe("Pilot name", () => {
  it("rejects whitespace-only names", () => {
    expect(isValidPilotName("   ")).toBe(false);
  });

  it("accepts valid names", () => {
    expect(isValidPilotName("Captain Nova")).toBe(true);
  });
});
