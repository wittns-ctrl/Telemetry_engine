import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The one confirmation dialog used across the signed-in app (approved design A):
 * a centred white card with a round icon on top, a title, a short explanation
 * and two equal buttons, Cancel and the action.
 *
 * tone: "danger" (rose, for deleting things), "good" (green, for fixes) or
 * "neutral" (black, for everything else).
 *
 * onConfirm may return a promise. While it runs the buttons show busyLabel and
 * the dialog can't be closed; if it throws, its message shows in the dialog and
 * the dialog stays open. Closing it after success is up to the caller.
 *
 * For risky actions the Cancel button has focus first, so pressing Enter by
 * habit doesn't confirm. Esc and a click outside cancel; Tab stays inside.
 */
export function ConfirmDialog({
  open,
  tone = "neutral",
  icon: Icon,
  title,
  children,
  confirmLabel,
  busyLabel = "Working…",
  cancelLabel = "Cancel",
  confirmDisabled = false,
  onConfirm,
  onCancel,
}) {
  const titleId = useId();
  const bodyId = useId();
  const cardRef = useRef(null);
  const cancelRef = useRef(null);
  const confirmRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Kept in refs so the key handler always sees the latest props.
  const state = useRef({});
  state.current = { busy, onCancel };

  useEffect(() => {
    if (!open) return undefined;
    setBusy(false);
    setError(null);
    const before = document.activeElement;
    const first = tone === "danger" || !confirmRef.current ? cancelRef.current : confirmRef.current;
    // Let a field inside the dialog (autoFocus) keep focus if it took it.
    if (!cardRef.current?.contains(document.activeElement)) first?.focus();

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (!state.current.busy) state.current.onCancel?.();
        return;
      }
      if (e.key !== "Tab" || !cardRef.current) return;
      const items = [...cardRef.current.querySelectorAll("button:not(:disabled), input:not(:disabled), a[href]")];
      if (!items.length) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (before instanceof HTMLElement && document.contains(before)) before.focus();
    };
  }, [open, tone]);

  if (!open) return null;

  const confirm = async () => {
    if (busy || confirmDisabled) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm?.();
    } catch (err) {
      setError(err?.message || "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  // Drawn at the top of the signed-in app rather than where it was opened, so
  // the styles of a list row or card around the button can't leak into it.
  const host = document.querySelector(".ld-frame") || document.body;
  return createPortal(
    <div
      className="cf-back"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel?.();
      }}
    >
      <div
        ref={cardRef}
        className={`cf cf-${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        aria-busy={busy || undefined}
      >
        {Icon && (
          <span className="cf-ico" aria-hidden="true">
            <Icon strokeWidth={2} />
          </span>
        )}
        <h2 id={titleId} className="cf-title">{title}</h2>
        <div id={bodyId} className="cf-body">{children}</div>
        {error && <p className="cf-error" role="alert">{error}</p>}
        <div className="cf-actions">
          <button type="button" ref={cancelRef} className="cf-btn cf-cancel" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            ref={confirmRef}
            className="cf-btn cf-go"
            onClick={confirm}
            disabled={busy || confirmDisabled}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    host,
  );
}
