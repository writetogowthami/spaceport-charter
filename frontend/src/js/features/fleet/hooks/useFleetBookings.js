import { useEffect, useState } from "react";

import { api } from "../../../shared/services/api";
import { asArray, normalizeBooking } from "../../../shared/utils/schedule";

export default function useFleetBookings(version, onLoadError) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");

    api
      .bookings()
      .then((data) => {
        if (!active) return;

        const list = asArray(data, ["bookings", "data", "items"]);

        setBookings(list.map(normalizeBooking));
        setHasLoaded(true);
      })
      .catch((err) => {
        if (!active) return;

        const message = `Unable to load fleet bookings: ${err.message}`;

        setError(message);
        onLoadError(message);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
    // Preserve the existing fetch triggers: refresh and version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh, version]);

  function refreshBookings() {
    setRefresh((current) => current + 1);
  }

  return {
    bookings,
    setBookings,
    loading,
    error,
    hasLoaded,
    refreshBookings,
  };
}
