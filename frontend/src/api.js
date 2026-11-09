const API_BASE = "/api";

async function request(path, options = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    const isWriteRequest = ["POST", "PUT", "PATCH", "DELETE"].includes(
      (options.method ?? "GET").toUpperCase()
    );

    throw new Error(
      isWriteRequest
        ? "Network error: Could not reach the booking service. " +
            "Check Fleet Manager before retrying, since the " +
            "operation may have succeeded."
        : "Network error: Could not reach the booking service. " +
            "Check that the backend is running and try again."
    );
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const error = new Error(
      response.ok
        ? `Expected JSON but received ${
            contentType || "an unknown content type"
          }. Check your Vite proxy and backend API routes.`
        : `Booking service returned HTTP ${response.status}. Please try again.`
    );

    error.status = response.status;
    throw error;
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("Backend returned invalid JSON.");
  }

  if (!response.ok) {
    const detail = data?.detail ?? data?.message ?? data?.error;
    const message = Array.isArray(detail)
      ? detail
          .map((issue) => issue?.msg)
          .filter((value) => typeof value === "string" && value.trim())
          .join(" ")
      : detail;

    const error = new Error(
      typeof message === "string" && message.trim()
        ? message
        : `API request failed (${response.status})`
    );

    error.status = response.status;

    throw error;
  }

  return data;
}

export const api = {
  ships: (options = {}) => request("/ships", options),

  availability: (shipId, date) =>
    request(`/availability?shipId=${encodeURIComponent(shipId)}&date=${encodeURIComponent(date)}`),

  bookings: () => request("/bookings"),

  createBooking: (booking) =>
    request("/bookings", {
      method: "POST",
      body: JSON.stringify(booking),
    }),

  cancelBooking: (bookingId) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/cancel`, {
      method: "POST",
    }),
};
