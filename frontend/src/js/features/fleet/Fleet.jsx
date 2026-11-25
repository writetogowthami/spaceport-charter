import React, { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../shared/services/api";
import {
  normalizeBooking,
  dateInCentral,
  dateLabel,
  isValidDate,
} from "../../shared/utils/schedule";
import FleetTimeline from "./components/FleetTimeline";
import Notification from "../../shared/components/Notification";
import FleetFilters from "./components/FleetFilters";
import FleetBookingRow from "./components/FleetBookingRow";
import useFleetBookings from "./hooks/useFleetBookings";
import useFleetDerivedData from "./hooks/useFleetDerivedData";

export default function Fleet({ ships, version }) {
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

  const { bookings, setBookings, loading, error, hasLoaded, refreshBookings } = useFleetBookings(
    version,
    (message) => {
      notificationId.current += 1;
      setNotification({
        id: notificationId.current,
        type: "error",
        title: "Fleet schedule unavailable",
        message,
      });
    }
  );

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

  useEffect(() => {
    setExpandedShips((current) => (Object.keys(current).length === 0 ? current : {}));
  }, [search, shipFilter, status, from, to, sort]);

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

  const {
    bookingDates,
    filtered,
    filteredByShip,
    upcoming,
    todayCount,
    utilization,
    timelineByShip,
  } = useFleetDerivedData({
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
  });

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
          : ""}
      </div>

      <div className="fleet-title">
        <div>
          <h2>Fleet schedule</h2>

          <p>Search and review reservations by spacecraft.</p>
        </div>

        <button type="button" className="btn-outline" disabled={loading} onClick={refreshBookings}>
          ↻ Refresh
        </button>
      </div>

      <FleetFilters
        ships={ships}
        search={search}
        onSearchChange={setSearch}
        shipFilter={shipFilter}
        onShipFilterChange={setShipFilter}
        status={status}
        onStatusChange={setStatus}
        from={from}
        onFromChange={setFrom}
        to={to}
        onToChange={setTo}
        sort={sort}
        onSortChange={setSort}
      />

      <div className="filter-footer">
        <span role="status" aria-live="polite" aria-atomic="true">
          {hasLoaded ? `${filtered.length} matching reservations` : "Reservations not yet loaded"}
        </span>
        {loading && <span aria-hidden="true"> · Loading…</span>}

        <button type="button" onClick={clearFilters}>
          Clear filters
        </button>
      </div>

      {error && <div className="error-inline">{error}</div>}

      <FleetTimeline
        ships={ships}
        timelineDate={timelineDate}
        setTimelineDate={setTimelineDate}
        timelineDateIsValid={timelineDateIsValid}
        timelineByShip={timelineByShip}
        loading={loading}
        hasLoaded={hasLoaded}
        hoveredMission={hoveredMission}
        setHoveredMission={setHoveredMission}
        selectedMission={selectedMission}
        setSelectedMission={setSelectedMission}
      />

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
                      <FleetBookingRow
                        key={b.id ?? i}
                        booking={b}
                        bookingDate={bookingDates.get(b.id)}
                        now={now}
                        onRequestCancellation={requestCancellation}
                      />
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
          onClick={(event) => {
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
