import React, { useEffect, useRef, useState } from "react";
import { User, Lock, Check, KeyRound, AlertTriangle, Mail } from "lucide-react";
import {
  updateProfile,
  changePassword,
  deleteAccount,
  resendVerification,
} from "../services/api";
import { Avatar } from "./Avatar";

const inputClass =
  "w-full bg-slate-50/70 border-none rounded-xl px-4 py-3.5 text-slate-800 font-medium outline-none focus:ring-2 focus:ring-ink-500/20 transition-all";
const primaryButton =
  "flex-1 py-4 bg-[#1c1c1f] text-white rounded-xl font-bold hover:bg-ink-900 transition-colors cursor-pointer shadow-md shadow-ink-900/20 disabled:opacity-50 disabled:cursor-not-allowed";
const secondaryButton =
  "flex-1 py-4 border-2 border-[#1c1c1f] text-[#1c1c1f] rounded-xl font-bold hover:bg-ink-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

const EMPTY_PASSWORDS = { currentPassword: "", newPassword: "", confirmPassword: "" };

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function StatusMessage({ status }) {
  if (!status) return null;
  const ok = status.type === "success";
  return (
    <div
      role={ok ? "status" : "alert"}
      className={`rounded-xl px-4 py-3 text-sm font-medium ${
        ok ? "bg-ink-50 text-ink-800" : "bg-rose-50 text-rose-700"
      }`}
    >
      {status.message}
    </div>
  );
}

export function SettingsView({ user, onUserUpdated, onSignedOut }) {
  const [activeTab, setActiveTab] = useState("personal"); // 'personal' or 'security'

  // --- Personal information ---
  const savedName = user?.full_name || "";
  const [fullName, setFullName] = useState(savedName);
  const [profileStatus, setProfileStatus] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState(null);
  const [sendingVerification, setSendingVerification] = useState(false);

  // Pick up the name once the user loads, or after it changes elsewhere.
  useEffect(() => {
    setFullName(savedName);
  }, [savedName]);

  const nameChanged = fullName.trim() !== savedName;

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
      onUserUpdated?.(updated);
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
    setChangingPassword(true);
    setPasswordStatus(null);
    try {
      await changePassword(passwords);
      setPasswords(EMPTY_PASSWORDS);
      // The server signs out every session after a password change.
      setPasswordStatus({
        type: "success",
        message: "Password changed. Signing you out so you can sign in with the new password…",
      });
      signOutTimer.current = setTimeout(() => onSignedOut?.(), 2500);
    } catch (err) {
      setPasswordStatus({ type: "error", message: err.message });
      setChangingPassword(false);
    }
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

  const handleDelete = async () => {
    if (!deleteConfirmed) return;
    setDeleting(true);
    setDeleteStatus(null);
    try {
      await deleteAccount();
      onSignedOut?.();
    } catch (err) {
      setDeleteStatus({ type: "error", message: err.message });
      setDeleting(false);
    }
  };

  if (!user) {
    return (
      <div className="max-w-6xl mx-auto p-4 text-sm text-slate-500">Loading your account…</div>
    );
  }

  const displayName = user.full_name || user.email;

  return (
    <div className="max-w-6xl mx-auto h-full p-4 flex flex-col lg:flex-row gap-6">
      {/* LEFT COLUMN: Profile Sidebar */}
      <div className="w-full lg:w-[300px] shrink-0 glass rounded-3xl flex flex-col items-center p-8 h-fit">
        <Avatar name={displayName} size="lg" className="mb-4 border-4 border-white shadow-sm" />

        <h2 className="text-xl font-bold text-slate-900 text-center break-words max-w-full">
          {displayName}
        </h2>
        <p className="text-xs text-slate-500 mb-8 break-all text-center">{user.email}</p>

        <div className="w-full space-y-2">
          <button
            onClick={() => setActiveTab("personal")}
            className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-xl font-semibold transition-colors cursor-pointer text-sm ${
              activeTab === "personal" ? "bg-ink-50 text-ink-900" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <User className={`w-5 h-5 ${activeTab === "personal" ? "text-ink-600" : "text-slate-400"}`} />
            Personal Information
          </button>
          <button
            onClick={() => setActiveTab("security")}
            className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-xl font-semibold transition-colors cursor-pointer text-sm ${
              activeTab === "security" ? "bg-ink-50 text-ink-900" : "text-slate-500 hover:bg-slate-50"
            }`}
          >
            <Lock className={`w-5 h-5 ${activeTab === "security" ? "text-ink-600" : "text-slate-400"}`} />
            Login & Password
          </button>
        </div>
      </div>

      {/* RIGHT COLUMN: Content Area */}
      <div className="flex-1 glass rounded-3xl p-6 md:p-10">
        {activeTab === "personal" && (
          <>
            <h1 className="text-2xl font-bold text-slate-900 mb-8">Personal Information</h1>
            <form className="space-y-6" onSubmit={handleSaveProfile}>
              <div>
                <label htmlFor="settings-full-name" className="block text-slate-500 text-sm font-medium mb-2">
                  Full Name
                </label>
                <input
                  id="settings-full-name"
                  type="text"
                  name="fullName"
                  autoComplete="name"
                  maxLength={120}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="settings-email" className="block text-slate-500 text-sm font-medium mb-2">
                  Email
                </label>
                <div className="relative">
                  <input
                    id="settings-email"
                    type="email"
                    value={user.email}
                    readOnly
                    className={`${inputClass} pr-32 text-slate-500 cursor-default`}
                  />
                  <div
                    className={`absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 font-medium text-sm ${
                      user.email_verified ? "text-ink-600" : "text-amber-700" /* 4.8:1; amber-600 text is only 3.2:1 */
                    }`}
                  >
                    {user.email_verified ? (
                      <>
                        <Check className="w-4 h-4 bg-ink-500 text-white rounded-full p-0.5" />
                        Verified
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-4 h-4" />
                        Not verified
                      </>
                    )}
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-2">Your sign-in email can't be changed here.</p>
                {!user.email_verified && (
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={sendingVerification}
                    className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#1c1c1f] hover:underline cursor-pointer disabled:opacity-50"
                  >
                    <Mail className="w-4 h-4" />
                    {sendingVerification ? "Sending…" : "Resend verification email"}
                  </button>
                )}
                <div className="mt-3">
                  <StatusMessage status={verificationStatus} />
                </div>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-2xl bg-slate-50/70 p-5 text-sm">
                <div>
                  <dt className="text-slate-500 font-medium">Member since</dt>
                  <dd className="text-slate-800 font-semibold mt-1">{formatDate(user.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500 font-medium">Last sign-in</dt>
                  <dd className="text-slate-800 font-semibold mt-1">{formatDate(user.last_login_at)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500 font-medium">Role</dt>
                  <dd className="text-slate-800 font-semibold mt-1 capitalize">{user.role}</dd>
                </div>
              </dl>

              <StatusMessage status={profileStatus} />

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={handleDiscard}
                  disabled={!nameChanged || savingProfile}
                  className={secondaryButton}
                >
                  Discard Changes
                </button>
                <button type="submit" disabled={!nameChanged || savingProfile} className={primaryButton}>
                  {savingProfile ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </>
        )}

        {activeTab === "security" && (
          <>
            <h1 className="text-2xl font-bold text-slate-900 mb-8">Login & Password</h1>

            <div className="bg-ink-50 border border-ink-100 rounded-2xl p-5 mb-8 flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-ink-200/50 flex items-center justify-center text-ink-700 shrink-0 mt-1">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink-900 mb-1">Secure your account</h3>
                <p className="text-xs text-ink-800/80 leading-relaxed">
                  Use at least 8 characters with an uppercase letter, a lowercase letter and a digit.
                  Changing your password signs you out on every device.
                </p>
              </div>
            </div>

            <form className="space-y-6" onSubmit={handleChangePassword}>
              <div>
                <label htmlFor="settings-current-password" className="block text-slate-500 text-sm font-medium mb-2">
                  Current Password
                </label>
                <input
                  id="settings-current-password"
                  type="password"
                  name="currentPassword"
                  autoComplete="current-password"
                  value={passwords.currentPassword}
                  onChange={handlePasswordChange}
                  placeholder="Enter your current password"
                  className={inputClass}
                />
              </div>

              <div className="h-px bg-slate-100 my-2"></div>

              <div>
                <label htmlFor="settings-new-password" className="block text-slate-500 text-sm font-medium mb-2">
                  New Password
                </label>
                <input
                  id="settings-new-password"
                  type="password"
                  name="newPassword"
                  autoComplete="new-password"
                  value={passwords.newPassword}
                  onChange={handlePasswordChange}
                  placeholder="Enter new password"
                  className={inputClass}
                />
              </div>

              <div>
                <label htmlFor="settings-confirm-password" className="block text-slate-500 text-sm font-medium mb-2">
                  Confirm New Password
                </label>
                <input
                  id="settings-confirm-password"
                  type="password"
                  name="confirmPassword"
                  autoComplete="new-password"
                  value={passwords.confirmPassword}
                  onChange={handlePasswordChange}
                  placeholder="Confirm new password"
                  className={inputClass}
                />
              </div>

              <StatusMessage status={passwordStatus} />

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  disabled={changingPassword}
                  onClick={() => {
                    setPasswords(EMPTY_PASSWORDS);
                    setPasswordStatus(null);
                  }}
                  className={secondaryButton}
                >
                  Cancel
                </button>
                <button type="submit" disabled={changingPassword} className={primaryButton}>
                  {changingPassword ? "Updating…" : "Update Password"}
                </button>
              </div>
            </form>

            <div className="mt-12 border border-rose-100 rounded-2xl p-6">
              <h2 className="text-base font-bold text-rose-700 mb-1">Delete account</h2>
              <p className="text-sm text-slate-500 mb-4">
                Permanently deletes your account, every connected machine, all readings and alerts.
                You'll be signed out everywhere. This can't be undone.
              </p>
              <StatusMessage status={deleteStatus} />
              {confirmingDelete ? (
                <div className="mt-4">
                  <label htmlFor="settings-delete-confirm" className="block text-slate-600 text-sm font-medium mb-2">
                    Type <span className="font-mono font-bold text-rose-700">DELETE</span> to confirm
                  </label>
                  <input
                    id="settings-delete-confirm"
                    type="text"
                    autoComplete="off"
                    autoFocus
                    value={deleteConfirmText}
                    onChange={(e) => setDeleteConfirmText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleDelete(); }}
                    disabled={deleting}
                    className="w-full px-4 py-3 rounded-xl border-2 border-rose-200 focus:border-rose-500 focus:outline-none text-slate-900"
                  />
                  <div className="flex flex-col sm:flex-row gap-3 mt-4">
                    <button
                      type="button"
                      onClick={cancelDelete}
                      disabled={deleting}
                      className="flex-1 py-3 border-2 border-slate-300 text-slate-700 rounded-xl font-bold hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                    >
                      Keep my account
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting || !deleteConfirmed}
                      className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-bold hover:bg-rose-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {deleting ? "Deleting…" : "Permanently delete my account"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  className="mt-2 py-3 px-5 border-2 border-rose-200 text-rose-700 rounded-xl font-bold hover:bg-rose-50 cursor-pointer"
                >
                  Delete account
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
