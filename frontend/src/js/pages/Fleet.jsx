import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api";
import {
  asArray,
  normalizeBooking,
  dateInCentral,
  dateLabel,
  timeInCentral,
  shiftDate,
  centralToISO,
  windowMinutes,
  pad,
  isValidDate,
} from "../utils/schedule";
import TimeRange from "../components/TimeRange";
import Notification from "../components/Notification";

export default function Fleet({ ships, version }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [search, setSearch] = useState("");
  const [shipFilter, setShipFilter] = useState("all");
  const [status, setStatus] = useState("upcoming");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [sort, setSort] = useState("asc");
  const [timelineDate, setTimelineDate] = useState(dateInCentral());
  const timelineDateIsValid = isValidDate(timelineDate);
  const [expandedShips, setExpandedShips] = useState({});
  const [hoveredMission, setHoveredMission] = useState(null);
  const [selectedMission, setSelectedMission] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancellationError, setCancellationError] = useState("");
  const [notification, setNotification] = useState(null);
  const notificationId = useRef(0);
  const cancelDialogRef = useRef(null);
  const cancellationLock = useRef(false);

  useEffect(() => {
    if (!cancelTarget) return;

    const dialog = cancelDialogRef.current;
    const previousFocus = document.activeElement;
    dialog.querySelector("button")?.focus();

    function handleDialogKey(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!cancellationLock.current) setCancelTarget(null);
        return;
      }
      if (event.key !== "Tab") return;

      const buttons = [...dialog.querySelectorAll("button:not(:disabled)")];
      const first = buttons[0];
      const last = buttons.at(-1);
      if (!first) {
        event.preventDefault();
        dialog.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKey);
    return () => {
      document.removeEventListener("keydown", handleDialogKey);
      const target = previousFocus?.isConnected ? previousFocus : document.querySelector("main h1");
      target?.focus({ preventScroll: true });
    };
  }, [cancelTarget]);

  function notify(type, title, message) {
    notificationId.current += 1;
    setNotification({
      id: notificationId.current,
      type,
      title,
      message,
    });
  }
  const activeMission = selectedMission ?? hoveredMission;

  useEffect(() => {
    setExpandedShips((current) => (Object.keys(current).length === 0 ? current : {}));
  }, [search, shipFilter, status, from, to, sort]);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");

    api
      .bookings()
      .then((data) => {
        if (!active) return;

        const list = asArray(data, ["bookings", "data", "items"]);

        setBookings(list.map(normalizeBooking));
        setHasLoaded(true);
      })
      .catch((err) => {
        if (!active) return;

        const message = `Unable to load fleet bookings: ${err.message}`;

        setError(message);

        notificationId.current += 1;
        setNotification({
          id: notificationId.current,
          type: "error",
          title: "Fleet schedule unavailable",
          message,
        });
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [refresh, version]);

  useEffect(() => {
    setHoveredMission(null);
    setSelectedMission(null);
  }, [timelineDate, bookings]);

  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const refreshClock = () => setNow(Date.now());

    const timer = window.setInterval(refreshClock, 60_000);

    window.addEventListener("focus", refreshClock);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshClock);
    };
  }, []);

  const today = useMemo(() => dateInCentral(new Date(now)), [now]);

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

  function clearFilters() {
    setSearch("");
    setShipFilter("all");
    setStatus("upcoming");
    setFrom("");
    setTo("");
    setSort("asc");
  }

  async function confirmCancellation() {
    if (!cancelTarget || cancellationLock.current) return;

    cancellationLock.current = true;
    setCancelling(true);
    setCancellationError("");

    try {
      const updated = normalizeBooking(await api.cancelBooking(cancelTarget.id));

      setBookings((current) =>
        current.map((booking) => (booking.id === updated.id ? updated : booking))
      );

      setCancelTarget(null);

      notify(
        "success",
        "Reservation cancelled",
        `Reservation #${updated.id} was cancelled. ` +
          "Its mission window and refueling buffer are now available."
      );
    } catch (err) {
      setCancellationError(
        (err.message || "Cancellation unsuccessful. Please try again.") +
          (err.status === 409 ? " Close this dialog and refresh the fleet schedule." : "")
      );
    } finally {
      cancellationLock.current = false;
      setCancelling(false);
    }
  }

  function requestCancellation(booking) {
    setNotification(null);
    setCancellationError("");
    setCancelTarget(booking);
  }

  return (
    <main className="container fleet-page">
      <div className="page-intro">
        <div className="eyebrow">FLEET OPERATIONS</div>

        <h1 tabIndex="-1">Fleet Manager</h1>

        <p>Monitor scheduled missions, spacecraft availability, and fleet operations.</p>
      </div>

      <div className="stats">
        {[
          ["TOTAL SPACECRAFT", ships.length, "Ships in the fleet"],
          ["ALL-TIME BOOKINGS", bookings.length, "All recorded reservations"],
          ["UPCOMING / ACTIVE MISSIONS", upcoming, "Upcoming and active missions"],
          ["TODAY'S MISSIONS", todayCount, dateLabel(today)],
          ["30-DAY FLEET UTILIZATION", `${utilization}%`, "Booked operating time"],
        ].map(([label, value, note]) => (
          <div className="stat" key={label}>
            <span>{label}</span>
            <strong>{hasLoaded ? value : "—"}</strong>
            <small>{note}</small>
          </div>
        ))}
      </div>

      <p className="utilization-note">
        30-day fleet utilization: mission minutes across all spacecraft ÷ fleet operating capacity
        (spacecraft × 30 days × 16 hours). Covers today and the previous 29 Central Time dates;
        excludes refueling buffers.
      </p>

      <div className="fleet-status" role="status" aria-live="polite">
        {loading
          ? hasLoaded
            ? "Refreshing fleet schedule; showing previous results…"
            : "Loading fleet schedule…"
          : error
            ? hasLoaded
              ? "Fleet schedule could not be refreshed; showing the last loaded results."
              : "Fleet schedule is unavailable."
            : ""}
      </div>

      <div className="fleet-title">
        <div>
          <h2>Fleet schedule</h2>

          <p>Search and review reservations by spacecraft.</p>
        </div>

        <button
          type="button"
          className="btn-outline"
          disabled={loading}
          onClick={() => setRefresh((n) => n + 1)}
        >
          ↻ Refresh
        </button>
      </div>

      <div className="filters">
        <label>
          <span>SEARCH RESERVATIONS</span>

          <input
            placeholder="Pilot, spacecraft, or booking ID"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <label>
          <span>SPACECRAFT</span>

          <select value={shipFilter} onChange={(e) => setShipFilter(e.target.value)}>
            <option value="all">All spacecraft</option>

            {ships.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>BOOKING STATUS</span>

          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="upcoming">Upcoming & active</option>

            <option value="all">All bookings</option>

            <option value="past">Past</option>

            <option value="active">Active now</option>

            <option value="cancelled">Cancelled</option>
          </select>
        </label>

        <label>
          <span>FROM DATE</span>

          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>

        <label>
          <span>TO DATE</span>

          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>

        <label>
          <span>SORT BY DATE</span>

          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="asc">Earliest first</option>

            <option value="desc">Latest first</option>
          </select>
        </label>
      </div>

      <div className="filter-footer">
        <span>
          {hasLoaded ? `${filtered.length} matching reservations` : "Reservations not yet loaded"}
          {loading && " · Loading…"}
        </span>

        <button type="button" onClick={clearFilters}>
          Clear filters
        </button>
      </div>

      {error && (
        <div className="error-inline" role="alert">
          {error}
        </div>
      )}

      <p className="timeline-context">
        The timeline shows all missions on its selected day, independently of the filters.
        Spacecraft booking cards below follow the search, status, date, and spacecraft filters.
      </p>

      <section className="panel timeline-panel">
        <div className="between">
          <div className="timeline-heading">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="5" width="18" height="16" rx="3" />
              <path d="M8 3v4M16 3v4M3 10h18" />
              <path d="M8 14h3M13 14h3M8 17h3" />
            </svg>
            <div>
              <h2>Daily mission timeline</h2>
              <p>Selected day: {dateLabel(timelineDate)} · missions and refueling windows</p>
            </div>
          </div>

          <div className="timeline-controls">
            <button
              type="button"
              aria-label="Previous timeline day"
              disabled={!timelineDateIsValid}
              onClick={() => setTimelineDate((d) => shiftDate(d, -1))}
            >
              ‹
            </button>

            <input
              type="date"
              aria-label="Timeline date"
              value={timelineDate}
              onChange={(e) => setTimelineDate(e.target.value)}
            />

            <button
              type="button"
              aria-label="Next timeline day"
              disabled={!timelineDateIsValid}
              onClick={() => setTimelineDate((d) => shiftDate(d, 1))}
            >
              ›
            </button>
          </div>
        </div>

        <p className="timeline-day-status" role="status">
          {!timelineDateIsValid
            ? "Choose a timeline date."
            : !hasLoaded
              ? loading
                ? "Loading timeline…"
                : "Timeline unavailable."
              : !ships.some((ship) => (timelineByShip.get(Number(ship.id)) ?? []).length > 0)
                ? `No missions scheduled for ${dateLabel(timelineDate)}.`
                : "All times Central Time · teal missions · amber refueling buffers"}
        </p>

        <div className="timeline-scroll">
          <div className="timeline-inner">
            <div className="timeline-axis">
              <span>SPACECRAFT</span>

              <div className="timeline-hours" aria-hidden="true">
                {[6, 8, 10, 12, 14, 16, 18, 20, 22].map((hour, index) => (
                  <span key={hour} style={{ left: `${index * 12.5}%` }}>
                    {pad(hour)}:00
                  </span>
                ))}
              </div>
            </div>

            {ships.map((s) => (
              <div className="timeline-row" key={s.id}>
                <strong>{s.name}</strong>

                <div className="track">
                  {(timelineByShip.get(Number(s.id)) ?? []).map((b, i) => {
                    const start = windowMinutes(b.startTime, timelineDate);

                    const end = windowMinutes(b.endTime, timelineDate);
                    const left = Math.min(960, Math.max(0, start - 360));
                    const right = Math.min(960, Math.max(0, end - 360));
                    const width = Math.max(0, right - left);

                    const refuelMinutes = Number(s.refuelMinutes ?? 30);

                    const bufferBefore = Math.min(refuelMinutes, left);
                    const bufferAfter = Math.min(refuelMinutes, 960 - right);

                    if (width <= 0) {
                      return null;
                    }
                    return (
                      <React.Fragment key={b.id ?? i}>
                        {bufferBefore > 0 && (
                          <div
                            className="buffer-bar"
                            title={`${refuelMinutes}-minute pre-mission refueling buffer`}
                            style={{
                              left: `${((left - bufferBefore) / 960) * 100}%`,
                              width: `${(bufferBefore / 960) * 100}%`,
                            }}
                          />
                        )}

                        <button
                          type="button"
                          className="mission-bar"
                          aria-label={`${s.name}, pilot ${b.pilotName}, ${timeInCentral(
                            b.startTime
                          )} to ${timeInCentral(b.endTime)} Central Time`}
                          aria-pressed={selectedMission?.key === `${s.id}-${b.id ?? i}`}
                          onMouseEnter={() => {
                            setHoveredMission({
                              key: `${s.id}-${b.id ?? i}`,
                              id: b.id,
                              ship: s.name,
                              pilot: b.pilotName,
                              start: b.startTime,
                              end: b.endTime,
                            });
                          }}
                          onMouseLeave={() => {
                            setHoveredMission(null);
                          }}
                          onFocus={() => {
                            setHoveredMission({
                              key: `${s.id}-${b.id ?? i}`,
                              id: b.id,
                              ship: s.name,
                              pilot: b.pilotName,
                              start: b.startTime,
                              end: b.endTime,
                            });
                          }}
                          onBlur={() => {
                            setHoveredMission(null);
                          }}
                          onClick={() => {
                            const mission = {
                              key: `${s.id}-${b.id ?? i}`,
                              id: b.id,
                              ship: s.name,
                              pilot: b.pilotName,
                              start: b.startTime,
                              end: b.endTime,
                            };

                            setSelectedMission((current) =>
                              current?.key === mission.key ? null : mission
                            );
                          }}
                          style={{
                            left: `${(left / 960) * 100}%`,
                            width: `${(width / 960) * 100}%`,
                          }}
                        />

                        {bufferAfter > 0 && (
                          <div
                            className="buffer-bar"
                            title={`${refuelMinutes}-minute post-mission refueling buffer`}
                            style={{
                              left: `${(right / 960) * 100}%`,
                              width: `${(bufferAfter / 960) * 100}%`,
                            }}
                          />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        {activeMission && (
          <div className="timeline-mission-details" role="status">
            <div className="timeline-mission-details-heading">
              <div>
                <span className="timeline-detail-label">
                  {selectedMission ? "SELECTED MISSION" : "MISSION PREVIEW"}
                </span>
                <strong>{activeMission.ship}</strong>
              </div>

              <button
                type="button"
                className="timeline-detail-close"
                aria-label="Close mission details"
                onClick={() => {
                  setSelectedMission(null);
                  setHoveredMission(null);
                }}
              >
                ×
              </button>
            </div>

            <div className="timeline-mission-details-grid">
              <div>
                <span>Pilot</span>
                <strong>{activeMission.pilot}</strong>
              </div>

              <div>
                <span>Launch window</span>
                <TimeRange
                  start={timeInCentral(activeMission.start)}
                  end={timeInCentral(activeMission.end)}
                />
              </div>

              <div>
                <span>Reservation</span>
                <strong>
                  {activeMission.id != null ? `#${activeMission.id}` : "Not available"}
                </strong>
              </div>
            </div>
          </div>
        )}
        <div className="legend timeline-legend">
          <span>
            <i className="reserved-dot" aria-hidden="true" />
            Reserved mission
          </span>

          <span>
            <i className="buffer-dot" aria-hidden="true" />
            Refueling buffer
          </span>

          <span>
            <i className="track-dot" aria-hidden="true" />
            Available
          </span>
        </div>
      </section>
      <div className="fleet-grid" aria-busy={loading}>
        {ships
          .filter((s) => shipFilter === "all" || Number(shipFilter) === Number(s.id))
          .map((s) => {
            const list = filteredByShip.get(Number(s.id)) ?? [];

            return (
              <section className="panel ship-card" key={s.id}>
                <div className="between">
                  <div className="ship-card-title">
                    <h3>{s.name}</h3>
                  </div>

                  <span className="count-pill">
                    {hasLoaded
                      ? `${list.length} ${list.length === 1 ? "reservation" : "reservations"}`
                      : "—"}
                  </span>
                </div>

                {list.length ? (
                  <div className="booking-list" id={`ship-bookings-${s.id}`}>
                    {list.slice(0, expandedShips[s.id] ? list.length : 5).map((b, i) => (
                      <div
                        className={`booking-row ${
                          b.status === "cancelled" ? "booking-row-cancelled" : ""
                        }`}
                        key={b.id ?? i}
                      >
                        <div className="booking-pilot">
                          <div className="booking-identity">
                            <strong>{b.pilotName}</strong>
                            {b.id != null && <small>Reservation #{b.id}</small>}
                            {b.status === "cancelled" && (
                              <span className="booking-cancelled-label">
                                <span aria-hidden="true">×</span>
                                Cancelled
                              </span>
                            )}
                            {b.status === "confirmed" && Date.parse(b.startTime) > now && (
                              <button
                                type="button"
                                className="booking-cancel-button"
                                aria-label={`Cancel reservation ${b.id} for ${b.pilotName}`}
                                onClick={() => requestCancellation(b)}
                              >
                                <span className="booking-cancel-icon" aria-hidden="true">
                                  ×
                                </span>
                                Cancel booking
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="booking-schedule">
                          <TimeRange
                            start={timeInCentral(b.startTime)}
                            end={timeInCentral(b.endTime)}
                          />

                          <time dateTime={b.startTime}>
                            {dateLabel(bookingDates.get(b.id) ?? "")}
                          </time>
                        </div>
                      </div>
                    ))}

                    {list.length > 5 && (
                      <button
                        type="button"
                        className="btn-outline fleet-list-toggle"
                        aria-expanded={Boolean(expandedShips[s.id])}
                        aria-controls={`ship-bookings-${s.id}`}
                        onClick={() =>
                          setExpandedShips((current) => ({ ...current, [s.id]: !current[s.id] }))
                        }
                      >
                        {expandedShips[s.id]
                          ? "Show fewer reservations"
                          : `Show all ${list.length} reservations`}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="empty-ship">
                    <strong>
                      {!hasLoaded
                        ? loading
                          ? "Loading reservations…"
                          : "Reservations unavailable"
                        : "No matching bookings"}
                    </strong>

                    <small>
                      {hasLoaded
                        ? "Try another date or filter."
                        : loading
                          ? "Fetching the fleet schedule."
                          : "Use Refresh to try again."}
                    </small>
                  </div>
                )}
              </section>
            );
          })}
      </div>

      <Notification notification={notification} onDismiss={() => setNotification(null)} />

      {cancelTarget && (
        <div
          className="fleet-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !cancelling) {
              setCancelTarget(null);
            }
          }}
        >
          <div
            ref={cancelDialogRef}
            className="fleet-cancel-dialog"
            role="alertdialog"
            tabIndex={-1}
            aria-modal="true"
            aria-labelledby="fleet-cancel-title"
            aria-describedby="fleet-cancel-description"
          >
            <h2 id="fleet-cancel-title">Cancel this reservation?</h2>

            <p id="fleet-cancel-description">
              Are you sure you want to cancel reservation #{cancelTarget.id} for{" "}
              {cancelTarget.pilotName}?
            </p>

            <p>
              This will release the spacecraft's mission window and its refueling buffer. The
              cancelled reservation will remain in booking history.
            </p>

            {cancellationError && (
              <div className="fleet-cancellation-error" role="alert">
                {cancellationError}
              </div>
            )}

            <div className="fleet-dialog-actions">
              <button
                type="button"
                className="btn-outline"
                disabled={cancelling}
                onClick={() => setCancelTarget(null)}
              >
                Keep reservation
              </button>

              <button
                type="button"
                className="fleet-confirm-cancel"
                disabled={cancelling}
                onClick={confirmCancellation}
              >
                {cancelling ? "Cancelling…" : "Confirm cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
