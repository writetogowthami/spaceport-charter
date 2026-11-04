import { useEffect, useState } from "react";
import { api } from "../../api";
import { parseAvailability } from "../utils/schedule";

export function useCharterAvailability(shipId, date, reload) {
  const availabilityKey = `${shipId}:${date}:${reload}`;

  const [result, setResult] = useState({
    key: null,
    windows: [],
    error: "",
  });

  useEffect(() => {
    let active = true;

    api
      .availability(shipId, date)
      .then((data) => {
        if (!active) return;

        const windows = parseAvailability(data, date);

        setResult({
          key: availabilityKey,
          windows,
          error: "",
        });
      })
      .catch((err) => {
        if (!active) return;

        setResult({
          key: availabilityKey,
          windows: [],
          error: `Unable to load availability: ${err.message}`,
        });
      });

    return () => {
      active = false;
    };
  }, [shipId, date, reload]);

  const availabilityIsCurrent = result.key === availabilityKey;

  return {
    windows: availabilityIsCurrent ? result.windows : [],
    loading: !availabilityIsCurrent,
    error: availabilityIsCurrent ? result.error : "",
    availabilityIsCurrent,
  };
}
