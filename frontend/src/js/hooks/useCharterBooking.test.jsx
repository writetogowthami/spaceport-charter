// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../api";
import { useCharterBooking } from "./useCharterBooking";
import { centralToISO } from "../utils/schedule";

vi.mock("../../api", () => ({
  api: {
    createBooking: vi.fn(),
  },
}));

const bookingInput = {
  canSubmit: true,
  shipId: 1,
  pilotName: "alex nova",
  bookingMode: "custom",
  date: "2026-11-10",
  selected: null,
  duration: 60,
  customStartMinutes: 600,
  customEndMinutes: 660,
};

function deferred() {
  let resolve;

  const promise = new Promise((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

function setup() {
  const onBooked = vi.fn();
  const onConflict = vi.fn();

  const hook = renderHook(() => useCharterBooking({ onBooked, onConflict }));

  return { ...hook, onBooked, onConflict };
}

describe("useCharterBooking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
  });

  it("submits a normalized payload and stores confirmation", async () => {
    api.createBooking.mockResolvedValue({
      booking: { id: 101 },
    });

    const { result, onBooked } = setup();

    await act(async () => {
      await result.current.submitBooking(bookingInput);
    });

    expect(api.createBooking).toHaveBeenCalledTimes(1);

    expect(api.createBooking).toHaveBeenCalledWith({
      shipId: 1,
      pilotName: "Alex Nova",
      startTime: centralToISO("2026-11-10", 600),
      endTime: centralToISO("2026-11-10", 660),
    });

    expect(result.current.confirmation).toMatchObject({
      id: 101,
      shipId: 1,
    });

    expect(result.current.submitting).toBe(false);
    expect(result.current.bookingError).toBe("");
    expect(onBooked).toHaveBeenCalledTimes(1);
    expect(window.scrollTo).toHaveBeenCalledTimes(1);
  });

  it("prevents submission when canSubmit is false", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.submitBooking({
        ...bookingInput,
        canSubmit: false,
      });
    });

    expect(api.createBooking).not.toHaveBeenCalled();
    expect(result.current.submitting).toBe(false);
  });

  it("prevents duplicate submissions while a request is pending", async () => {
    const pending = deferred();

    api.createBooking.mockReturnValue(pending.promise);

    const { result, onBooked } = setup();

    let firstRequest;

    act(() => {
      firstRequest = result.current.submitBooking(bookingInput);
    });

    expect(result.current.submitting).toBe(true);

    await act(async () => {
      await result.current.submitBooking(bookingInput);
    });

    expect(api.createBooking).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve({ booking: { id: 102 } });
      await firstRequest;
    });

    expect(result.current.submitting).toBe(false);
    expect(onBooked).toHaveBeenCalledTimes(1);
  });

  it("handles HTTP 409 and requests an availability refresh", async () => {
    api.createBooking.mockRejectedValue(
      Object.assign(new Error("Schedule conflict"), {
        status: 409,
      })
    );

    const { result, onConflict, onBooked } = setup();

    await act(async () => {
      await result.current.submitBooking(bookingInput);
    });

    expect(onConflict).toHaveBeenCalledTimes(1);
    expect(onBooked).not.toHaveBeenCalled();

    expect(result.current.bookingError).toContain("Availability was refreshed");

    expect(result.current.bookingError).toContain("Review the updated schedule");

    expect(result.current.confirmation).toBeNull();
    expect(result.current.submitting).toBe(false);
  });

  it("shows the Quick Selection conflict message", async () => {
    api.createBooking.mockRejectedValue(
      Object.assign(new Error("Slot taken"), {
        status: 409,
      })
    );

    const { result, onConflict } = setup();

    await act(async () => {
      await result.current.submitBooking({
        ...bookingInput,
        bookingMode: "quick",
        selected: 600,
      });
    });

    expect(onConflict).toHaveBeenCalledTimes(1);

    expect(result.current.bookingError).toContain("Your previous launch selection was cleared");
  });

  it("handles other API failures without requesting a refresh", async () => {
    api.createBooking.mockRejectedValue(
      Object.assign(new Error("Server unavailable"), {
        status: 500,
      })
    );

    const { result, onConflict, onBooked } = setup();

    await act(async () => {
      await result.current.submitBooking(bookingInput);
    });

    expect(result.current.bookingError).toContain("Server unavailable");

    expect(onConflict).not.toHaveBeenCalled();
    expect(onBooked).not.toHaveBeenCalled();
    expect(result.current.submitting).toBe(false);
  });

  it("clears the confirmation and booking error when reset", async () => {
    api.createBooking.mockResolvedValue({
      booking: { id: 103 },
    });

    const { result } = setup();

    await act(async () => {
      await result.current.submitBooking(bookingInput);
    });

    expect(result.current.confirmation).not.toBeNull();

    act(() => {
      result.current.setBookingError("Temporary error");
      result.current.resetBooking();
    });

    await waitFor(() => {
      expect(result.current.confirmation).toBeNull();
      expect(result.current.bookingError).toBe("");
    });
  });
});
