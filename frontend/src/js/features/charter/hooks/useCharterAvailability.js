import { useEffect, useMemo, useState } from "react";
import { api } from "../../../shared/services/api";
import { isValidDate, parseAvailability } from "../../../shared/utils/schedule";

export function useCharterAvailability(shipId, date, reload) {
  const availabilityKey = useMemo(() => ({ shipId, date, reload }), [shipId, date, reload]);
  const canRequest = Number.isInteger(Number(shipId)) && Number(shipId) > 0 && isValidDate(date);

  const [result, setResult] = useState({
    key: null,
    windows: [],
    error: "",
  });

  useEffect(() => {
    if (!canRequest) return;
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
  }, [shipId, date, reload, availabilityKey, canRequest]);

  const availabilityIsCurrent = canRequest && result.key === availabilityKey;

  return {
    windows: availabilityIsCurrent ? result.windows : [],
    loading: canRequest && !availabilityIsCurrent,
    error: availabilityIsCurrent ? result.error : "",
    availabilityIsCurrent,
  };
}
