/** @vitest-environment jsdom */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Confirmation from "./Confirmation";

afterEach(cleanup);

describe("Confirmation refueling policy", () => {
  it.each([30, 90])("shows the spacecraft's %i-minute policy", (refuelMinutes) => {
    render(
      <Confirmation
        booking={{
          id: 42,
          shipId: 1,
          pilotName: "QA Pilot",
          startTime: "2030-01-15T16:00:00Z",
          endTime: "2030-01-15T17:00:00Z",
        }}
        ship={{ id: 1, name: "USS Wanderer", refuelMinutes }}
        onAgain={vi.fn()}
        onFleet={vi.fn()}
      />
    );
    expect(
      screen.getByText(`${refuelMinutes}-minute refueling buffer between missions`)
    ).toBeTruthy();
  });
});
