/** @vitest-environment jsdom */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import FleetTimeline from "./FleetTimeline";
import { centralToISO, dateInCentral } from "../../../shared/utils/schedule";

afterEach(cleanup);

function setup() {
  const day = dateInCentral();
  const mission = {
    id: 42,
    pilotName: "QA Pilot",
    startTime: centralToISO(day, 600),
    endTime: centralToISO(day, 660),
  };
  let hovered = null;
  let selected = null;
  const setHovered = vi.fn((value) => {
    hovered = value;
    rerenderView();
  });
  const setSelected = vi.fn((value) => {
    selected = typeof value === "function" ? value(selected) : value;
    rerenderView();
  });
  const props = {
    ships: [{ id: 1, name: "Wanderer", refuelMinutes: 30 }],
    timelineDate: day,
    setTimelineDate: vi.fn(),
    timelineDateIsValid: true,
    timelineByShip: new Map([[1, [mission]]]),
    loading: false,
    hasLoaded: true,
  };
  const view = render(
    <FleetTimeline
      {...props}
      hoveredMission={hovered}
      selectedMission={selected}
      setHoveredMission={setHovered}
      setSelectedMission={setSelected}
    />
  );
  function rerenderView() {
    view.rerender(
      <FleetTimeline
        {...props}
        hoveredMission={hovered}
        selectedMission={selected}
        setHoveredMission={setHovered}
        setSelectedMission={setSelected}
      />
    );
  }
  return { bar: screen.getByRole("button", { name: /Wanderer, pilot QA Pilot/ }) };
}

describe("Fleet timeline refueling information", () => {
  it("exposes visible pre- and post-mission buffer times in the mission button name", () => {
    const { bar } = setup();
    expect(
      screen.getByRole("button", {
        name:
          "Wanderer, pilot QA Pilot, 10:00 to 11:00 Central Time; visible " +
          "pre-mission refueling 09:30 to 10:00; post-mission refueling 11:00 to 11:30, Central Time",
      })
    ).toBe(bar);
  });
});

describe("Fleet timeline focus", () => {
  it("keeps a hover preview through the chart gap and into its details", () => {
    const { bar } = setup();
    fireEvent.mouseOver(bar, { relatedTarget: document.body });
    const preview = screen.getByText("MISSION PREVIEW").closest(".timeline-mission-details");
    const gap = bar.closest(".timeline-scroll");

    fireEvent.mouseOut(bar, { relatedTarget: gap });
    fireEvent.mouseOver(gap, { relatedTarget: bar });
    expect(screen.getByText("MISSION PREVIEW").closest(".timeline-mission-details")).toBe(preview);

    fireEvent.mouseOut(gap, { relatedTarget: preview });
    fireEvent.mouseOver(preview, { relatedTarget: gap });
    expect(screen.getByText("MISSION PREVIEW").closest(".timeline-mission-details")).toBe(preview);
    expect(bar.getAttribute("aria-pressed")).toBe("false");
    expect(preview.closest('[role="status"], [role="alert"], [aria-live]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Close mission details" })).toBeNull();

    fireEvent.mouseOut(preview, { relatedTarget: document.body });
    expect(screen.queryByText("MISSION PREVIEW")).toBeNull();
  });

  it("keeps a selected mission when the pointer leaves the timeline", () => {
    const { bar } = setup();
    fireEvent.mouseOver(bar, { relatedTarget: document.body });
    fireEvent.click(bar);
    fireEvent.mouseOut(bar, { relatedTarget: document.body });
    expect(screen.getByText("SELECTED MISSION")).toBeTruthy();
    expect(bar.getAttribute("aria-pressed")).toBe("true");
  });

  it("does not create a disappearing Close tab stop for transient previews", () => {
    const { bar } = setup();
    fireEvent.focus(bar);
    expect(screen.getByText("MISSION PREVIEW")).toBeTruthy();
    const preview = screen.getByText("MISSION PREVIEW").closest(".timeline-mission-details");
    expect(preview.closest('[role="status"], [role="alert"], [aria-live]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Close mission details" })).toBeNull();
    fireEvent.blur(bar);
    expect(screen.queryByText("MISSION PREVIEW")).toBeNull();
  });

  it("restores focus to the timeline date when selected details are closed", () => {
    const { bar } = setup();
    fireEvent.click(bar);
    expect(bar.getAttribute("aria-pressed")).toBe("true");
    const details = screen.getByText("SELECTED MISSION").closest(".timeline-mission-details");
    expect(details.closest('[role="status"], [role="alert"], [aria-live]')).toBeNull();
    const close = screen.getByRole("button", { name: "Close mission details" });
    close.focus();
    fireEvent.click(close);
    expect(screen.queryByRole("button", { name: "Close mission details" })).toBeNull();
    expect(bar.getAttribute("aria-pressed")).toBe("false");
    expect(document.activeElement).toBe(screen.getByLabelText("Timeline date"));
  });
});
