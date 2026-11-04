import React, { useEffect, useRef, useState } from "react";
import { DURATIONS, SLOTS, dateInCentral, dateLabel, centralToISO, hhmm } from "../utils/schedule";
import SectionHeading from "../components/SectionHeading";
import Confirmation from "../components/Confirmation";
import TimeRange from "../components/TimeRange";
import {
  normalizeTimeInput,
  normalizeCompletedTime,
  capitalizePilotName,
  isValidPilotName,
} from "../utils/charterInputs";
import { isQuickSlotAvailable, parseTime, validateCustomTime } from "../utils/charterAvailability";
import { useCharterAvailability } from "../hooks/useCharterAvailability";
import { useCharterBooking } from "../hooks/useCharterBooking";

export default function Charter({
  ships,
  shipsReady = false,
  onBooked,
  onFleet,
}) {
  const [shipId, setShipId] = useState(1);
  const [date, setDate] = useState(dateInCentral());
  const [duration, setDuration] = useState(60);
  const [pilotName, setPilotName] = useState("");
  const [selected, setSelected] = useState(null);

  // Quick selection keeps the existing half-hour slot grid.
  // Custom time allows exact launch and return times.
  const [bookingMode, setBookingMode] = useState("quick");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const bookingErrorRef = useRef(null);
  const [reload, setReload] = useState(0);

  const { submitting, bookingError, setBookingError, confirmation, submitBooking, resetBooking } =
    useCharterBooking({
      onBooked,
      onConflict: () => {
        setSelected(null);
        setReload((n) => n + 1);
      },
    });
  const { windows, loading, error, availabilityIsCurrent } = useCharterAvailability(
    shipId,
    date,
    reload
  );

  const ship = ships.find((s) => Number(s.id) === Number(shipId));

  useEffect(() => {
    setSelected(null);
  }, [shipId, date, reload]);

  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const refreshClock = () => setNow(Date.now());
    const timer = window.setInterval(refreshClock, 30000);
    window.addEventListener("focus", refreshClock);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshClock);
    };
  }, []);

  useEffect(() => {
    if (bookingError) {
      bookingErrorRef.current?.focus();
    }
  }, [bookingError]);

  const customStartMinutes = parseTime(customStart);
  const customEndMinutes = parseTime(customEnd);

  const customValidation = validateCustomTime({
    customStart,
    customEnd,
    date,
    now,
    windows,
    loading,
    availabilityIsCurrent,
    error,
  });
  const customState = customValidation.valid
    ? "valid"
    : customValidation.neutral
      ? "neutral"
      : "invalid";

  const isAvailableFor = (start, missionDuration) =>
    isQuickSlotAvailable({
      start,
      duration: missionDuration,
      date,
      now,
      windows,
      availabilityIsCurrent,
      loading,
      error,
    });

  const isAvailable = (start) => isAvailableFor(start, duration);

  const availableCount = SLOTS.filter(isAvailable).length;

  const quickCanSubmit = selected !== null && isAvailable(selected);

  const timeCanSubmit = bookingMode === "quick" ? quickCanSubmit : customValidation.valid;

  const reviewState = error
    ? "unavailable"
    : timeCanSubmit
      ? "available"
      : bookingMode === "custom"
        ? customValidation.neutral
          ? "incomplete"
          : "invalid"
        : selected !== null
          ? "unavailable"
          : "incomplete";

  const pilotIsValid = isValidPilotName(pilotName);

  const canSubmit =
  shipsReady &&
  Boolean(ship) &&
  pilotIsValid &&
  timeCanSubmit &&
  availabilityIsCurrent &&
  !loading &&
  !error &&
  !submitting;

  function submit(event) {
    event.preventDefault();

    return submitBooking({
      canSubmit,
      shipId,
      pilotName,
      bookingMode,
      date,
      selected,
      duration,
      customStartMinutes,
      customEndMinutes,
    });
  }

  function reset() {
    resetBooking();
    setPilotName("");
    setSelected(null);
    setCustomStart("");
    setCustomEnd("");
    setReload((n) => n + 1);
  }

  const groups = [
    {
      name: "Morning",
      start: 360,
      end: 720,
    },
    {
      name: "Afternoon",
      start: 720,
      end: 1020,
    },
    {
      name: "Evening",
      start: 1020,
      end: 1320,
    },
  ];

  function shownStarts(group) {
    return SLOTS.filter((start) => start >= group.start && start < group.end);
  }

  return (
    <main className={`container ${confirmation ? "charter-confirmed" : ""}`}>
      <div className="page-intro">
        <div className="eyebrow">CHARTER OPERATIONS</div>

        <h1 tabIndex="-1">{confirmation ? "Mission reservation" : "Book a spacecraft"}</h1>

        <p>
          {confirmation
            ? "Your booking is confirmed. Review your mission itinerary below."
            : "Choose a spacecraft, select your launch window, and confirm your reservation."}
        </p>
      </div>

      {confirmation ? (
        <Confirmation
          booking={confirmation}
          ship={ships.find((s) => Number(s.id) === confirmation.shipId)}
          onAgain={reset}
          onFleet={onFleet}
        />
      ) : (
        <form onSubmit={submit}>
          <div className="two-column">
            <section className="panel">
              <SectionHeading
                title="Mission details"
                subtitle="Choose your spacecraft and mission details"
              />

              <label className="field">
                <span>SPACECRAFT</span>

                <select value={shipId} onChange={(e) => setShipId(Number(e.target.value))}>
                  {ships.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="field-row">
                <label className="field">
                  <span>MISSION DATE</span>

                  <input
                    type="date"
                    min={dateInCentral()}
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    required
                  />
                </label>

                <label className="field">
                  <span>DURATION</span>

                  <select
                    value={duration}
                    onChange={(e) => {
                      const nextDuration = Number(e.target.value);

                      if (selected !== null && !isAvailableFor(selected, nextDuration)) {
                        setSelected(null);
                      }

                      setDuration(nextDuration);
                      setBookingError("");
                    }}
                  >
                    {DURATIONS.map((d) => (
                      <option key={d} value={d}>
                        {d} minutes
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="field">
                <span>PILOT NAME</span>

                <input
                  type="text"
                  value={pilotName}
                  onChange={(e) => {
                    setPilotName(capitalizePilotName(e.target.value));
                    setBookingError("");
                  }}
                  placeholder="Enter pilot name"
                  autoComplete="name"
                  maxLength={100}
                  aria-label="Pilot name"
                  required
                />
              </label>

              <div className="panel-foot">
                <i className="available-dot" aria-hidden="true" />
                {ship?.name}

                <span className="push-right">All times Central</span>
              </div>
            </section>

            <section className="panel">
              <SectionHeading
                title="Schedule availability"
                subtitle="Operating hours and existing reservations"
              />

              <div className="hours">
                <div>
                  <strong>SPACEPORT OPERATING HOURS</strong>
                  <small>Every day · Central Time</small>
                </div>

                <b>06:00 – 22:00</b>
              </div>

              <div className="availability-heading">
                <strong>Reserved and blocked times</strong>
                <span className="availability-date">{dateLabel(date)}</span>
              </div>

              <p className="muted tiny">
                Includes the required 30-minute refueling buffer before and after each reservation.
              </p>

              {loading ? (
                <div className="empty-state" role="status" aria-live="polite">
                  Loading flight availability…
                </div>
              ) : error ? (
                <div className="error-inline" role="alert">
                  {error}
                </div>
              ) : windows.length === 0 ? (
                <div className="clear-state">
                  <span>✓</span>

                  <div>
                    <strong>No blocked times</strong>
                    <small>No existing reservations or refueling blocks for this date.</small>
                  </div>
                </div>
              ) : (
                <div className="blocked-list" aria-label="Unavailable flight windows">
                  {windows.map((w, i) => (
                    <div
                      className="blocked-window"
                      key={`${w.start}-${w.end}-${i}`}
                      role="group"
                      aria-label={`${hhmm(Math.max(0, w.start))} to ${hhmm(Math.min(1440, w.end))} Central Time, unavailable`}
                    >
                      <span className="blocked-window-time">
                        {hhmm(Math.max(0, w.start))}
                        <span className="blocked-window-separator">–</span>
                        {hhmm(Math.min(1440, w.end))}
                        <small>CT</small>
                      </span>
                      <span className="blocked-window-status">Unavailable</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="panel slots-panel" aria-busy={loading}>
            <div className="between">
              <SectionHeading
                title="Select launch window"
                subtitle="Choose a launch time. Your return time is calculated from your mission duration."
              />

              <span className="date-chip">{dateLabel(date)} · CT</span>
            </div>

            <div
              className="booking-mode-switch"
              role="group"
              aria-label="Launch time selection mode"
            >
              <button
                type="button"
                className={
                  bookingMode === "quick" ? "booking-mode-button active" : "booking-mode-button"
                }
                aria-pressed={bookingMode === "quick"}
                onClick={() => {
                  setBookingMode("quick");
                  setBookingError("");
                }}
              >
                Quick selection
              </button>

              <button
                type="button"
                className={
                  bookingMode === "custom" ? "booking-mode-button active" : "booking-mode-button"
                }
                aria-pressed={bookingMode === "custom"}
                onClick={() => {
                  setBookingMode("custom");
                  setBookingError("");
                }}
              >
                Custom time
              </button>
            </div>
            <div className={`launch-mode-content ${bookingMode}`}>
              {bookingMode === "quick" ? (
                <div className="launch-mode-scroll">
                  <div className="legend">
                    <span>
                      <i className="available-dot" aria-hidden="true" />
                      Available
                    </span>

                    <span>
                      <i className="selected-dot" aria-hidden="true" />
                      Selected
                    </span>

                    <span>
                      <i className="unavailable-dot" aria-hidden="true" />
                      Unavailable
                    </span>

                    <div className="launch-availability-info">
                      <strong role="status" aria-live="polite">
                        {loading
                          ? "Checking availability…"
                          : error
                            ? "Availability unavailable"
                            : `${availableCount} of ${SLOTS.length} launch starts available`}
                      </strong>

                      <span className="launch-info-wrapper">
                        <button
                          type="button"
                          className="launch-info-button"
                          aria-label="About unavailable launch starts"
                          aria-describedby="launch-availability-help"
                        >
                          i
                        </button>

                        <span
                          id="launch-availability-help"
                          className="launch-info-tooltip"
                          role="tooltip"
                        >
                          Gray launch times cannot accommodate the selected mission duration. This
                          may be due to an existing reservation, refueling buffer, past time, or
                          closing time. See Schedule availability for blocked intervals
                        </span>
                      </span>
                    </div>
                  </div>

                  {loading ? (
                    <p className="schedule-message">Loading launch windows…</p>
                  ) : error ? (
                    <div className="schedule-message">
                      <p>
                        Launch windows could not be verified. Retry availability before choosing a
                        time.
                      </p>
                      <button
                        type="button"
                        className="btn-outline"
                        onClick={() => setReload((n) => n + 1)}
                      >
                        Retry availability
                      </button>
                    </div>
                  ) : (
                    <>
                      {availableCount === 0 && (
                        <p className="schedule-message">
                          No launch windows available. Try another date, spacecraft, or mission
                          duration, or review Custom time.
                        </p>
                      )}

                      <div id="quick-launch-starts">
                        {groups.map((group) => {
                          const starts = shownStarts(group);
                          return (
                            <div className="slot-section" key={group.name}>
                              <div className="slot-group-title">
                                <strong>{group.name}</strong>
                                <span>
                                  {hhmm(group.start)} – {hhmm(group.end)}
                                </span>
                              </div>
                              {starts.length === 0 && (
                                <p className="period-empty">
                                  No available launch starts in this period.
                                </p>
                              )}
                              <div className="slot-grid">
                                {starts.map((s) => {
                                  const available = isAvailable(s);
                                  const timePassed =
                                    new Date(centralToISO(date, s)).getTime() <= now;
                                  const isSelected = selected === s && available;
                                  return (
                                    <button
                                      type="button"
                                      key={s}
                                      disabled={!available}
                                      aria-pressed={isSelected}
                                      className={`slot ${isSelected ? "selected" : available ? "available" : "unavailable"}`}
                                      onClick={() => setSelected(s)}
                                    >
                                      <strong>{hhmm(s)}</strong>
                                      <small>
                                        {isSelected
                                          ? "Selected"
                                          : available
                                            ? "Available"
                                            : timePassed
                                              ? "Time passed"
                                              : s + duration > 1320
                                                ? "Past closing"
                                                : "Unavailable"}
                                      </small>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="launch-mode-custom">
                  <div className="custom-time-panel">
                    <div className="custom-time-heading">
                      <strong>Custom mission schedule</strong>
                      <span>All times Central Time (CT)</span>
                    </div>

                    <p className="custom-time-description">
                      Enter your preferred launch and return times. The spaceport operates from
                      06:00 to 22:00. A 30-minute refueling buffer is required between reservations.
                    </p>

                    <div className="custom-time-fields">
                      <label className="field">
                        <span>LAUNCH TIME</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="HH:mm"
                          pattern="([01]?[0-9]|2[0-3]):[0-5][0-9]"
                          maxLength={5}
                          aria-describedby="custom-time-format custom-time-feedback"
                          aria-invalid={Boolean(customValidation.fields?.includes("launch"))}
                          value={customStart}
                          onBlur={() => {
                            setCustomStart((current) => normalizeCompletedTime(current));
                          }}
                          onChange={(e) => {
                            setCustomStart((previous) =>
                              normalizeTimeInput(e.target.value, previous)
                            );
                            setBookingError("");
                          }}
                          required
                        />
                      </label>

                      <label className="field">
                        <span>RETURN TIME</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          autoComplete="off"
                          placeholder="HH:mm"
                          pattern="([01]?[0-9]|2[0-3]):[0-5][0-9]"
                          maxLength={5}
                          aria-describedby="custom-time-format custom-time-feedback"
                          aria-invalid={Boolean(customValidation.fields?.includes("return"))}
                          value={customEnd}
                          onBlur={() => {
                            setCustomEnd((current) => normalizeCompletedTime(current));
                          }}
                          onChange={(e) => {
                            setCustomEnd((previous) =>
                              normalizeTimeInput(e.target.value, previous)
                            );
                            setBookingError("");
                          }}
                          required
                        />
                      </label>
                    </div>
                    <p id="custom-time-format" className="time-format-hint">
                      Use 24-hour time, for example 14:07. All times Central Time.
                    </p>
                    <div
                      id="custom-time-feedback"
                      className={`custom-time-feedback ${customState}`}
                      role="status"
                    >
                      <span className="custom-feedback-icon" aria-hidden="true">
                        {customState === "valid" ? "✓" : customState === "invalid" ? "!" : "i"}
                      </span>
                      <div className="custom-feedback-copy">
                        <strong>
                          {customState === "valid"
                            ? "Launch window available"
                            : customState === "invalid"
                              ? "Invalid launch window"
                              : "Enter your mission times"}
                        </strong>
                        <p>
                          {customState === "valid"
                            ? "This mission window is currently available. Final availability will be checked when you confirm."
                            : customValidation.message}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {bookingError && (
              <div
                className="booking-error-banner"
                role="alert"
                tabIndex="-1"
                ref={bookingErrorRef}
              >
                <div className="booking-error-icon" aria-hidden="true">
                  !
                </div>

                <div className="booking-error-content">
                  <strong>Mission could not be confirmed</strong>

                  <p>{bookingError.replace(/^Mission could not be confirmed:\s*/, "")}</p>
                </div>

                <button
                  type="button"
                  className="booking-error-close"
                  aria-label="Dismiss booking error"
                  onClick={() => setBookingError("")}
                >
                  ×
                </button>
              </div>
            )}

            <section className="mission-summary" aria-labelledby="mission-review-heading">
              <div className="review-heading">
                <h2 id="mission-review-heading">Your mission</h2>
                <span
                  className={`review-status ${reviewState}`}
                  role={bookingMode === "quick" ? "status" : undefined}
                >
                  {loading
                    ? "Checking availability…"
                    : reviewState === "available"
                      ? "Available"
                      : reviewState === "invalid"
                        ? "Invalid window"
                        : reviewState === "unavailable"
                          ? "Unavailable"
                          : "Incomplete"}
                </span>
              </div>
              <dl className="review-details">
                <div>
                  <dt>Spacecraft</dt>
                  <dd>{ship?.name || "Not selected"}</dd>
                </div>

                <div>
                  <dt>Mission date</dt>
                  <dd>{dateLabel(date)}</dd>
                </div>

                <div>
                  <dt>Launch window</dt>
                  <dd className={timeCanSubmit ? "review-window" : "review-placeholder"}>
                    {timeCanSubmit ? (
                      <TimeRange
                        start={bookingMode === "custom" ? customStart : hhmm(selected)}
                        end={bookingMode === "custom" ? customEnd : hhmm(selected + duration)}
                      />
                    ) : (
                      "No valid launch window selected"
                    )}
                  </dd>
                </div>

                <div>
                  <dt>Pilot</dt>
                  <dd>{pilotName.trim() || "Not entered"}</dd>
                </div>
              </dl>
              <div className="review-footer">
                <p>
                  {bookingMode === "custom"
                    ? customValidation.valid
                      ? `${customEndMinutes - customStartMinutes} minutes`
                      : "Duration not set"
                    : `${duration} minutes`}{" "}
                  · {bookingMode === "quick" ? "Quick selection" : "Custom time"}
                </p>
                <button className="btn-primary btn-confirm" type="submit" disabled={!canSubmit}>
                  {submitting
                    ? "Confirming…"
                    : !pilotIsValid
                      ? "Enter valid pilot name"
                      : bookingMode === "quick" && selected === null
                        ? "Select launch time"
                        : bookingMode === "custom" && !customValidation.valid
                          ? "Check mission times"
                          : "Confirm charter →"}
                </button>
              </div>
            </section>
          </section>
        </form>
      )}
    </main>
  );
}
