import React, { useEffect, useState } from "react";
import { ListChecks, Sparkles, Undo2, Wrench } from "lucide-react";
import { fixState } from "./fixState";
import { fetchFixSuggestions } from "../services/api";
import { Card, Chip, Head, Ico, Empty } from "./ui";
import { cx, timeAgo } from "./format";
import { ConfirmDialog } from "./ConfirmDialog";

// Fixes on the website: the options shown inside an alert (design A), the
// one-line status under an alert, the Fixes tab on My Devices (H1) and the
// three fix levels in Settings (S1). The PC's agent carries fixes out.

const ICO_TONE = { g: "g", w: "w", o: undefined, n: undefined };

function FixActions({ fix, pc = "this PC", onUndo, onCancel, busy }) {
  const [confirmUndo, setConfirmUndo] = useState(false);
  if (fix.can_undo) {
    return (
      <>
        <button type="button" className="vd" onClick={() => setConfirmUndo(true)} disabled={busy}>{busy ? "Undoing…" : "Undo"}</button>
        <ConfirmDialog
          open={confirmUndo}
          icon={Undo2}
          title={`Undo “${fix.title}”?`}
          confirmLabel="Undo fix"
          busyLabel="Undoing…"
          onConfirm={async () => {
            setConfirmUndo(false);
            await onUndo(fix);
          }}
          onCancel={() => setConfirmUndo(false)}
        >
          <p>Lectio puts the setting on <b>{pc}</b> back the way it was before this fix.</p>
        </ConfirmDialog>
      </>
    );
  }
  if (fix.status === "queued") {
    return <button type="button" className="vd" onClick={() => onCancel(fix)} disabled={busy}>{busy ? "Cancelling…" : "Cancel"}</button>;
  }
  return null;
}

/** One line under an alert: what happened to the fix chosen for it. */
export function FixStatusLine({ fix, pc, onUndo, onCancel, busy }) {
  const state = fixState(fix, pc);
  const Icon = state.icon;
  return (
    <div className={cx("fx-line", state.tone)} role="status">
      <Icon strokeWidth={2} aria-hidden="true" />
      <span className="f1"><b>{fix.title}</b> · {state.text}</span>
      <FixActions fix={fix} pc={pc} onUndo={onUndo} onCancel={onCancel} busy={busy} />
    </div>
  );
}

/**
 * Design A: the fix options for one alert, as radio cards with "Fix it".
 * onFix({ fixId }) sends the chosen fix; it should throw on failure.
 */
export function FixOptions({ device, alert, onFix }) {
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [picked, setPicked] = useState(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);
  const [showSteps, setShowSteps] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchFixSuggestions(device.id, alert.id)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setPicked((d.options.find((o) => o.recommended) || d.options[0])?.id ?? null);
      })
      .catch((err) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [device.id, alert.id]);

  if (loadError) return <p className="note w" role="alert">{loadError}</p>;
  if (!data) return <p className="sub fx-pad" role="status">Finding ways to fix this…</p>;
  if (!data.options.length) return <p className="txt fx-pad">There's nothing Lectio can do about this one yet.</p>;

  const option = data.options.find((o) => o.id === picked);
  const suggestOnly = data.fix_level === "suggest";
  const hands = option?.manual || suggestOnly;
  const name = `fix-${alert.id}`;

  // "Fix it" changes something on a real PC, so it asks first. "Show me how"
  // only reveals the steps.
  const send = () => {
    if (!option || hands) {
      setShowSteps((v) => !v);
      return;
    }
    setSendError(null);
    setConfirming(true);
  };

  // Runs from the dialog; a failure shows there and nothing is sent.
  const confirmSend = async () => {
    setSending(true);
    try {
      await onFix({ fixId: option.id, option });
      setConfirming(false);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fx-box">
      {data.source === "ai" && <span className="sub fx-ai"><Sparkles strokeWidth={1.9} aria-hidden="true" />Chosen for this problem by Lectio AI</span>}
      <div className="fx-opts" role="radiogroup" aria-label="Ways to fix this">
        {data.options.map((o) => (
          <label key={o.id} className={cx("fx-opt", o.id === picked && "on")}>
            <input type="radio" name={name} value={o.id} checked={o.id === picked} onChange={() => { setPicked(o.id); setShowSteps(false); setSendError(null); }} />
            <span className="f1">
              <b>
                {o.title}
                {o.recommended && <Chip>Best</Chip>}
                {o.manual && <Chip tone="n">You do this</Chip>}
                {!o.manual && o.needs_pc_approval && <Chip tone="o">Asks on the PC</Chip>}
              </b>
              <span className="sub">{o.reason}</span>
            </span>
          </label>
        ))}
      </div>

      {suggestOnly && !option?.manual && (
        <p className="note">Lectio only suggests fixes on your account, so here's how to do it yourself. You can let Lectio fix your PCs in Settings.</p>
      )}
      {showSteps && option && <p className="note fx-steps"><ListChecks strokeWidth={1.9} aria-hidden="true" />{option.how_to || option.summary}</p>}

      <div className="row ac wrap">
        <button type="button" className={cx("bk", !hands && "gr")} onClick={send} disabled={!option || sending}>
          {hands ? (showSteps ? "Hide the steps" : "Show me how") : sending ? "Sending…" : "Fix it"}
        </button>
        {!hands && option?.needs_pc_approval && (
          <span className="sub">Someone at {device.device_name} will need to click Allow.</span>
        )}
        {!hands && option && !option.needs_pc_approval && option.undoable && <span className="sub">You can undo this.</span>}
      </div>
      {sendError && <p className="note w" role="alert">{sendError}</p>}

      {option && !hands && (
        <ConfirmDialog
          open={confirming}
          tone="good"
          icon={Wrench}
          title={`${option.title} on ${device.device_name}?`}
          confirmLabel="Fix it"
          busyLabel="Sending…"
          onConfirm={confirmSend}
          onCancel={() => setConfirming(false)}
        >
          {option.reason && <p>{option.reason}</p>}
          <ul className="cf-list">
            <li>
              {option.needs_pc_approval
                ? <>Someone at {device.device_name} will need to click <b>Allow</b> before it runs.</>
                : <>It runs on {device.device_name} as soon as the PC checks in.</>}
            </li>
            <li>{option.undoable ? "You can undo it afterwards." : "This one can't be undone."}</li>
          </ul>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** H1: the Fixes tab on My Devices. */
export function FixHistory({ fixes, pc, onUndo, onCancel, busyId, loading, error }) {
  return (
    <Card className="pad col f1">
      <Head icon={Wrench} title="Fixes on this PC">
        {fixes.length > 0 && <span className="sub">Newest first</span>}
      </Head>
      {error && <p className="note w" role="alert">{error}</p>}
      {!error && loading && !fixes.length && <p className="sub" role="status">Loading fixes…</p>}
      {!error && !loading && !fixes.length && (
        <Empty title="No fixes yet">
          <span>When Lectio spots a problem, you'll see ways to fix it in the alert.</span>
        </Empty>
      )}
      {fixes.length > 0 && (
        <ul className="fx-list">
          {fixes.map((fix) => {
            const state = fixState(fix, pc);
            return (
              <li key={fix.id}>
                <Ico icon={state.icon} tone={ICO_TONE[state.tone]} />
                <span className="f1">
                  <b>{fix.title}</b>
                  <span className="sub">
                    {state.text} · <time dateTime={fix.created_at} title={new Date(fix.created_at).toLocaleString()}>{timeAgo(fix.created_at)}</time>
                  </span>
                </span>
                <FixActions fix={fix} pc={pc} onUndo={onUndo} onCancel={onCancel} busy={busyId === fix.id} />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
