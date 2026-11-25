/** @vitest-environment jsdom */

import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import Notification from "./Notification";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Notification", () => {
  it("displays a success message", () => {
    render(
      <Notification
        notification={{
          id: 1,
          type: "success",
          title: "Reservation cancelled",
          message: "The booking is now available.",
        }}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByText("Reservation cancelled")).toBeTruthy();

    expect(screen.getByText("The booking is now available.")).toBeTruthy();

    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("displays errors as alerts", () => {
    render(
      <Notification
        notification={{
          id: 2,
          type: "error",
          title: "Cancellation unsuccessful",
          message: "Please try again.",
        }}
        onDismiss={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("allows manual dismissal", () => {
    const onDismiss = vi.fn();

    render(
      <Notification
        notification={{
          id: 3,
          type: "info",
          message: "Schedule refreshed.",
        }}
        onDismiss={onDismiss}
      />
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Dismiss notification",
      })
    );

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("automatically dismisses after the duration", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(
      <Notification
        notification={{
          id: 4,
          type: "success",
          message: "Reservation cancelled.",
        }}
        onDismiss={onDismiss}
        duration={6000}
      />
    );

    vi.advanceTimersByTime(6000);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
