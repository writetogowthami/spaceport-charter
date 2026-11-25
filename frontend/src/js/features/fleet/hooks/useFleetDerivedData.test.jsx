// @vitest-environment jsdom

import React from "react";
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import useFleetDerivedData from "./useFleetDerivedData";

const ships = [
  { id: 1, name: "Explorer" },
  { id: 2, name: "Pioneer" },
];

const bookings = [
  {
    id: 101,
    shipId: 1,
    pilotName: "Ada",
    status: "confirmed",
    startTime: "2026-11-16T15:00:00Z",
    endTime: "2026-11-16T16:00:00Z",
  },
  {
    id: 102,
    shipId: 2,
    pilotName: "Grace",
    status: "confirmed",
    startTime: "2026-11-16T17:00:00Z",
    endTime: "2026-11-16T18:00:00Z",
  },
  {
    id: 103,
    shipId: 1,
    pilotName: "Alan",
    status: "cancelled",
    startTime: "2026-11-16T19:00:00Z",
    endTime: "2026-11-16T20:00:00Z",
  },
];

function options(overrides = {}) {
  return {
    ships,
    bookings,
    now: Date.parse("2026-11-16T14:00:00Z"),
    today: "2026-11-16",
    search: "",
    shipFilter: "all",
    status: "all",
    from: "",
    to: "",
    sort: "asc",
    timelineDate: "2026-11-16",
    timelineDateIsValid: true,
    ...overrides,
  };
}

function renderDerived(overrides = {}) {
  return renderHook(() => useFleetDerivedData(options(overrides)));
}

describe("useFleetDerivedData", () => {
  it("indexes booking dates and groups filtered reservations", () => {
    const { result } = renderDerived();

    expect(result.current.filtered.map((booking) => booking.id)).toEqual([101, 102, 103]);

    expect(result.current.bookingDates.get(101)).toBe("2026-11-16");
    expect(result.current.filteredByShip.get(1).map((booking) => booking.id)).toEqual([101, 103]);
    expect(result.current.filteredByShip.get(2).map((booking) => booking.id)).toEqual([102]);
  });

  it("filters by search, spacecraft, status, and date", () => {
    const { result } = renderDerived({
      search: "ada",
      shipFilter: "1",
      status: "upcoming",
      from: "2026-11-16",
      to: "2026-11-16",
    });

    expect(result.current.filtered.map((booking) => booking.id)).toEqual([101]);
  });

  it("sorts reservations in descending start-time order", () => {
    const { result } = renderDerived({ sort: "desc" });

    expect(result.current.filtered.map((booking) => booking.id)).toEqual([103, 102, 101]);
  });

  it("excludes cancelled reservations from mission statistics", () => {
    const { result } = renderDerived();

    expect(result.current.upcoming).toBe(2);
    expect(result.current.todayCount).toBe(2);
    expect(result.current.utilization).toBe("0.2");
  });

  it("keeps the timeline independent of reservation filters", () => {
    const { result } = renderDerived({
      search: "ada",
      shipFilter: "1",
      status: "cancelled",
      from: "2026-11-17",
      to: "2026-11-17",
    });

    expect(result.current.filtered).toEqual([]);
    expect(result.current.timelineByShip.get(1).map((booking) => booking.id)).toEqual([101]);
    expect(result.current.timelineByShip.get(2).map((booking) => booking.id)).toEqual([102]);
  });

  it("returns an empty timeline for an invalid date", () => {
    const { result } = renderDerived({
      timelineDate: "invalid",
      timelineDateIsValid: false,
    });

    expect(result.current.timelineByShip.size).toBe(0);
  });

  it("assigns bookings to the correct Central Time date", () => {
    const boundaryBooking = {
      id: 104,
      shipId: 1,
      pilotName: "Katherine",
      status: "confirmed",
      startTime: "2026-11-17T02:00:00Z",
      endTime: "2026-11-17T03:00:00Z",
    };

    const { result } = renderDerived({
      bookings: [boundaryBooking],
    });

    expect(result.current.bookingDates.get(104)).toBe("2026-11-16");
    expect(result.current.timelineByShip.get(1).map((booking) => booking.id)).toEqual([104]);
  });

  it("returns zero utilization for an empty fleet", () => {
    const { result } = renderDerived({
      ships: [],
      bookings: [],
    });

    expect(result.current.utilization).toBe("0.0");
    expect(result.current.upcoming).toBe(0);
    expect(result.current.todayCount).toBe(0);
  });
});
