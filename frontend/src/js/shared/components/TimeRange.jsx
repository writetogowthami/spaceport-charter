import React from "react";

export default function TimeRange({ start, end, className = "" }) {
  return (
    <span className={`time-range ${className}`}>
      <span className="time-range-hours">
        <span>{start}</span>
        <span className="time-range-separator" aria-hidden="true">
          –
        </span>
        <span>{end}</span>
      </span>

      <span className="time-range-zone">CT</span>
    </span>
  );
}
