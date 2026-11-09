import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { api } from "../api";
import { asArray } from "./utils/schedule";
import Header from "./components/Header";
import Charter from "./pages/Charter";
import Fleet from "./pages/Fleet";

export default function App() {
  const [page, setPage] = useState("charter");

  const [ships, setShips] = useState([]);

  const [version, setVersion] = useState(0);

  const [shipError, setShipError] = useState("");
  const [shipLoading, setShipLoading] = useState(true);
  const [shipAttempt, setShipAttempt] = useState(0);
  const shipRequestLock = useRef(true);

  useLayoutEffect(() => {
    const restoration = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    const header = document.querySelector(".topbar");
    const updateHeight = () =>
      document.documentElement.style.setProperty(
        "--header-height",
        `${header.getBoundingClientRect().height}px`
      );
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(header);
    return () => {
      observer.disconnect();
      window.history.scrollRestoration = restoration;
    };
  }, []);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
    document.querySelector("main h1")?.focus({ preventScroll: true });
  }, [page]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    shipRequestLock.current = true;
    setShipLoading(true);
    setShipError("");
    api
      .ships({ signal: controller.signal })
      .then((data) => {
        const list = asArray(data, ["ships", "data", "items"]);

        if (!list.length) throw new Error("No spacecraft returned");
        if (active) setShips(list);
      })
      .catch(() => {
        if (active) setShipError("Unable to load spacecraft. Check your connection and try again.");
      })
      .finally(() => {
        if (active) {
          shipRequestLock.current = false;
          setShipLoading(false);
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [shipAttempt]);

  return (
    <>
      <Header page={page} onPage={setPage} />

      {shipError && (
        <div className="global-error" role="alert">
          <div className="ship-recovery">
            <span>{shipError}</span>
            <button
              type="button"
              className="btn-outline"
              disabled={shipLoading}
              onClick={() => {
                if (shipRequestLock.current) return;
                shipRequestLock.current = true;
                setShipAttempt((attempt) => attempt + 1);
              }}
            >
              Retry spacecraft
            </button>
          </div>
        </div>
      )}
      <div className="ship-load-status" role="status" aria-live="polite">
        {shipLoading ? "Loading spacecraft…" : !shipError ? "Spacecraft loaded." : ""}
      </div>

      {page === "charter" ? (
        <Charter
          ships={ships}
          shipsReady={!shipLoading && !shipError && ships.length > 0}
          onBooked={() => setVersion((n) => n + 1)}
          onFleet={() => setPage("fleet")}
        />
      ) : (
        <Fleet ships={ships} version={version} />
      )}

      <footer>
        ✦ PACIFIC SPACEPORT · ALL TIMES CENTRAL · SPACECRAFT-SPECIFIC REFUELING POLICIES APPLY
      </footer>
    </>
  );
}
