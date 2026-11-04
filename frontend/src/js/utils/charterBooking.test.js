import { describe, expect, it } from "vitest";
import { buildBookingPayload } from "./charterBooking";
import { centralToISO } from "./schedule";

describe("Booking payload construction", () => {
  const base = {
    shipId: "2",
    pilotName: "  alex nova  ",
    bookingMode: "quick",
    date: "2026-07-15",
    selected: 600,
    duration: 60,
    customStartMinutes: NaN,
    customEndMinutes: NaN,
  };

  it("converts spacecraft ID to a number", () => {
    const result = buildBookingPayload(base);

    expect(result.shipId).toBe(2);
  });

  it("trims and capitalizes the pilot name", () => {
    const result = buildBookingPayload(base);

    expect(result.pilotName).toBe("Alex Nova");
  });

  it("creates correct Quick Selection timestamps", () => {
    const result = buildBookingPayload(base);

    expect(result.startTime).toBe(centralToISO("2026-07-15", 600));

    expect(result.endTime).toBe(
      new Date(new Date(result.startTime).getTime() + 60 * 60000).toISOString()
    );
  });

  it("preserves a 90-minute Quick Selection duration", () => {
    const result = buildBookingPayload({
      ...base,
      duration: 90,
    });

    expect(new Date(result.endTime).getTime() - new Date(result.startTime).getTime()).toBe(
      90 * 60000
    );
  });

  it("creates exact Custom Time timestamps", () => {
    const result = buildBookingPayload({
      ...base,
      bookingMode: "custom",
      customStartMinutes: 607,
      customEndMinutes: 673,
    });

    expect(result.startTime).toBe(centralToISO("2026-07-15", 607));

    expect(result.endTime).toBe(centralToISO("2026-07-15", 673));
  });

  it("does not use the Quick Selection duration for Custom Time", () => {
    const result = buildBookingPayload({
      ...base,
      bookingMode: "custom",
      duration: 240,
      customStartMinutes: 600,
      customEndMinutes: 645,
    });

    expect(new Date(result.endTime).getTime() - new Date(result.startTime).getTime()).toBe(
      45 * 60000
    );
  });

  it("preserves Quick Selection elapsed duration across spring DST", () => {
    const result = buildBookingPayload({
      ...base,
      date: "2026-03-08",
      selected: 360,
      duration: 120,
    });

    expect(new Date(result.endTime).getTime() - new Date(result.startTime).getTime()).toBe(
      120 * 60000
    );
  });

  it("preserves Quick Selection elapsed duration across fall DST", () => {
    const result = buildBookingPayload({
      ...base,
      date: "2026-11-01",
      selected: 360,
      duration: 120,
    });

    expect(new Date(result.endTime).getTime() - new Date(result.startTime).getTime()).toBe(
      120 * 60000
    );
  });
});
