// @vitest-environment jsdom

import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../../../shared/services/api";
import useFleetBookings from "./useFleetBookings";

vi.mock("../../../shared/services/api", () => ({
  api: {
    bookings: vi.fn(),
  },
}));

describe("useFleetBookings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads bookings on mount", async () => {
    api.bookings.mockResolvedValue([]);

    const onLoadError = vi.fn();
    const { result } = renderHook(() => useFleetBookings(0, onLoadError));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.bookings).toHaveBeenCalledTimes(1);
    expect(result.current.bookings).toEqual([]);
    expect(result.current.hasLoaded).toBe(true);
    expect(result.current.error).toBe("");
    expect(onLoadError).not.toHaveBeenCalled();
  });

  it("reports a loading failure", async () => {
    api.bookings.mockRejectedValue(new Error("Network unavailable"));

    const onLoadError = vi.fn();
    const { result } = renderHook(() => useFleetBookings(0, onLoadError));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Unable to load fleet bookings: Network unavailable");
    expect(result.current.hasLoaded).toBe(false);
    expect(onLoadError).toHaveBeenCalledWith("Unable to load fleet bookings: Network unavailable");
  });

  it("reloads when Refresh is requested", async () => {
    api.bookings.mockResolvedValue([]);

    const { result } = renderHook(() => useFleetBookings(0, vi.fn()));

    await waitFor(() => {
      expect(result.current.hasLoaded).toBe(true);
    });

    act(() => {
      result.current.refreshBookings();
    });

    await waitFor(() => {
      expect(api.bookings).toHaveBeenCalledTimes(2);
    });
  });

  it("reloads when the application version changes", async () => {
    api.bookings.mockResolvedValue([]);

    const { rerender } = renderHook(({ version }) => useFleetBookings(version, vi.fn()), {
      initialProps: { version: 0 },
    });

    await waitFor(() => {
      expect(api.bookings).toHaveBeenCalledTimes(1);
    });

    rerender({ version: 1 });

    await waitFor(() => {
      expect(api.bookings).toHaveBeenCalledTimes(2);
    });
  });

  it("ignores a response after unmount", async () => {
    let resolveRequest;

    api.bookings.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        })
    );

    const onLoadError = vi.fn();
    const { unmount } = renderHook(() => useFleetBookings(0, onLoadError));

    unmount();

    await act(async () => {
      resolveRequest([]);
    });

    expect(onLoadError).not.toHaveBeenCalled();
  });
});
