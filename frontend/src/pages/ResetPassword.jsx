import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { AuthPageLayout, AuthHeading, PasswordField, ErrorBanner, SuccessBanner, u } from "../components/AuthLayout";
import { resetPassword } from "../services/api";
import art from "../assets/auth/reset-password.png";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!token) return setErrorMsg("Missing or invalid password reset token. Please request a new link.");
    if (!newPassword) return setErrorMsg("Please enter a new password.");
    if (newPassword.length < 8) return setErrorMsg("Password must be at least 8 characters.");
    if (!/[A-Z]/.test(newPassword)) return setErrorMsg("Password must contain at least one uppercase letter.");
    if (!/[a-z]/.test(newPassword)) return setErrorMsg("Password must contain at least one lowercase letter.");
    if (!/\d/.test(newPassword)) return setErrorMsg("Password must contain at least one digit.");
    if (newPassword !== confirmPassword) return setErrorMsg("Passwords do not match.");

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await resetPassword(token, newPassword, confirmPassword);
      setSuccessMsg(res.message || "Your password has been successfully reset. You can now sign in with your new password.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setErrorMsg(err.message || "Something went wrong. The link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout image={art} small width={486} imageWidth={218} padX={25}>
      <AuthHeading icon="lock" title="Create new password">Enter your new password below.</AuthHeading>

      <ErrorBanner msg={errorMsg} />
      <SuccessBanner msg={successMsg} />

      <form onSubmit={handleSubmit} className="au-form">
        <PasswordField style={{ marginTop: u(24.5), height: u(34) }} required autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password" />
        <PasswordField style={{ marginTop: u(15), height: u(34) }} required autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="Confirm password" />
        <button type="submit" disabled={loading} className="au-btn" style={{ marginTop: u(20) }}>
          {loading ? "Resetting…" : "Reset Password"} <ArrowRight aria-hidden="true" />
        </button>
      </form>

      {/* The design has no link here; it appears once the password is changed, as the way onward. */}
      {successMsg && (
        <button type="button" onClick={() => navigate("/signin")} className="au-link au-back" style={{ marginTop: u(18) }}>
          <ArrowLeft aria-hidden="true" />Back to Sign In
        </button>
      )}
    </AuthPageLayout>
  );
}
