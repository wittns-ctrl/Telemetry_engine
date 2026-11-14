import React from "react";

const SIZES = {
  sm: "w-8 h-8 text-xs",
  lg: "w-32 h-32 text-4xl",
};

function initialsFor(name) {
  const base = (name || "").split("@")[0].trim();
  if (!base) return "?";
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : base.slice(0, 2);
  return letters.toUpperCase();
}

/** Initials avatar, drawn locally so the user's name isn't sent to a third-party image service. */
export function Avatar({ name, size = "sm", className = "" }) {
  return (
    <div
      aria-hidden="true"
      className={`${SIZES[size]} rounded-full bg-ink-50 text-[#1c1c1f] font-bold flex items-center justify-center select-none shrink-0 ${className}`}
    >
      {initialsFor(name)}
    </div>
  );
}
