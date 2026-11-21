import React from "react";
import { Search, MessageCircleMore, Bell, ChevronDown } from "lucide-react";

function initialsFor(name) {
  const base = (name || "").split("@")[0].trim();
  if (!base) return "?";
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : base.slice(0, 2);
  return letters.toUpperCase();
}

export function TopBar({ user, onOpenProfile }) {
  const name = user?.full_name || user?.email || "Account";

  return (
    <header className="qd-top">
      <label className="qd-search">
        <Search strokeWidth={2} aria-hidden="true" />
        <input type="search" placeholder="Search ..." aria-label="Search" />
      </label>

      <div className="qd-top-actions">
        <button type="button" className="qd-icon-btn" aria-label="Messages">
          <MessageCircleMore strokeWidth={1.6} />
          <span className="qd-badge" />
        </button>
        <button type="button" className="qd-icon-btn" aria-label="Notifications">
          <Bell strokeWidth={1.6} />
          <span className="qd-badge" />
        </button>
        <button type="button" className="qd-profile" onClick={onOpenProfile} aria-label={`${name} — account settings`}>
          <span className="qd-avatar" aria-hidden="true">{initialsFor(name)}</span>
          <ChevronDown strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
