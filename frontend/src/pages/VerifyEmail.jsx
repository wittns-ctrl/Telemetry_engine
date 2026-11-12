import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Check } from "lucide-react";
import { AuthPageLayout, ErrorBanner, SuccessBanner, u } from "../components/AuthLayout";
import { verifyEmail, resendVerification } from "../services/api";
import art from "../assets/auth/verify-email.png";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const emailParam = searchParams.get("email");

  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(Boolean(token));
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    if (token) {
      setVerifying(true);
      verifyEmail(token)
        .then((res) => {
          setSuccessMsg(res.message || "Email verified successfully! You can now sign in.");
          setErrorMsg(null);
        })
        .catch((err) => {
          setErrorMsg(err.message || "Verification link is invalid or has expired.");
        })
        .finally(() => {
          setVerifying(false);
        });
    }
  }, [token]);

  const handleResend = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await resendVerification(emailParam);
      setSuccessMsg(res.message || "Verification email has been resent. Please check your inbox.");
    } catch (err) {
      setErrorMsg(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Without a token this is the "we emailed you" page; with one, the page the emailed link opens.
  let title = "Verification Email Sent";
  let body = <>Please check your inbox and<br />click the link to verify your account.</>;
  if (token) {
    title = verifying ? "Verifying your email…" : errorMsg ? "Verification failed" : "Email Verified";
    body = verifying ? "This only takes a moment." : errorMsg ? "Ask for a new link and try again." : "Your account is ready to use.";
  }

  return (
    <AuthPageLayout image={art} small width={500} imageWidth={248} padX={25.5} padTop={56}>
      <div className="au-halo"><span><Check aria-hidden="true" /></span></div>
      <h1 className="au-title" style={{ marginTop: u(15), fontSize: u(16.5) }}>{title}</h1>
      <p className="au-sub" style={{ marginTop: u(19.5), fontSize: u(10.7), lineHeight: u(16.5) }}>{body}</p>

      <ErrorBanner msg={errorMsg} />
      <SuccessBanner msg={successMsg} />

      <button type="button" onClick={() => navigate("/signin")} className="au-soft" style={{ marginTop: u(54.5) }}>
        Back to Sign In
      </button>

      {/* Not in the design: resending needs the address, which only the post-sign-up link carries. */}
      {emailParam && (
        <p className="au-foot" style={{ marginTop: u(14) }}>
          Didn't get it?{" "}
          <button type="button" onClick={handleResend} disabled={loading} className="au-link">
            {loading ? "Sending…" : "Resend email"}
          </button>
        </p>
      )}
    </AuthPageLayout>
  );
}
