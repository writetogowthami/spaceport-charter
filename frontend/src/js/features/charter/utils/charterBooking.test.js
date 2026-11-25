import { describe, expect, it } from "vitest";
import { buildBookingPayload } from "./charterBooking";
import { centralToISO } from "../../../shared/utils/schedule";

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

  it("trims the pilot name", () => {
    const result = buildBookingPayload(base);

    expect(result.pilotName).toBe("alex nova");
  });

  it("uses shared pilot-name trimming without changing capitalization", () => {
    const payload = buildBookingPayload({
      shipId: 1,
      pilotName: "\u0085de la Cruz\uFEFF",
      bookingMode: "custom",
      date: "2030-01-15",
      selected: null,
      duration: 60,
      customStartMinutes: 847,
      customEndMinutes: 884,
    });

    expect(payload.pilotName).toBe("de la Cruz");
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

describe("buildBookingPayload", () => {
  it("preserves pilot capitalization and trims whitespace", () => {
    const payload = buildBookingPayload({
      shipId: 1,
      pilotName: "  McDonald  ",
      bookingMode: "quick",
      date: "2028-01-10",
      selected: 540,
      duration: 60,
    });

    expect(payload.pilotName).toBe("McDonald");
    expect(payload.shipId).toBe(1);
    expect(payload.startTime).toBe("2028-01-10T15:00:00.000Z");
    expect(payload.endTime).toBe("2028-01-10T16:00:00.000Z");
  });

  it("uses exact Central times for custom bookings", () => {
    const payload = buildBookingPayload({
      shipId: 2,
      pilotName: "de la Cruz",
      bookingMode: "custom",
      date: "2028-07-10",
      customStartMinutes: 14 * 60 + 7,
      customEndMinutes: 14 * 60 + 44,
    });

    expect(payload.pilotName).toBe("de la Cruz");
    expect(payload.startTime).toBe("2028-07-10T19:07:00.000Z");
    expect(payload.endTime).toBe("2028-07-10T19:44:00.000Z");
  });
});
