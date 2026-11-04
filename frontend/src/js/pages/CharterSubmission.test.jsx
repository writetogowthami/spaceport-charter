// @vitest-environment jsdom

import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Charter from "./Charter";
import { api } from "../../api";
import { dateInCentral, shiftDate } from "../utils/schedule";

vi.mock("../../api", () => ({
  api: {
    availability: vi.fn(),
    createBooking: vi.fn(),
  },
}));

const ships = [
  { id: 1, name: "Explorer One" },
  { id: 2, name: "Explorer Two" },
];

function deferred() {
  let resolve;

  const promise = new Promise((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

function setup() {
  const onBooked = vi.fn();
  const onFleet = vi.fn();

  render(
    <Charter
      ships={ships}
      shipsReady={true}
      onBooked={onBooked}
      onFleet={onFleet}
    />
  );

  return { onBooked, onFleet };
}

async function prepareBooking() {
  const date = shiftDate(dateInCentral(), 1);

  const dateInput = document.querySelector('input[type="date"]');

  expect(dateInput).not.toBeNull();

  fireEvent.change(dateInput, {
    target: { value: date },
  });

  const pilotInput = document.querySelector('input[aria-label="Pilot name"]');

  expect(pilotInput).not.toBeNull();

  fireEvent.change(pilotInput, {
    target: { value: "alex nova" },
  });

  const customModeButton = Array.from(document.querySelectorAll(".booking-mode-button")).find(
    (button) => button.textContent.trim() === "Custom time"
  );

  expect(customModeButton).toBeDefined();

  fireEvent.click(customModeButton);

  const timeInputs = document.querySelectorAll(".custom-time-fields input");

  expect(timeInputs).toHaveLength(2);

  fireEvent.change(timeInputs[0], {
    target: { value: "10:00" },
  });

  fireEvent.change(timeInputs[1], {
    target: { value: "11:00" },
  });

  const confirmButton = () => document.querySelector(".btn-confirm");

  await waitFor(() => {
    expect(confirmButton()).not.toBeNull();
    expect(confirmButton().disabled).toBe(false);
  });

  return confirmButton();
}

describe("Charter booking submission", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    api.availability.mockResolvedValue({
      unavailableWindows: [],
    });

    window.scrollTo = vi.fn();
  });

  it("submits a booking and displays confirmation", async () => {
    api.createBooking.mockResolvedValue({
      booking: {
        id: 101,
      },
    });

    const { onBooked } = setup();

    const confirmButton = await prepareBooking();

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(api.createBooking).toHaveBeenCalledTimes(1);
    });

    const payload = api.createBooking.mock.calls[0][0];

    expect(payload).toMatchObject({
      shipId: 1,
      pilotName: "Alex Nova",
    });

    expect(new Date(payload.endTime).getTime() - new Date(payload.startTime).getTime()).toBe(
      60 * 60000
    );

    await waitFor(() => {
      expect(onBooked).toHaveBeenCalledTimes(1);
    });

    expect(document.querySelector(".btn-confirm")).toBeNull();

    expect(screen.getByRole("heading", { name: "Mission reservation", level: 1 })).toBeTruthy();

    expect(
      screen.getByText("Your booking is confirmed. Review your mission itinerary below.")
    ).toBeTruthy();

    expect(screen.queryByRole("heading", { name: "Book a spacecraft", level: 1 })).toBeNull();
  });

  it("refreshes availability and clears the selection after HTTP 409", async () => {
    api.createBooking.mockRejectedValue(
      Object.assign(new Error("Schedule conflict"), {
        status: 409,
      })
    );

    setup();

    const confirmButton = await prepareBooking();

    const availabilityCallsBefore = api.availability.mock.calls.length;

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText("Mission could not be confirmed")).toBeTruthy();
    });

    expect(screen.getByText(/Availability was refreshed/i)).toBeTruthy();

    await waitFor(() => {
      expect(api.availability.mock.calls.length).toBeGreaterThan(availabilityCallsBefore);
    });

    await waitFor(() => {
      expect(document.querySelector(".btn-confirm").disabled).toBe(false);
    });
  });

  it("displays a normal API error without refreshing availability", async () => {
    api.createBooking.mockRejectedValue(
      Object.assign(new Error("Server unavailable"), {
        status: 500,
      })
    );

    setup();

    const confirmButton = await prepareBooking();

    const availabilityCallsBefore = api.availability.mock.calls.length;

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(screen.getByText(/Server unavailable/i)).toBeTruthy();
    });

    expect(api.availability.mock.calls.length).toBe(availabilityCallsBefore);

    expect(document.querySelector(".btn-confirm").disabled).toBe(false);
  });

  it("prevents duplicate booking submissions", async () => {
    const pending = deferred();

    api.createBooking.mockReturnValue(pending.promise);

    setup();

    const confirmButton = await prepareBooking();

    fireEvent.click(confirmButton);
    fireEvent.click(confirmButton);

    expect(api.createBooking).toHaveBeenCalledTimes(1);

    expect(document.querySelector(".btn-confirm").disabled).toBe(true);

    await act(async () => {
      pending.resolve({
        booking: {
          id: 102,
        },
      });

      await pending.promise;
    });

    expect(api.createBooking).toHaveBeenCalledTimes(1);
  });
});
