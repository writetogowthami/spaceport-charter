/** @vitest-environment jsdom */
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { api } from "../../shared/services/api";
import { centralToISO, dateInCentral, shiftDate } from "../../shared/utils/schedule";
import Fleet from "./Fleet";

vi.mock("../../shared/services/api", () => ({
  api: { bookings: vi.fn(), cancelBooking: vi.fn() },
}));

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
  const trigger = await screen.findByRole("button", { name: "Cancel booking 42 for QA Pilot" });
  trigger.focus();
  fireEvent.click(trigger);
  return trigger;
}

describe("Fleet cancellation", () => {
  it("dismisses after a completed backdrop click and restores trigger focus", async () => {
    const trigger = await openCancellation();
    const dialog = screen.getByRole("alertdialog");
    const backdrop = dialog.closest(".fleet-dialog-backdrop");

    fireEvent.mouseDown(backdrop);
    expect(screen.getByRole("alertdialog")).toBe(dialog);
    fireEvent.mouseUp(backdrop);
    fireEvent.click(backdrop);

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(api.cancelBooking).not.toHaveBeenCalled();
  });

  it("restores trigger focus when Keep reservation is chosen", async () => {
    const trigger = await openCancellation();
    fireEvent.click(screen.getByRole("button", { name: "Keep reservation" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(api.cancelBooking).not.toHaveBeenCalled();
  });

  it("does not dismiss when dialog content is clicked", async () => {
    await openCancellation();
    const dialog = screen.getByRole("alertdialog");
    fireEvent.click(screen.getByRole("heading", { name: "Cancel this reservation?" }));
    expect(screen.getByRole("alertdialog")).toBe(dialog);
    expect(api.cancelBooking).not.toHaveBeenCalled();
  });

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
    fireEvent.click(screen.getByRole("alertdialog").closest(".fleet-dialog-backdrop"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(api.cancelBooking).toHaveBeenCalledTimes(1);
    resolve({ ...booking, status: "cancelled", cancelledAt: new Date().toISOString() });
    await waitFor(() => {
      expect(screen.queryByRole("alertdialog")).toBeNull();
    });
    expect(screen.getByText("Reservation cancelled")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancel booking 42 for QA Pilot" })).toBeNull();
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
  await screen.findByRole("button", { name: "Cancel booking 42 for QA Pilot" });
  expect(() =>
    fireEvent.change(screen.getByLabelText("Timeline date"), { target: { value: "" } })
  ).not.toThrow();
  expect(screen.getByText("Choose a timeline date.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Next timeline day" }).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Timeline date"), { target: { value: dateInCentral() } });
  expect(screen.getByRole("button", { name: "Next timeline day" }).disabled).toBe(false);
});

describe("Fleet accessible result feedback", () => {
  it("announces a fetch failure once and retains the inline error after dismissing the toast", async () => {
    api.bookings.mockRejectedValue(new Error("Network unavailable."));
    const { container } = render(<Fleet ships={ships} version={0} />);

    const toast = await screen.findByRole("alert");
    const message = "Unable to load fleet bookings: Network unavailable.";
    const inlineError = container.querySelector(".error-inline");

    expect(screen.getAllByRole("alert")).toHaveLength(1);
    expect(toast.textContent).toContain(message);
    expect(inlineError.textContent).toBe(message);
    expect(inlineError.hasAttribute("role")).toBe(false);
    expect(inlineError.hasAttribute("aria-live")).toBe(false);
    expect(container.querySelector(".fleet-status").textContent).toBe("");

    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification" }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.querySelector(".error-inline")).toBe(inlineError);
    expect(inlineError.textContent).toBe(message);
    expect(api.bookings).toHaveBeenCalledTimes(1);
  });

  it("includes the visible cancellation label in its accessible name", async () => {
    render(<Fleet ships={ships} version={0} />);
    const button = await screen.findByRole("button", {
      name: "Cancel booking 42 for QA Pilot",
    });
    expect(button.textContent).toContain("Cancel booking");
    expect(button.getAttribute("aria-label")).toMatch(/^Cancel booking\b/);
  });

  it("announces filter counts without making the reservation list live", async () => {
    render(<Fleet ships={ships} version={0} />);
    await screen.findByRole("button", { name: "Cancel booking 42 for QA Pilot" });
    // The page has a separate fetch-status region; find the count's stable region.
    const count = screen.getByText("1 matching reservations");
    expect(count.getAttribute("role")).toBe("status");
    expect(count.getAttribute("aria-live")).toBe("polite");
    expect(count.getAttribute("aria-atomic")).toBe("true");
    expect(document.querySelector(".fleet-grid").hasAttribute("aria-live")).toBe(false);

    const search = screen.getByRole("textbox");
    search.focus();
    fireEvent.change(search, { target: { value: "no matching pilot" } });
    expect(screen.getByText("0 matching reservations")).toBe(count);
    expect(document.activeElement).toBe(search);
    expect(api.bookings).toHaveBeenCalledTimes(1);
  });
});
