/** @vitest-environment jsdom */

import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { api } from "../../api";
import { dateInCentral, shiftDate } from "../utils/schedule";
import Charter from "./Charter";

vi.mock("../../api", () => ({
  api: {
    availability: vi.fn(),
    createBooking: vi.fn(),
  },
}));

beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("Charter availability consistency", () => {
  it("handles clearing and restoring the mission date without stale availability", async () => {
    api.availability.mockResolvedValue([]);
    render(
      <Charter
        ships={[{ id: 1, name: "USS Wanderer" }]}
        shipsReady={true}
        onBooked={vi.fn()}
        onFleet={vi.fn()}
      />
    );
    const tomorrow = shiftDate(dateInCentral(), 1);
    const input = screen.getByLabelText("MISSION DATE");
    fireEvent.change(input, { target: { value: tomorrow } });
    await screen.findByRole("button", { name: "10:00 to 11:00 Central Time, Available" });
    api.availability.mockClear();
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByText("Choose a mission date to see launch windows.")).toBeTruthy();
    expect(document.querySelector(".btn-confirm").disabled).toBe(true);
    expect(api.availability).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Custom time" }));
    fireEvent.change(screen.getByLabelText("LAUNCH TIME"), { target: { value: "10:00" } });
    fireEvent.change(screen.getByLabelText("RETURN TIME"), { target: { value: "11:00" } });
    expect(screen.getByText("Choose a mission date to check availability.")).toBeTruthy();
    fireEvent.change(input, { target: { value: tomorrow } });
    await waitFor(() => expect(api.availability).toHaveBeenCalledWith(1, tomorrow));
  });

  it("displays consistent mission and schedule headings", () => {
    api.availability.mockResolvedValue([]);

    const ships = [
      { id: 1, name: "USS Wanderer" },
      { id: 2, name: "Nostromo" },
    ];

    render(<Charter ships={ships} shipsReady={true} onBooked={vi.fn()} onFleet={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Mission details", level: 2 })).toBeTruthy();

    expect(screen.getByRole("heading", { name: "Schedule availability", level: 2 })).toBeTruthy();

    expect(
      screen.getByRole("heading", { name: "Available starts for a 60-minute mission", level: 2 })
    ).toBeTruthy();

    expect(screen.getByText("Spacecraft blocked periods")).toBeTruthy();
  });
  it("shows duration-specific return times without changing the blocked periods", async () => {
    api.availability.mockResolvedValue([{ start: "11:00", end: "13:00" }]);

    render(
      <Charter
        ships={[{ id: 1, name: "USS Wanderer" }]}
        shipsReady={true}
        onBooked={vi.fn()}
        onFleet={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("MISSION DATE"), {
      target: { value: shiftDate(dateInCentral(), 1) },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^10:00/ }).disabled).toBe(false);
    });

    expect(
      screen.getByRole("button", { name: "10:00 to 11:00 Central Time, Available" }).textContent
    ).toContain("10:00 – 11:00");
    expect(screen.getByRole("button", { name: /^10:30/ }).disabled).toBe(true);
    expect(screen.getByRole("button", { name: /^13:00/ }).disabled).toBe(false);
    expect(screen.getByRole("button", { name: /^21:30/ }).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText("DURATION"), { target: { value: "90" } });

    expect(
      screen.getByRole("heading", { name: "Available starts for a 90-minute mission" })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: /^10:00/ }).disabled).toBe(true);
    expect(
      screen.getByRole("button", { name: "10:00 to 11:30 Central Time, Unavailable" }).textContent
    ).toContain("10:00 – 11:30");
    expect(
      screen.getByRole("group", { name: "11:00 to 13:00 Central Time, unavailable" })
    ).toBeTruthy();

    fireEvent.change(screen.getByLabelText("DURATION"), { target: { value: "240" } });
    expect(screen.getByRole("button", { name: /^21:30/ }).disabled).toBe(true);
    const nextDayCard = screen.getByRole("button", {
      name: "21:30 to 01:30 Central Time, return next day, Past closing",
    });
    expect(nextDayCard.textContent).toContain("21:30 – 01:30");
    expect(nextDayCard.textContent).toContain("Past closing · +1 day");

    fireEvent.click(screen.getByRole("button", { name: "Custom time" }));
    expect(screen.getByRole("heading", { name: "Select custom mission times" })).toBeTruthy();
  });

  it("disables confirmation until the new spacecraft availability loads", async () => {
    let resolveSecondShip;

    api.availability.mockImplementation((shipId) => {
      if (Number(shipId) === 2) {
        return new Promise((resolve) => {
          resolveSecondShip = resolve;
        });
      }

      return Promise.resolve([]);
    });

    const ships = [
      { id: 1, name: "USS Wanderer" },
      { id: 2, name: "Nostromo" },
    ];

    render(<Charter ships={ships} shipsReady={true} onBooked={vi.fn()} onFleet={vi.fn()} />);

    const tomorrow = shiftDate(dateInCentral(), 1);

    fireEvent.change(screen.getByLabelText("MISSION DATE"), {
      target: { value: tomorrow },
    });

    fireEvent.change(screen.getByLabelText("Pilot name"), {
      target: { value: "Alex Nova" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Custom time" }));

    fireEvent.change(screen.getByLabelText("LAUNCH TIME"), {
      target: { value: "10:00" },
    });

    fireEvent.change(screen.getByLabelText("RETURN TIME"), {
      target: { value: "11:00" },
    });

    const confirmButton = document.querySelector(".btn-confirm");

    expect(confirmButton).not.toBeNull();

    await waitFor(() => {
      expect(confirmButton.disabled).toBe(false);
    });

    fireEvent.change(screen.getByLabelText("SPACECRAFT"), {
      target: { value: "2" },
    });

    expect(confirmButton.disabled).toBe(true);

    expect(api.createBooking).not.toHaveBeenCalled();

    resolveSecondShip([]);

    await waitFor(() => {
      expect(confirmButton.disabled).toBe(false);
    });
  });
  it("ignores stale availability responses after switching spacecraft", async () => {
    let resolveFirstShip;

    api.availability.mockImplementation((shipId) => {
      if (Number(shipId) === 1) {
        return new Promise((resolve) => {
          resolveFirstShip = resolve;
        });
      }

      return Promise.resolve([]);
    });

    const ships = [
      { id: 1, name: "USS Wanderer" },
      { id: 2, name: "Nostromo" },
    ];

    render(<Charter ships={ships} shipsReady={true} onBooked={vi.fn()} onFleet={vi.fn()} />);

    // The first spacecraft's request is still pending.
    expect(api.availability).toHaveBeenCalledWith(1, expect.any(String));

    fireEvent.change(screen.getByLabelText("SPACECRAFT"), {
      target: { value: "2" },
    });

    await waitFor(() => {
      expect(api.availability).toHaveBeenCalledWith(2, expect.any(String));

      expect(screen.getByText("No blocked times")).toBeTruthy();
    });

    // Spacecraft 1 responds after spacecraft 2 has finished loading.
    await act(async () => {
      resolveFirstShip([
        {
          start: "2026-07-15T15:00:00.000Z",
          end: "2026-07-15T16:00:00.000Z",
        },
      ]);
    });

    // Spacecraft 2 must still show its own clear schedule.
    expect(screen.getByText("No blocked times")).toBeTruthy();

    expect(document.querySelectorAll(".blocked-window")).toHaveLength(0);
  });
  it("prevents booking until spacecraft loading succeeds", async () => {
    api.availability.mockResolvedValue([]);

    api.createBooking.mockResolvedValue({
      id: 101,
      shipId: 1,
      pilotName: "Alex Nova",
      startTime: "2028-02-01T16:00:00Z",
      endTime: "2028-02-01T17:00:00Z",
    });

    const ships = [{ id: 1, name: "USS Wanderer" }];
    const onBooked = vi.fn();

    const { rerender } = render(
      <Charter ships={ships} shipsReady={false} onBooked={onBooked} onFleet={vi.fn()} />
    );

    const tomorrow = shiftDate(dateInCentral(), 1);

    fireEvent.change(screen.getByLabelText("MISSION DATE"), {
      target: { value: tomorrow },
    });

    fireEvent.change(screen.getByLabelText("Pilot name"), {
      target: { value: "Alex Nova" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Custom time" }));

    fireEvent.change(screen.getByLabelText("LAUNCH TIME"), {
      target: { value: "10:00" },
    });

    fireEvent.change(screen.getByLabelText("RETURN TIME"), {
      target: { value: "11:00" },
    });

    const confirmButton = document.querySelector(".btn-confirm");

    expect(confirmButton).not.toBeNull();

    // Availability may finish, but spacecraft are not ready.
    await waitFor(() => {
      expect(screen.getByText("No blocked times")).toBeTruthy();
    });

    expect(confirmButton.disabled).toBe(true);

    fireEvent.click(confirmButton);

    expect(api.createBooking).not.toHaveBeenCalled();

    // Simulate the parent successfully loading spacecraft.
    rerender(<Charter ships={ships} shipsReady={true} onBooked={onBooked} onFleet={vi.fn()} />);

    await waitFor(() => {
      expect(confirmButton.disabled).toBe(false);
    });

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(api.createBooking).toHaveBeenCalledTimes(1);
    });

    expect(onBooked).toHaveBeenCalledTimes(1);
  });
});
