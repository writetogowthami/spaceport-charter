import { useMemo } from "react";

import { centralToISO, dateInCentral, shiftDate } from "../../../shared/utils/schedule";

export default function useFleetDerivedData({
  ships,
  bookings,
  now,
  today,
  search,
  shipFilter,
  status,
  from,
  to,
  sort,
  timelineDate,
  timelineDateIsValid,
}) {
  const shipNames = useMemo(
    () => new Map(ships.map((ship) => [Number(ship.id), ship.name])),
    [ships]
  );

  const indexedBookings = useMemo(
    () =>
      bookings.map((booking) => {
        const startMs = Date.parse(booking.startTime);
        const endMs = Date.parse(booking.endTime);

        return {
          booking,
          startMs,
          endMs,
          centralDate: Number.isFinite(startMs) ? dateInCentral(new Date(startMs)) : "",
        };
      }),
    [bookings]
  );

  const bookingDates = useMemo(
    () => new Map(indexedBookings.map(({ booking, centralDate }) => [booking.id, centralDate])),
    [indexedBookings]
  );

  const filtered = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();
    const selectedShip = Number(shipFilter);

    return indexedBookings
      .filter(({ booking, startMs, endMs, centralDate }) => {
        const isCancelled = booking.status === "cancelled";

        const matchesStatus =
          status === "all" ||
          (status === "cancelled"
            ? isCancelled
            : !isCancelled &&
              (status === "upcoming"
                ? endMs >= now
                : status === "past"
                  ? endMs < now
                  : startMs <= now && endMs > now));

        if (!matchesStatus) return false;

        if (shipFilter !== "all" && booking.shipId !== selectedShip) {
          return false;
        }

        if (from && centralDate < from) return false;
        if (to && centralDate > to) return false;

        if (searchTerm) {
          const shipName = shipNames.get(booking.shipId) ?? "";

          const searchableText =
            `${booking.pilotName} ${booking.id ?? ""} ${shipName}`.toLowerCase();

          if (!searchableText.includes(searchTerm)) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => (a.startMs - b.startMs) * (sort === "asc" ? 1 : -1))
      .map(({ booking }) => booking);
  }, [indexedBookings, status, shipFilter, from, to, search, sort, shipNames, now]);

  const filteredByShip = useMemo(() => {
    const groups = new Map();

    for (const booking of filtered) {
      const shipId = Number(booking.shipId);

      if (!groups.has(shipId)) {
        groups.set(shipId, []);
      }

      groups.get(shipId).push(booking);
    }

    return groups;
  }, [filtered]);

  const { upcoming, todayCount, utilization } = useMemo(() => {
    const periodStart = Date.parse(centralToISO(shiftDate(today, -29), 360));
    const periodEnd = Date.parse(centralToISO(today, 1320));

    let upcomingCount = 0;
    let todayMissionCount = 0;
    let bookedMinutes = 0;

    for (const item of indexedBookings) {
      const { booking, startMs, endMs, centralDate } = item;

      if (booking.status === "cancelled") {
        continue;
      }

      if (endMs >= now) {
        upcomingCount += 1;
      }

      if (centralDate === today) {
        todayMissionCount += 1;
      }

      if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
        const overlapMs = Math.max(0, Math.min(periodEnd, endMs) - Math.max(periodStart, startMs));

        bookedMinutes += overlapMs / 60_000;
      }
    }

    const utilizationPercent = ships.length
      ? Math.min(100, (bookedMinutes / (ships.length * 30 * 16 * 60)) * 100).toFixed(1)
      : "0.0";

    return {
      upcoming: upcomingCount,
      todayCount: todayMissionCount,
      utilization: utilizationPercent,
    };
  }, [indexedBookings, ships.length, now, today]);

  const timelineByShip = useMemo(() => {
    const groups = new Map();

    if (!timelineDateIsValid) {
      return groups;
    }

    const dayStart = Date.parse(centralToISO(timelineDate, 0));
    const nextDayStart = Date.parse(centralToISO(shiftDate(timelineDate, 1), 0));

    for (const { booking, startMs, endMs } of indexedBookings) {
      if (booking.status === "cancelled") continue;

      if (
        !Number.isFinite(startMs) ||
        !Number.isFinite(endMs) ||
        startMs >= nextDayStart ||
        endMs <= dayStart
      ) {
        continue;
      }

      const shipId = Number(booking.shipId);

      if (!groups.has(shipId)) {
        groups.set(shipId, []);
      }

      groups.get(shipId).push(booking);
    }

    return groups;
  }, [indexedBookings, timelineDate, timelineDateIsValid]);

  return {
    bookingDates,
    filtered,
    filteredByShip,
    upcoming,
    todayCount,
    utilization,
    timelineByShip,
  };
}
