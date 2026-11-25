import { describe, expect, it } from "vitest";

import { DURATIONS, SLOTS } from "./bookingOptions";

describe("Charter booking options", () => {
  it("provides the supported booking durations", () => {
    expect(DURATIONS).toEqual([60, 90, 120, 150, 180, 240]);
  });

  it("generates 32 half-hour launch starts", () => {
    expect(SLOTS).toHaveLength(32);
    expect(SLOTS[0]).toBe(360);
    expect(SLOTS.at(-1)).toBe(1290);
  });
});
