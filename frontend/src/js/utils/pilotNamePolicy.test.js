import { describe, expect, it } from "vitest";
import cases from "../../../../shared/pilot_name_cases.json";

import { isValidPilotName, trimPilotName } from "./pilotNamePolicy";

describe("shared pilot-name policy", () => {
  it.each(cases)("validates $name", (testCase) => {
    expect(isValidPilotName(testCase.name)).toBe(testCase.valid);

    if (testCase.valid) {
      expect(trimPilotName(testCase.name)).toBe(testCase.normalized);
    }
  });

  it("accepts exactly 100 letters", () => {
    expect(isValidPilotName("A".repeat(100))).toBe(true);
  });

  it("rejects 101 letters", () => {
    expect(isValidPilotName("A".repeat(101))).toBe(false);
  });
});
