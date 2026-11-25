import React, { useEffect, useRef } from "react";

const TITLES = {
  success: "Success",
  error: "Something went wrong",
  warning: "Attention required",
  info: "Information",
};

const SYMBOLS = {
  success: "✓",
  error: "!",
  warning: "!",
  info: "i",
};

export default function Notification({ notification, onDismiss, duration = 6000 }) {
  const dismissRef = useRef(onDismiss);

  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!notification || duration <= 0) return;

    const timer = window.setTimeout(() => {
      dismissRef.current();
    }, duration);

    return () => window.clearTimeout(timer);
  }, [notification?.id, duration]);

  if (!notification) return null;

  const type = TITLES[notification.type] ? notification.type : "info";

  return (
    <div className="notification-region">
      <div
        className={`app-notification app-notification--${type}`}
        role={type === "error" ? "alert" : "status"}
        aria-live={type === "error" ? "assertive" : "polite"}
        aria-atomic="true"
      >
        <span className="app-notification-icon" aria-hidden="true">
          {SYMBOLS[type]}
        </span>

        <div className="app-notification-content">
          <strong>{notification.title || TITLES[type]}</strong>
          <p>{notification.message}</p>
        </div>

        <button
          type="button"
          className="app-notification-close"
          aria-label="Dismiss notification"
          onClick={onDismiss}
        >
          ×
        </button>
      </div>
    </div>
  );
}
