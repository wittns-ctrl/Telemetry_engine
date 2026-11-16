import React from "react";
import { Link } from "react-router-dom";
import { Sparkles, BookOpen, Loader2, RefreshCw, Clock } from "lucide-react";
import { Chip } from "./ui";

const URGENCY = {
  IMMEDIATE_ACTION_REQUIRED: { label: "Act now", tone: "w" },
  ATTENTION_NEEDED: { label: "Needs attention soon", tone: "w" },
  MONITOR: { label: "Keep an eye on it", tone: undefined },
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
      <div className="diag row ac" role="status">
        <Loader2 className="spin" size={14} aria-hidden="true" /> Looking at the readings around this alert…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="diag row ac wrap" role="alert" style={{ color: "var(--rose-text)" }}>
        <span>{diagnosisErrorMessage(state.error)}</span>
        {onRetry && (
          <button type="button" className="vd" onClick={onRetry}>
            <RefreshCw size={11} aria-hidden="true" style={{ display: "inline", marginRight: 4 }} />Try again
          </button>
        )}
      </div>
    );
  }

  const report = state.report;
  const urgency = URGENCY[report.urgency_level] || { label: humanize(report.urgency_level) || "Unknown", tone: "n" };
  const isAI = report.analysis_method === "LLM";
  const steps = [...(report.actionable_steps || [])].sort((a, b) => a.step_number - b.step_number);

  return (
    <div className="diag col">
      <div className="row ac wrap">
        <Chip tone={urgency.tone}>{urgency.label}</Chip>
        <span className="sub row ac" style={{ gap: 4 }}>
          {isAI ? <Sparkles size={12} aria-hidden="true" /> : <BookOpen size={12} aria-hidden="true" />}
          {isAI ? "AI diagnosis" : "Built-in troubleshooting guide"}
        </span>
      </div>

      <div>
        <h4>Likely cause</h4>
        <p style={{ color: "var(--ink)" }}>{report.root_cause_analysis}</p>
      </div>

      {steps.length > 0 && (
        <div>
          <h4>What to do</h4>
          <ol>
            {steps.map((step, i) => (
              <li key={`${step.step_number}-${i}`}>
                <span className="num sm" aria-hidden="true">{i + 1}</span>
                <div>
                  <span style={{ color: "var(--ink)" }}>{step.instruction}</span>
                  {(step.category || step.estimated_time_minutes) && (
                    <span className="sub" style={{ marginLeft: 6 }}>
                      {step.category && humanize(step.category)}
                      {step.estimated_time_minutes ? (
                        <span style={{ marginLeft: 6, whiteSpace: "nowrap" }}>
                          <Clock size={10} aria-hidden="true" style={{ display: "inline", verticalAlign: "-1px", marginRight: 2 }} />
                          ~{step.estimated_time_minutes} min
                        </span>
                      ) : null}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="sub">
        {isAI
          ? "Written by AI from this alert and the readings around it. "
          : "AI analysis wasn't available, so this comes from Lectio's standard steps for this kind of alert. "}
        It can be wrong: treat it as a suggestion, not professional advice, and take care when working inside your PC.{" "}
        <Link to="/terms">Terms</Link>
      </p>
    </div>
  );
}
