import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, ArrowLeft, ArrowRight } from "lucide-react";
import { AuthPageLayout, AuthHeading, Field, ErrorBanner, SuccessBanner, u } from "../components/AuthLayout";
import { forgotPassword } from "../services/api";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!email.trim()) return setErrorMsg("Please enter your email address.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErrorMsg("Please enter a valid email address.");

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await forgotPassword(email.trim());
      setSuccessMsg(res.message || "If an account exists with this email, a password reset link has been sent.");
      setEmail("");
    } catch (err) {
      setErrorMsg(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout art="forgot" small formWidth={274} padX={23.5}>
      <AuthHeading icon="mail" title="Reset your password">
        Enter your email address and we'll send<br />you a link to reset your password.
      </AuthHeading>

      <ErrorBanner msg={errorMsg} />
      <SuccessBanner msg={successMsg} />

      <form onSubmit={handleSubmit} className="au-form">
        <Field icon={Mail} style={{ marginTop: u(24.5), height: u(33) }} type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" />
        <button type="submit" disabled={loading} className="au-btn" style={{ marginTop: u(19) }}>
          {loading ? "Sending…" : "Send Reset Link"} <ArrowRight aria-hidden="true" />
        </button>
      </form>

      <button type="button" onClick={() => navigate("/signin")} className="au-link au-back" style={{ marginTop: u(39) }}>
        <ArrowLeft aria-hidden="true" />Back to Sign In
      </button>
    </AuthPageLayout>
  );
}
