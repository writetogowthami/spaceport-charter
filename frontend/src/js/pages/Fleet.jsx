import React, { useEffect, useMemo, useState } from "react";
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
} from "../utils/schedule";
import TimeRange from "../components/TimeRange";

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
  const [expandedShips, setExpandedShips] = useState({});
  const [hoveredMission, setHoveredMission] = useState(null);

  const [selectedMission, setSelectedMission] = useState(null);

  const activeMission = selectedMission ?? hoveredMission;

  useEffect(() => {
    setExpandedShips({});
  }, [search, shipFilter, status, from, to, sort]);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");

    api
      .bookings()
      .then((data) => {
        if (active) {
          const list = asArray(data, ["bookings", "data", "items"]);

          setBookings(list.map(normalizeBooking));
          setHasLoaded(true);
        }
      })
      .catch((err) => {
        if (active) {
          setError(`Unable to load fleet bookings: ${err.message}`);
        }
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

  const now = Date.now();
  const today = dateInCentral();

  const filtered = useMemo(() => {
    return bookings
      .filter((b) => {
        const start = new Date(b.startTime).getTime();

        const end = new Date(b.endTime).getTime();

        const matchesStatus =
          status === "all" ||
          (status === "upcoming"
            ? end >= now
            : status === "past"
              ? end < now
              : start <= now && end > now);

        const shipName = ships.find((s) => Number(s.id) === b.shipId)?.name ?? "";

        return (
          matchesStatus &&
          (shipFilter === "all" || b.shipId === Number(shipFilter)) &&
          (!from || dateInCentral(new Date(b.startTime)) >= from) &&
          (!to || dateInCentral(new Date(b.startTime)) <= to) &&
          (!search ||
            `${b.pilotName} ${b.id ?? ""} ${shipName}`.toLowerCase().includes(search.toLowerCase()))
        );
      })
      .sort((a, b) => (new Date(a.startTime) - new Date(b.startTime)) * (sort === "asc" ? 1 : -1));
  }, [bookings, status, shipFilter, from, to, search, sort, ships, now]);

  const upcoming = bookings.filter((b) => new Date(b.endTime).getTime() >= now).length;

  const todayCount = bookings.filter((b) => dateInCentral(new Date(b.startTime)) === today).length;

  const utilization = (() => {
    const periodStart = new Date(centralToISO(shiftDate(today, -29), 360)).getTime();

    const periodEnd = new Date(centralToISO(today, 1320)).getTime();

    const bookedMinutes = bookings.reduce((sum, b) => {
      const start = new Date(b.startTime).getTime();

      const end = new Date(b.endTime).getTime();

      return sum + Math.max(0, Math.min(periodEnd, end) - Math.max(periodStart, start)) / 60000;
    }, 0);

    return ships.length
      ? Math.min(100, (bookedMinutes / (ships.length * 30 * 16 * 60)) * 100).toFixed(1)
      : "0.0";
  })();

  function timeline(shipId) {
    const dayStart = new Date(centralToISO(timelineDate, 0)).getTime();

    const nextDayStart = new Date(centralToISO(shiftDate(timelineDate, 1), 0)).getTime();

    return bookings.filter((b) => {
      if (b.shipId !== shipId) return false;

      const start = new Date(b.startTime).getTime();
      const end = new Date(b.endTime).getTime();

      return (
        Number.isFinite(start) && Number.isFinite(end) && start < nextDayStart && end > dayStart
      );
    });
  }

  function clearFilters() {
    setSearch("");
    setShipFilter("all");
    setStatus("upcoming");
    setFrom("");
    setTo("");
    setSort("asc");
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
              onClick={() => setTimelineDate((d) => shiftDate(d, 1))}
            >
              ›
            </button>
          </div>
        </div>

        <p className="timeline-day-status" role="status">
          {!hasLoaded
            ? loading
              ? "Loading timeline…"
              : "Timeline unavailable."
            : !ships.some((ship) => timeline(Number(ship.id)).length > 0)
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
                  {timeline(Number(s.id)).map((b, i) => {
                    const start = windowMinutes(b.startTime, timelineDate);

                    const end = windowMinutes(b.endTime, timelineDate);
                    const left = Math.min(960, Math.max(0, start - 360));
                    const right = Math.min(960, Math.max(0, end - 360));
                    const width = Math.max(0, right - left);

                    const bufferBefore = Math.min(30, left);

                    const bufferAfter = Math.min(30, 960 - right);
                    if (width <= 0) {
                      return null;
                    }
                    return (
                      <React.Fragment key={b.id ?? i}>
                        {bufferBefore > 0 && (
                          <div
                            className="buffer-bar"
                            title="30-minute pre-mission refueling buffer"
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
                            title="30-minute post-mission refueling buffer"
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
            const list = filtered.filter((b) => b.shipId === Number(s.id));

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
                      <div className="booking-row" key={b.id ?? i}>
                        <div className="booking-pilot">
                          <div className="booking-identity">
                            <strong>{b.pilotName}</strong>
                            {b.id != null && <small>Reservation #{b.id}</small>}
                          </div>
                        </div>

                        <div className="booking-schedule">
                          <TimeRange
                            start={timeInCentral(b.startTime)}
                            end={timeInCentral(b.endTime)}
                          />

                          <time dateTime={b.startTime}>
                            {dateLabel(dateInCentral(new Date(b.startTime)))}
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
    </main>
  );
}
