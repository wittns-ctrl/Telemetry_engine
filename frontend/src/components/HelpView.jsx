import React from "react";
import { AlertTriangle } from "lucide-react";
import { API_BASE } from "../services/api";

const TOPICS = [
  {
    id: "devices",
    title: "Monitor a computer",
    body: "Run the telemetry agent on the machine you want to watch. It signs in once, registers the machine, and then sends hardware readings every few seconds. The machine appears under My Devices.",
    action: "Open My Devices",
  },
  {
    id: "metrics",
    title: "Send a metric by hand",
    body: "Metrics Studio lets you submit a single temperature, CPU or network reading and browse the readings already stored for your account.",
    action: "Open Metrics Studio",
  },
  {
    id: "live",
    title: "Watch readings live",
    body: "Live Stream charts readings as they arrive and lists alerts in real time. The simulator on that page sends random test readings to your own account so you can try the charts and alerts without a device.",
    action: "Open Live Stream",
  },
  {
    id: "settings",
    title: "Manage your account",
    body: "Change your name or password, resend the verification email, or permanently delete your account from Settings.",
    action: "Open Settings",
  },
];

export function HelpView({ onNavigate }) {
  return (
    <div className="space-y-6 font-sans">
      <div>
        <h1 className="text-3xl font-black text-slate-900 tracking-tight">Help</h1>
        <p className="text-xs text-slate-500 font-medium mt-1">
          How to get readings into the dashboard and what each page is for.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {TOPICS.map((topic) => (
          <div
            key={topic.id}
            className="glass rounded-3xl p-6 shadow-2xs flex flex-col"
          >
            <h2 className="text-sm font-bold text-slate-900 mb-3">{topic.title}</h2>
            <p className="text-xs text-slate-600 leading-relaxed flex-1">{topic.body}</p>
            <button
              type="button"
              onClick={() => onNavigate?.(topic.id)}
              className="mt-4 self-start text-xs font-bold text-[#1c1c1f] bg-ink-50 hover:bg-ink-100 border border-ink-100 px-3 py-1.5 rounded-full transition-colors"
            >
              {topic.action}
            </button>
          </div>
        ))}
      </div>

      <div className="glass rounded-3xl p-6 shadow-2xs">
        <h2 className="text-sm font-bold text-slate-900 mb-2">Starting the agent</h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          From the project folder on the computer you want to monitor, run:
        </p>
        <pre className="mt-3 bg-slate-900 text-slate-100 text-xs rounded-xl p-4 overflow-x-auto">
{`uv sync --extra agent
uv run python -m agent.telemetry_agent --api ${API_BASE}`}
        </pre>
        <p className="text-xs text-slate-500 leading-relaxed mt-3">
          The agent asks for your account email and password the first time only. Your password is
          used for that one registration and is not stored.
        </p>
      </div>

      <div className="glass rounded-3xl p-6 shadow-2xs">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          <h2 className="text-sm font-bold text-slate-900">When do alerts fire?</h2>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">
          A reading that goes over its limit raises an alert. The current limits are shown on the
          Dashboard cards. Alerts reach this app immediately while it is open; the Dashboard and
          Live Stream lists only cover alerts received since you opened the page.
        </p>
      </div>
    </div>
  );
}
