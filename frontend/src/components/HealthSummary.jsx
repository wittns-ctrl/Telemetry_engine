import React, { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import { answersFor } from "./healthAnswers";

/**
 * The dashboard's first view (approved option B): four plain questions about
 * the PC, each answered in a sentence with a coloured dot. A problem gets a
 * button: to the alerts window (where the fixes are) when alerts are open,
 * otherwise to the tab with the details. The full readings sit behind
 * "Show advanced details".
 */
export function HealthSummary({ snapshot, alerts, onOpenTab, onOpenAlerts }) {
  const answers = useMemo(() => answersFor(snapshot), [snapshot]);
  const hasAlerts = alerts.length > 0;
  return (
    <section className="hs" aria-label="PC health summary">
      <ul className="card hs-list">
        {answers.map((a) => (
          <li key={a.id} className={`hs-row ${a.state}`}>
            <span className="hs-dot" aria-hidden="true" />
            <div className="hs-text">
              <b>{a.question}</b>
              <span>
                <span className="sr-only">{a.state === "warn" ? "Problem: " : a.state === "ok" ? "OK: " : "Unknown: "}</span>
                {a.text}
              </span>
            </div>
            {a.state === "warn" && (
              <button type="button" className="bk" onClick={() => (hasAlerts ? onOpenAlerts() : onOpenTab(a.tab))}>
                {hasAlerts ? "See what to do" : "See details"}
              </button>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="hs-adv" onClick={() => onOpenTab("cpu")}>
        Show advanced details <ChevronRight strokeWidth={2} aria-hidden="true" />
      </button>
    </section>
  );
}
