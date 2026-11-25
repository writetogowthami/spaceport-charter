import React, { useRef } from "react";

import {
  dateLabel,
  hhmm,
  pad,
  shiftDate,
  timeInCentral,
  windowMinutes,
} from "../../../shared/utils/schedule";
import TimeRange from "../../../shared/components/TimeRange";

export default function FleetTimeline({
  ships,
  timelineDate,
  setTimelineDate,
  timelineDateIsValid,
  timelineByShip,
  loading,
  hasLoaded,
  hoveredMission,
  setHoveredMission,
  selectedMission,
  setSelectedMission,
}) {
  const activeMission = selectedMission ?? hoveredMission;
  const timelineDateInput = useRef(null);

  return (
    <>
      <p className="timeline-context">
        The timeline shows all missions on its selected day, independently of the filters.
        Spacecraft booking cards below follow the search, status, date, and spacecraft filters.
      </p>

      <section className="panel timeline-panel" onMouseLeave={() => setHoveredMission(null)}>
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
              ref={timelineDateInput}
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

                    const bufferDescription = [
                      bufferBefore > 0
                        ? `pre-mission refueling ${hhmm(360 + left - bufferBefore)} to ${hhmm(360 + left)}`
                        : null,
                      bufferAfter > 0
                        ? `post-mission refueling ${hhmm(360 + right)} to ${hhmm(360 + right + bufferAfter)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join("; ");

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
                          )} to ${timeInCentral(b.endTime)} Central Time${
                            bufferDescription ? `; visible ${bufferDescription}, Central Time` : ""
                          }`}
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
          <div className="timeline-mission-details">
            <div className="timeline-mission-details-heading">
              <div>
                <span className="timeline-detail-label">
                  {selectedMission ? "SELECTED MISSION" : "MISSION PREVIEW"}
                </span>
                <strong>{activeMission.ship}</strong>
              </div>

              {selectedMission && (
                <button
                  type="button"
                  className="timeline-detail-close"
                  aria-label="Close mission details"
                  onClick={() => {
                    setSelectedMission(null);
                    setHoveredMission(null);
                    timelineDateInput.current?.focus();
                  }}
                >
                  ×
                </button>
              )}
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
    </>
  );
}
