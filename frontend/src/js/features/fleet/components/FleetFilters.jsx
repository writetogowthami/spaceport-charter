import React from "react";

export default function FleetFilters({
  ships,
  search,
  onSearchChange,
  shipFilter,
  onShipFilterChange,
  status,
  onStatusChange,
  from,
  onFromChange,
  to,
  onToChange,
  sort,
  onSortChange,
}) {
  return (
    <div className="filters">
      <label>
        <span>SEARCH RESERVATIONS</span>
        <input
          placeholder="Pilot, spacecraft, or booking ID"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>

      <label>
        <span>SPACECRAFT</span>
        <select value={shipFilter} onChange={(event) => onShipFilterChange(event.target.value)}>
          <option value="all">All spacecraft</option>
          {ships.map((ship) => (
            <option key={ship.id} value={ship.id}>
              {ship.name}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>BOOKING STATUS</span>
        <select value={status} onChange={(event) => onStatusChange(event.target.value)}>
          <option value="upcoming">Upcoming &amp; active</option>
          <option value="all">All bookings</option>
          <option value="past">Past</option>
          <option value="active">Active now</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </label>

      <label>
        <span>FROM DATE</span>
        <input type="date" value={from} onChange={(event) => onFromChange(event.target.value)} />
      </label>

      <label>
        <span>TO DATE</span>
        <input type="date" value={to} onChange={(event) => onToChange(event.target.value)} />
      </label>

      <label>
        <span>SORT BY DATE</span>
        <select value={sort} onChange={(event) => onSortChange(event.target.value)}>
          <option value="asc">Earliest first</option>
          <option value="desc">Latest first</option>
        </select>
      </label>
    </div>
  );
}
