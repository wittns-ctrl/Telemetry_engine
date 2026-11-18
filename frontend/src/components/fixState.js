import { Check, CircleSlash, Hourglass, Undo2, Wrench, X } from "lucide-react";

// Plain-language wording for fixes, shared by fixes.jsx and SettingsView.

/** How far Lectio may go, in Settings (the API's User.fix_level). */
export const FIX_LEVELS = [
  { id: "suggest", title: "Only suggest", text: "Show what to do. Never change my PCs." },
  {
    id: "standard",
    title: "Fix small things, ask for big ones",
    text: "Small fixes run as soon as you choose them. Big ones need someone at the PC to click Allow.",
    recommended: true,
  },
  { id: "always_ask", title: "Always ask on the PC", text: "Every fix needs someone at the PC to click Allow first." },
];

const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/** A fix's state in plain words: { tone, icon, text }. */
export function fixState(fix, pc = "your PC") {
  switch (fix.status) {
    case "queued":
      return { tone: "o", icon: Hourglass, text: fix.needs_pc_approval ? `Sent to ${pc}. It will ask for Allow there.` : `Sent to ${pc}…` };
    case "running":
      return {
        tone: "o",
        icon: Hourglass,
        text: fix.needs_pc_approval && !fix.is_undo ? `Waiting for someone at ${pc} to click Allow` : "Working on it…",
      };
    case "succeeded": {
      if (fix.undone) return { tone: "n", icon: Undo2, text: "Undone. Things are back as they were." };
      if (fix.reverted_at) return { tone: "n", icon: Check, text: `Ended at ${clock(fix.reverted_at)}. Back to normal.` };
      const minutes = fix.fix_id === "cool_down" && !fix.is_undo ? fix.params?.minutes : null;
      if (minutes && fix.finished_at) {
        const until = new Date(new Date(fix.finished_at).getTime() + minutes * 60000);
        if (until > new Date()) return { tone: "g", icon: Check, text: `Cooling down until ${clock(until.toISOString())}` };
      }
      return { tone: "g", icon: Check, text: fix.message || "Done." };
    }
    case "declined":
      return { tone: "w", icon: X, text: `Someone at ${pc} chose not to allow it.` };
    case "failed":
      return { tone: "w", icon: X, text: fix.message || "It didn't work." };
    case "cancelled":
      return { tone: "n", icon: CircleSlash, text: "Cancelled." };
    case "expired":
      return { tone: "n", icon: CircleSlash, text: fix.message || `${pc} didn't pick this up in time.` };
    default:
      return { tone: "n", icon: Wrench, text: fix.status };
  }
}
