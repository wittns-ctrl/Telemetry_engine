import React, { useEffect, useRef, useState } from "react";
import { User, Lock, Trash2, Calendar, Clock, ShieldCheck, Mail, KeyRound, Wrench } from "lucide-react";
import {
  updateProfile,
  changePassword,
  deleteAccount,
  resendVerification,
} from "../services/api";
import { Card, Head, Chip, Ico, Stat, Tabs, Field, Empty } from "./ui";
import { cx, initialsFor } from "./format";
import { FIX_LEVELS } from "./fixState";
import { ConfirmDialog } from "./ConfirmDialog";

// How much a fix level lets Lectio do on its own. Moving up asks first.
const LEVEL_FREEDOM = { suggest: 0, always_ask: 1, standard: 2 };

// Settings: four tabs. Profile (name, email and account facts), Fixes (how far
// Lectio may go in fixing the user's PCs), Password, and Delete account.

const EMPTY_PASSWORDS = { currentPassword: "", newPassword: "", confirmPassword: "" };
const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "fixes", label: "Fixes", icon: Wrench },
  { id: "password", label: "Password", icon: Lock },
  { id: "delete", label: "Delete account", icon: Trash2 },
];

function dateParts(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return { day: "—", time: "" };
  return {
    day: date.toLocaleDateString([], { dateStyle: "medium" }),
    time: date.toLocaleTimeString([], { timeStyle: "short" }),
  };
}

function StatusMessage({ status }) {
  if (!status) return null;
  const ok = status.type === "success";
  return <p role={ok ? "status" : "alert"} className={cx("note", !ok && "w")}>{status.message}</p>;
}

export function SettingsView({ user, onUserUpdated, onSignedOut, onDirtyChange }) {
  const [activeTab, setActiveTab] = useState("profile");

  // --- Personal information ---
  const savedName = user?.full_name || "";
  const [fullName, setFullName] = useState(savedName);
  const [profileStatus, setProfileStatus] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [sendingVerification, setSendingVerification] = useState(false);

  // Alert emails: saved the moment the switch is flipped. Accounts made before
  // the setting existed have no value yet, which means on.
  const emailAlerts = user?.email_alerts !== false;
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [alertsStatus, setAlertsStatus] = useState(null);

  const handleToggleAlerts = async () => {
    const next = !emailAlerts;
    setSavingAlerts(true);
    setAlertsStatus(null);
    try {
      const updated = await updateProfile({ emailAlerts: next });
      onUserUpdated?.({ ...user, ...updated });
      setAlertsStatus({ type: "success", message: next ? "Alert emails are on." : "Alert emails are off." });
    } catch (err) {
      setAlertsStatus({ type: "error", message: err.message });
    } finally {
      setSavingAlerts(false);
    }
  };

  // Fixes: how far Lectio may go. Saved as soon as a level is picked.
  const fixLevel = user?.fix_level || "standard";
  const [savingLevel, setSavingLevel] = useState(false);
  const [levelStatus, setLevelStatus] = useState(null);

  // A level that lets Lectio do more on its own waits for a yes in a dialog.
  const [pendingLevel, setPendingLevel] = useState(null);
  const handlePickLevel = (next) => {
    if (next === fixLevel || savingLevel) return;
    if ((LEVEL_FREEDOM[next] ?? 0) > (LEVEL_FREEDOM[fixLevel] ?? 0)) {
      setPendingLevel(next);
      return;
    }
    saveLevel(next);
  };

  const saveLevel = async (next) => {
    setSavingLevel(true);
    setLevelStatus(null);
    try {
      const updated = await updateProfile({ fixLevel: next });
      onUserUpdated?.({ ...user, ...updated });
      setLevelStatus({ type: "success", message: `Saved. ${FIX_LEVELS.find((l) => l.id === next).title}.` });
    } catch (err) {
      setLevelStatus({ type: "error", message: err.message });
    } finally {
      setSavingLevel(false);
    }
  };

  // Pick up the name once the user loads, or after it changes elsewhere.
  useEffect(() => {
    setFullName(savedName);
  }, [savedName]);

  const nameChanged = fullName.trim() !== savedName;

  // Tell the app about unsaved edits (it asks before leaving Settings), and
  // let the browser warn before the tab is closed or reloaded.
  useEffect(() => {
    onDirtyChange?.(nameChanged);
    if (!nameChanged) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [nameChanged, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    const trimmed = fullName.trim();
    if (!trimmed) {
      setProfileStatus({ type: "error", message: "Full name can't be empty." });
      return;
    }
    setSavingProfile(true);
    setProfileStatus(null);
    try {
      const updated = await updateProfile({ fullName: trimmed });
      onUserUpdated?.({ ...user, ...updated });
      setProfileStatus({ type: "success", message: "Your name has been saved." });
    } catch (err) {
      setProfileStatus({ type: "error", message: err.message });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDiscard = () => {
    setFullName(savedName);
    setProfileStatus(null);
  };

  const handleResendVerification = async () => {
    setSendingVerification(true);
    setVerificationStatus(null);
    try {
      await resendVerification(user.email);
      setVerificationStatus({
        type: "success",
        message: `If ${user.email} still needs verifying, a new link is on its way.`,
      });
    } catch (err) {
      setVerificationStatus({ type: "error", message: err.message });
    } finally {
      setSendingVerification(false);
    }
  };

  // --- Login & password ---
  const [passwords, setPasswords] = useState(EMPTY_PASSWORDS);
  const [passwordStatus, setPasswordStatus] = useState(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const signOutTimer = useRef(null);

  useEffect(() => () => clearTimeout(signOutTimer.current), []);

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswords((prev) => ({ ...prev, [name]: value }));
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!passwords.currentPassword || !passwords.newPassword) {
      setPasswordStatus({ type: "error", message: "Enter your current and new password." });
      return;
    }
    if (passwords.newPassword !== passwords.confirmPassword) {
      setPasswordStatus({ type: "error", message: "The new passwords don't match." });
      return;
    }
    setPasswordStatus(null);
    setConfirmingPassword(true);
  };

  // Runs from the dialog. A failure (for example a wrong current password)
  // shows inside the dialog and leaves the form as it was.
  const [confirmingPassword, setConfirmingPassword] = useState(false);
  const confirmPasswordChange = async () => {
    await changePassword(passwords);
    setConfirmingPassword(false);
    setChangingPassword(true);
    setPasswords(EMPTY_PASSWORDS);
    // The server signs out every session after a password change.
    setPasswordStatus({
      type: "success",
      message: "Password changed. Signing you out so you can sign in with the new password…",
    });
    signOutTimer.current = setTimeout(() => onSignedOut?.(), 2500);
  };

  // --- Delete account (permanent) ---
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteStatus, setDeleteStatus] = useState(null);
  const deleteConfirmed = deleteConfirmText.trim().toUpperCase() === "DELETE";

  const cancelDelete = () => {
    setConfirmingDelete(false);
    setDeleteConfirmText("");
    setDeleteStatus(null);
  };

  // Runs from the dialog; a failure shows there and the account stays.
  const handleDelete = async () => {
    if (!deleteConfirmed) return;
    setDeleting(true);
    try {
      await deleteAccount();
    } catch (err) {
      setDeleting(false);
      throw err;
    }
    onSignedOut?.();
  };

  if (!user) {
    return <div className="page"><Card className="pad f1 col"><Empty title="Loading your account…" /></Card></div>;
  }

  const displayName = user.full_name || user.email;
  const joined = dateParts(user.created_at);
  const lastIn = dateParts(user.last_login_at);

  return (
    <div className="page">
      <Tabs label="Settings section" items={TABS} value={activeTab} onChange={setActiveTab} />

      {activeTab === "profile" && (
        <>
          <div className="g3">
            <Stat label="Member since" value={joined.day} sub={joined.time ? `Joined at ${joined.time}` : "Not recorded"} icon={Calendar} tone="gd" />
            <Stat label="Last sign-in" value={lastIn.day} sub={lastIn.time ? `At ${lastIn.time}` : "Not recorded"} icon={Clock} tone="dk" />
            <Stat label="Role" value={<span style={{ textTransform: "capitalize" }}>{user.role || "—"}</span>} sub="On this account" icon={ShieldCheck} />
          </div>

          <Card as="form" className="pad col f1" style={{ gap: "calc(9 * var(--u))" }} onSubmit={handleSaveProfile}>
            <div className="row ac wrap">
              <span className="ava xl" aria-hidden="true">{initialsFor(displayName)}</span>
              <span className="f1">
                <b className="t9 cut">{displayName}</b>
                <span className="sub cut" style={{ display: "block" }}>{user.email}</span>
              </span>
              <Chip tone={user.email_verified ? undefined : "w"}>{user.email_verified ? "Email verified" : "Email not verified"}</Chip>
            </div>

            <Head icon={User} title="Personal information" />
            <div className="g2">
              <Field label="Full name">
                <input className="inp" type="text" name="fullName" autoComplete="name" maxLength={120} value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </Field>
              <Field label="Email (your sign-in email can't be changed here)">
                <input className="inp" type="email" value={user.email} readOnly />
              </Field>
            </div>

            {!user.email_verified && (
              <div>
                <button type="button" className="bk ol" onClick={handleResendVerification} disabled={sendingVerification}>
                  <Mail strokeWidth={1.9} aria-hidden="true" />
                  {sendingVerification ? "Sending…" : "Resend verification email"}
                </button>
              </div>
            )}
            <StatusMessage status={verificationStatus} />

            <div className="switch-row">
              <span className="f1">
                <b id="alert-emails-label" className="t7">Email me about alerts</b>
                <span id="alert-emails-desc" className="txt" style={{ display: "block" }}>
                  When one of your PCs raises a warning or critical alert, we email {user.email}.
                  You won't get more than one email for the same kind of alert in a short time.
                </span>
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={emailAlerts}
                aria-labelledby="alert-emails-label"
                aria-describedby="alert-emails-desc"
                className={cx("switch", emailAlerts && "on")}
                onClick={handleToggleAlerts}
                disabled={savingAlerts}
              >
                <i aria-hidden="true" />
              </button>
            </div>
            {emailAlerts && !user.email_verified && (
              <p className="note w">Alert emails are only sent to a verified address. Verify your email to start getting them.</p>
            )}
            <StatusMessage status={alertsStatus} />
            <StatusMessage status={profileStatus} />

            <div className="row mt">
              <button type="submit" className="bk" disabled={!nameChanged || savingProfile}>{savingProfile ? "Saving…" : "Save changes"}</button>
              <button type="button" className="bk ol" onClick={handleDiscard} disabled={!nameChanged || savingProfile}>Discard changes</button>
            </div>
          </Card>
        </>
      )}

      {activeTab === "fixes" && (
        <Card className="pad col f1" style={{ gap: "calc(7 * var(--u))" }}>
          <Head icon={Wrench} title="How should Lectio fix your PCs?" />
          <p className="txt">
            When Lectio spots a problem, it suggests ways to fix it. Choose how much it may do on your PCs by itself.
            Whatever you pick, you can undo fixes that change a setting.
          </p>
          <div className="col" role="radiogroup" aria-label="How Lectio fixes your PCs" style={{ gap: "calc(5 * var(--u))" }}>
            {FIX_LEVELS.map((level) => (
              <label key={level.id} className={cx("fx-level", level.id === fixLevel && "on")}>
                <input
                  type="radio"
                  name="fix-level"
                  value={level.id}
                  checked={level.id === fixLevel}
                  onChange={() => handlePickLevel(level.id)}
                  disabled={savingLevel}
                />
                <span className="f1">
                  <b className="t7">{level.title}{level.recommended && <Chip>Recommended</Chip>}</b>
                  <span className="txt" style={{ display: "block" }}>{level.text}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="sub">
            Someone at a PC can also turn fixes off on that PC alone, and Lectio never runs anything outside its list of
            safe fixes.
          </p>
          <StatusMessage status={levelStatus} />
        </Card>
      )}

      {activeTab === "password" && (
        <Card as="form" className="pad col f1" style={{ gap: "calc(9 * var(--u))" }} onSubmit={handleChangePassword}>
          <Head icon={Lock} title="Login and password" />
          <div className="row ac gs" style={{ padding: "calc(8 * var(--u))", borderRadius: "calc(6 * var(--u))" }}>
            <Ico icon={KeyRound} tone="k" />
            <span>
              <b className="t7">Secure your account</b>
              <span className="txt" style={{ display: "block" }}>
                Use at least 8 characters with an uppercase letter, a lowercase letter and a digit.
                Changing your password signs you out on every device.
              </span>
            </span>
          </div>
          <Field label="Current password">
            <input className="inp" type="password" name="currentPassword" autoComplete="current-password" placeholder="Enter your current password" value={passwords.currentPassword} onChange={handlePasswordChange} />
          </Field>
          <div className="g2">
            <Field label="New password">
              <input className="inp" type="password" name="newPassword" autoComplete="new-password" placeholder="Enter new password" value={passwords.newPassword} onChange={handlePasswordChange} />
            </Field>
            <Field label="Confirm new password">
              <input className="inp" type="password" name="confirmPassword" autoComplete="new-password" placeholder="Confirm new password" value={passwords.confirmPassword} onChange={handlePasswordChange} />
            </Field>
          </div>
          <StatusMessage status={passwordStatus} />
          <div className="row mt">
            <button type="submit" className="bk" disabled={changingPassword}>{changingPassword ? "Updating…" : "Update password"}</button>
            <button
              type="button"
              className="bk ol"
              disabled={changingPassword}
              onClick={() => {
                setPasswords(EMPTY_PASSWORDS);
                setPasswordStatus(null);
              }}
            >
              Cancel
            </button>
          </div>
        </Card>
      )}

      {activeTab === "delete" && (
        <Card className="pad col danger" style={{ gap: "calc(9 * var(--u))" }}>
          <div className="row ac">
            <Ico icon={Trash2} tone="w" />
            <span>
              <b className="t7" style={{ color: "var(--rose-text)" }}>Delete account</b>
              <span className="txt" style={{ display: "block" }}>
                Permanently deletes your account, every connected machine, all readings and alerts.
                You'll be signed out everywhere. This can't be undone.
              </span>
            </span>
          </div>
          <StatusMessage status={deleteStatus} />
          <div>
            <button type="button" className="bk rs" onClick={() => setConfirmingDelete(true)}>Delete account</button>
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirmingDelete}
        tone="danger"
        icon={Trash2}
        title="Delete your Lectio account?"
        confirmLabel="Delete account"
        busyLabel="Deleting…"
        cancelLabel="Keep my account"
        confirmDisabled={!deleteConfirmed}
        onConfirm={handleDelete}
        onCancel={cancelDelete}
      >
        <p>This can&apos;t be undone. It permanently deletes:</p>
        <ul className="cf-list">
          <li>Your account and sign-in details</li>
          <li>Every connected PC, with all its readings and alerts</li>
          <li>All fix history and settings</li>
        </ul>
        <label className="cf-field">
          <span>Type <b>DELETE</b> to confirm</span>
          <input
            type="text"
            autoComplete="off"
            autoFocus
            spellCheck={false}
            value={deleteConfirmText}
            onChange={(e) => setDeleteConfirmText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && deleteConfirmed) e.currentTarget.closest(".cf")?.querySelector(".cf-go")?.click(); }}
            disabled={deleting}
            aria-label="Type DELETE to confirm"
          />
        </label>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmingPassword}
        icon={KeyRound}
        title="Change your password?"
        confirmLabel="Change password"
        busyLabel="Changing…"
        onConfirm={confirmPasswordChange}
        onCancel={() => setConfirmingPassword(false)}
      >
        <p>You&apos;ll be signed out on every device, including this one. Sign in again with your new password.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={pendingLevel !== null}
        tone="good"
        icon={Wrench}
        title="Let Lectio do more on its own?"
        confirmLabel="Turn it on"
        busyLabel="Saving…"
        onConfirm={async () => {
          await saveLevel(pendingLevel);
          setPendingLevel(null);
        }}
        onCancel={() => setPendingLevel(null)}
      >
        <p>
          You&apos;re switching to <b>{FIX_LEVELS.find((l) => l.id === pendingLevel)?.title}</b>.{" "}
          {FIX_LEVELS.find((l) => l.id === pendingLevel)?.text}
        </p>
        <p>Lectio only uses its list of safe fixes, and you can undo fixes that change a setting.</p>
      </ConfirmDialog>
    </div>
  );
}
