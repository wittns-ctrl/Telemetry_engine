import React, { useState } from "react";
import { Play, Sparkles } from "lucide-react";
import { requestAiScript, runAiScript } from "../services/api";

/**
 * Solve with AI (approved design A): inside the alert, below the usual fixes.
 * Lectio AI writes a short script; you see its plain steps, can unfold the
 * exact script, and send it to the PC, where someone must read it and click
 * Allow. Nothing runs from here without that.
 */
export function AiScriptPanel({ device, alert }) {
  const [state, setState] = useState({ step: "idle" }); // idle, writing, ready, sending, sent, error
  const [showScript, setShowScript] = useState(false);

  const write = async () => {
    setState({ step: "writing" });
    setShowScript(false);
    try {
      setState({ step: "ready", script: await requestAiScript(device.id, alert.id) });
    } catch (err) {
      setState({ step: "error", text: err.message });
    }
  };

  const run = async () => {
    const script = state.script;
    setState({ step: "sending", script });
    try {
      await runAiScript(script.id);
      setState({ step: "sent", script });
    } catch (err) {
      setState({ step: "ready", script, runError: err.message });
    }
  };

  if (state.step === "idle" || state.step === "error") {
    return (
      <div className="ais">
        <button type="button" className="ais-ask" onClick={write}>
          <Sparkles strokeWidth={2} aria-hidden="true" />Solve with AI
        </button>
        {state.step === "error" && <p className="note w" role="alert">{state.text}</p>}
      </div>
    );
  }
  if (state.step === "writing") {
    return <p className="sub ais" role="status">Lectio AI is writing a script for this…</p>;
  }

  const s = state.script;
  const scriptId = `ais-code-${s.id}`;
  return (
    <div className="ais">
      <p className="ais-by"><Sparkles strokeWidth={2} aria-hidden="true" />Lectio AI suggests</p>
      <p className="txt ais-sum">{s.summary}</p>
      {s.steps.length > 0 && <ol className="ais-steps">{s.steps.map((t, i) => <li key={i}>{t}</li>)}</ol>}
      <button type="button" className="ais-show" aria-expanded={showScript} aria-controls={scriptId}
        onClick={() => setShowScript((v) => !v)}>
        {showScript ? "Hide the script" : `Show the script (${s.lines} line${s.lines === 1 ? "" : "s"})`}
      </button>
      {showScript && <pre id={scriptId} className="ais-code"><code>{s.script}</code></pre>}

      {state.step === "sent" ? (
        <p className="ap-sent" role="status">Sent to {device.device_name}. Someone there must read the script and click Yes before it runs. You can follow it on My Devices.</p>
      ) : (
        <div className="row ac wrap ais-go">
          <button type="button" className="ais-run" onClick={run} disabled={!s.can_run || state.step === "sending"}>
            <Play strokeWidth={2.2} aria-hidden="true" />
            {state.step === "sending" ? "Sending…" : `Run on ${device.device_name}`}
          </button>
          <span className={s.risk === "low" ? "ais-chip low" : "ais-chip mid"}>{s.risk === "low" ? "Only looks, changes nothing" : "Changes settings"}</span>
        </div>
      )}
      {!s.can_run && s.why_not && <p className="note" role="note">{s.why_not}</p>}
      {state.runError && <p className="note w" role="alert">{state.runError}</p>}
    </div>
  );
}
