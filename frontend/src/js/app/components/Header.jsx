import React from "react";

export default function Header({ page, onPage }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand">
          <img className="brand-mark" src="/spaceport-icon.svg" alt="" aria-hidden="true" />
          <span className="brand-copy">
            <strong>PACIFIC SPACEPORT</strong>
            <small>Charter Operations</small>
          </span>
        </div>

        <nav className="nav-tabs" aria-label="Main navigation">
          <button
            type="button"
            className={page === "charter" ? "active" : ""}
            aria-current={page === "charter" ? "page" : undefined}
            onClick={() => onPage("charter")}
          >
            Charter a Ship
          </button>

          <button
            type="button"
            className={page === "fleet" ? "active" : ""}
            aria-current={page === "fleet" ? "page" : undefined}
            onClick={() => onPage("fleet")}
          >
            Fleet Manager
          </button>
        </nav>
      </div>
    </header>
  );
}
