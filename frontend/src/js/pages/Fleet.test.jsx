/** @vitest-environment jsdom */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { api } from "../../api";
import { centralToISO, dateInCentral, shiftDate } from "../utils/schedule";
import Fleet from "./Fleet";

vi.mock("../../api", () => ({ api: { bookings: vi.fn(), cancelBooking: vi.fn() } }));

const ships = [{ id: 1, name: "USS Wanderer", refuelMinutes: 30 }];
let booking;

beforeEach(() => {
  const date = shiftDate(dateInCentral(), 1);
  booking = {
    id: 42,
    shipId: 1,
    pilotName: "QA Pilot",
    startTime: centralToISO(date, 600),
    endTime: centralToISO(date, 660),
    status: "confirmed",
  };
  api.bookings.mockResolvedValue([booking]);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openCancellation() {
  render(<Fleet ships={ships} version={0} />);
  const trigger = await screen.findByRole("button", { name: "Cancel reservation 42 for QA Pilot" });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

describe("Fleet cancellation", () => {
  it("contains keyboard focus, dismisses with Escape, and restores focus", async () => {
    const trigger = await openCancellation();
    const keep = screen.getByRole("button", { name: "Keep reservation" });
    const confirm = screen.getByRole("button", { name: "Confirm cancellation" });
    expect(document.activeElement).toBe(keep);
    fireEvent.keyDown(keep, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirm);
    fireEvent.keyDown(confirm, { key: "Tab" });
    expect(document.activeElement).toBe(keep);
    fireEvent.keyDown(keep, { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(api.cancelBooking).not.toHaveBeenCalled();
  });

  it("prevents duplicate cancellation and keeps a pending request in the dialog", async () => {
    let resolve;
    api.cancelBooking.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    await openCancellation();
    const confirm = screen.getByRole("button", { name: "Confirm cancellation" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(api.cancelBooking).toHaveBeenCalledTimes(1);
    resolve({ ...booking, status: "cancelled", cancelledAt: new Date().toISOString() });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(screen.getByText("Reservation cancelled")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel reservation 42 for QA Pilot" })).toBeNull();
  });

  it("keeps the dialog usable and explains failed cancellation", async () => {
    api.cancelBooking.mockRejectedValue(new Error("This mission has already started."));
    await openCancellation();
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    expect(await screen.findByText("This mission has already started.")).toBeTruthy();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByRole("alertdialog").contains(screen.getByRole("alert"))).toBe(true);
    expect(screen.getByRole("button", { name: "Keep reservation" }).disabled).toBe(false);
  });
});

it("allows an empty timeline date without crashing", async () => {
  render(<Fleet ships={ships} version={0} />);
  await screen.findByRole("button", { name: "Cancel reservation 42 for QA Pilot" });
  expect(() =>
    fireEvent.change(screen.getByLabelText("Timeline date"), { target: { value: "" } })
  ).not.toThrow();
  expect(screen.getByText("Choose a timeline date.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Next timeline day" }).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Timeline date"), { target: { value: dateInCentral() } });
  expect(screen.getByRole("button", { name: "Next timeline day" }).disabled).toBe(false);
});
