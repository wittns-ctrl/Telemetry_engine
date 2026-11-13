import React from "react";
import { Search, Bell } from "lucide-react";

/** Search pill and alerts bell. The dashboard places it inside its hero; other pages show it above their content. */
export function TopBar({ alertsCount = 0, onOpenAlerts }) {
  return (
    <div className="ld-tools">
      <label className="ld-search">
        <Search strokeWidth={2} aria-hidden="true" />
        <input type="search" placeholder="Search..." aria-label="Search" />
      </label>
      <button
        type="button"
        className="ld-round-btn"
        onClick={onOpenAlerts}
        aria-label={alertsCount ? `Alerts (${alertsCount})` : "Alerts"}
        title="Alerts"
      >
        <Bell strokeWidth={2} />
      </button>
    </div>
  );
}
