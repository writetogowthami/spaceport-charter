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
    throw new Error(
      "Network error: Could not reach the booking service. " +
        "Check Fleet Manager before retrying, since the " +
        "booking may have succeeded."
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

    const error = new Error(
      typeof detail === "string" ? detail : `API request failed (${response.status})`
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
};
