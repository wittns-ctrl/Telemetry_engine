import React from "react";
import { Link } from "react-router-dom";
import { Sparkles, BookOpen, Loader2, RefreshCw, Clock } from "lucide-react";

const URGENCY = {
  IMMEDIATE_ACTION_REQUIRED: { label: "Act now", style: "bg-red-100 text-red-800 border-red-200" },
  ATTENTION_NEEDED: { label: "Needs attention soon", style: "bg-amber-100 text-amber-800 border-amber-200" },
  MONITOR: { label: "Keep an eye on it", style: "bg-sky-100 text-sky-800 border-sky-200" },
};

function humanize(value) {
  if (!value) return "";
  const text = String(value).replace(/_/g, " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Turn an API or network error into something a PC owner can act on. */
function diagnosisErrorMessage(err) {
  const msg = err?.message || "";
  if (err instanceof TypeError || /failed to fetch|networkerror/i.test(msg)) {
    return "Couldn't reach Lectio's server. Check your connection and try again.";
  }
  if (/not found/i.test(msg)) return "This alert no longer exists, so there's nothing to diagnose.";
  if (/does not belong/i.test(msg)) return "This alert isn't on your account.";
  if (/invalid .*id/i.test(msg)) return "This alert can't be diagnosed because its ID is not valid.";
  return "Couldn't generate a report right now. Try again in a minute.";
}

/**
 * Shows the diagnostic report for one alert.
 * state: { status: "loading" } | { status: "error", error } | { status: "ready", report }
 */
export function DiagnosisPanel({ state, onRetry }) {
  if (!state) return null;

  if (state.status === "loading") {
    return (
      <div className="mt-2 rounded-xl bg-white/80 border border-slate-200 px-3 py-3 text-sm text-slate-600 flex items-center gap-2" role="status">
        <Loader2 size={14} className="animate-spin" /> Looking at the readings around this alert…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="mt-2 rounded-xl bg-white/80 border border-red-200 px-3 py-3 text-sm text-red-700 flex flex-wrap items-center gap-2" role="alert">
        <span>{diagnosisErrorMessage(state.error)}</span>
        {onRetry && (
          <button onClick={onRetry} className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
            <RefreshCw size={12} /> Try again
          </button>
        )}
      </div>
    );
  }

  const report = state.report;
  const urgency = URGENCY[report.urgency_level] || {
    label: humanize(report.urgency_level) || "Unknown",
    style: "bg-slate-100 text-slate-700 border-slate-200",
  };
  const isAI = report.analysis_method === "LLM";
  const steps = [...(report.actionable_steps || [])].sort((a, b) => a.step_number - b.step_number);

  return (
    <div className="mt-2 rounded-xl bg-white border border-slate-200 px-4 py-3 text-sm text-slate-700 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${urgency.style}`}>
          {urgency.label}
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
          {isAI ? <Sparkles size={12} /> : <BookOpen size={12} />}
          {isAI ? "AI diagnosis" : "Built-in troubleshooting guide"}
        </span>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Likely cause</div>
        <p className="mt-1 text-slate-800">{report.root_cause_analysis}</p>
      </div>

      {steps.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">What to do</div>
          <ol className="mt-1 space-y-1.5">
            {steps.map((step, i) => (
              <li key={`${step.step_number}-${i}`} className="flex gap-2">
                <span className="flex-none w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-semibold flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <div>
                  <span className="text-slate-800">{step.instruction}</span>
                  {(step.category || step.estimated_time_minutes) && (
                    <span className="ml-2 inline-flex items-center gap-2 text-xs text-slate-400">
                      {step.category && <span>{humanize(step.category)}</span>}
                      {step.estimated_time_minutes ? (
                        <span className="inline-flex items-center gap-0.5"><Clock size={11} /> ~{step.estimated_time_minutes} min</span>
                      ) : null}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="text-xs text-slate-500 border-t border-slate-100 pt-2">
        {isAI
          ? "Written by AI from this alert and the readings around it. "
          : "AI analysis wasn't available, so this comes from Lectio's standard steps for this kind of alert. "}
        It can be wrong: treat it as a suggestion, not professional advice, and take care when working inside your PC.{" "}
        <Link to="/terms" className="underline underline-offset-2">Terms</Link>
      </p>
    </div>
  );
}
