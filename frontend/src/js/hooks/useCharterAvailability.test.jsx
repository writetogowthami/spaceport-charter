// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCharterAvailability } from "./useCharterAvailability";
import { api } from "../../api";

vi.mock("../../api", () => ({
  api: {
    availability: vi.fn(),
  },
}));

function deferred() {
  let resolve;

  const promise = new Promise((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe("useCharterAvailability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and parses availability", async () => {
    api.availability.mockResolvedValue({
      unavailableWindows: [{ start: "10:00", end: "11:00" }],
    });

    const { result } = renderHook(() => useCharterAvailability(1, "2026-11-10", 0));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.availabilityIsCurrent).toBe(true);
    expect(result.current.windows).toEqual([{ start: 600, end: 660 }]);
    expect(result.current.error).toBe("");
  });

  it("ignores stale responses after spacecraft changes", async () => {
    const first = deferred();
    const second = deferred();

    api.availability.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(
      ({ shipId }) => useCharterAvailability(shipId, "2026-11-10", 0),
      { initialProps: { shipId: 1 } }
    );

    rerender({ shipId: 2 });

    expect(result.current.loading).toBe(true);
    expect(result.current.availabilityIsCurrent).toBe(false);

    await act(async () => {
      first.resolve({
        unavailableWindows: [{ start: "10:00", end: "11:00" }],
      });

      await first.promise;
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.windows).toEqual([]);

    await act(async () => {
      second.resolve({
        unavailableWindows: [{ start: "14:00", end: "15:00" }],
      });

      await second.promise;
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.windows).toEqual([{ start: 840, end: 900 }]);
    expect(result.current.availabilityIsCurrent).toBe(true);
  });

  it("fails closed when the availability request fails", async () => {
    api.availability.mockRejectedValue(new Error("Network unavailable"));

    const { result } = renderHook(() => useCharterAvailability(1, "2026-11-10", 0));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.windows).toEqual([]);
    expect(result.current.error).toContain("Network unavailable");
    expect(result.current.availabilityIsCurrent).toBe(true);
  });

  it("requires fresh availability after a reload", async () => {
    const second = deferred();

    api.availability
      .mockResolvedValueOnce({ unavailableWindows: [] })
      .mockReturnValueOnce(second.promise);

    const { result, rerender } = renderHook(
      ({ reload }) => useCharterAvailability(1, "2026-11-10", reload),
      { initialProps: { reload: 0 } }
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    rerender({ reload: 1 });

    expect(result.current.loading).toBe(true);
    expect(result.current.availabilityIsCurrent).toBe(false);
    expect(result.current.windows).toEqual([]);

    await act(async () => {
      second.resolve({ unavailableWindows: [] });
      await second.promise;
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.availabilityIsCurrent).toBe(true);
  });
});
