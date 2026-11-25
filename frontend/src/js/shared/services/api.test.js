import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

function respondWithError(status, detail) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => ({ detail }),
    })
  );
}

describe("API error messages", () => {
  it("preserves structured validation messages and their HTTP status", async () => {
    respondWithError(422, [
      { loc: ["body", "pilotName"], msg: "Pilot name is invalid.", input: "private input" },
      { loc: ["body", "startTime"], msg: "Start time is required." },
    ]);

    await expect(api.createBooking({})).rejects.toMatchObject({
      status: 422,
      message: "Pilot name is invalid. Start time is required.",
    });
  });

  it("preserves plain-text conflict details", async () => {
    respondWithError(409, "This window requires a refueling buffer.");

    await expect(api.createBooking({})).rejects.toMatchObject({
      status: 409,
      message: "This window requires a refueling buffer.",
    });
  });

  it("falls back to the HTTP status when no readable details are provided", async () => {
    respondWithError(422, [{ type: "unknown" }, null]);

    await expect(api.createBooking({})).rejects.toMatchObject({
      status: 422,
      message: "API request failed (422)",
    });
  });

  it("provides a read-specific message when loading spacecraft fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(api.ships()).rejects.toThrow("Check that the backend is running and try again.");
  });

  it("warns about uncertain write outcomes after a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await expect(api.createBooking({})).rejects.toThrow("Check Fleet Manager before retrying");
  });
});
