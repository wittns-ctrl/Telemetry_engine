import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, User, ArrowRight } from "lucide-react";
import {
  loginUser,
  signupUser,
  startGoogleSignIn,
  completeGoogleSignIn,
  GOOGLE_ERROR_MESSAGES,
} from "../services/api";
import { AuthPageLayout, AuthHeading, Field, PasswordField, ErrorBanner, GoogleIcon, AppleIcon, u } from "./AuthLayout";

// "Or continue with" and the two provider buttons. gaps = space above each of the three rows.
function SocialButtons({ lines = false, gaps, onGoogle, onApple, disabled }) {
  return (
    <div className="au-form">
      <div className={`au-or${lines ? " au-or-lines" : ""}`} style={{ marginTop: u(gaps[0]) }}>Or continue with</div>
      <button type="button" className="au-social" onClick={onGoogle} disabled={disabled} style={{ marginTop: u(gaps[1]) }}>
        <GoogleIcon />Continue with Google
      </button>
      <button type="button" className="au-social" onClick={onApple} disabled={disabled} style={{ marginTop: u(gaps[2]) }}>
        <AppleIcon />Continue with Apple
      </button>
    </div>
  );
}

// ── Main Auth Page ─────────────────────────────────────────────────────────────
export function AuthPage({ onAuthSuccess, initialScreen = "signin" }) {
  const navigate = useNavigate();
  // /signup opens straight on the sign-up form; /signin on the log-in form.
  const [screen, setScreen] = useState(initialScreen);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const clearError = () => setErrorMsg(null);
  const navigateScreen = (s) => { clearError(); setScreen(s); };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true); clearError();
    try {
      await loginUser(email, password);
      onAuthSuccess();
    } catch (err) {
      setErrorMsg(err.message || "Could not sign in. Please verify your credentials.");
    } finally { setLoading(false); }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();

    // Validation
    if (!fullName.trim()) return setErrorMsg("Please enter your full name.");
    if (!email.trim()) return setErrorMsg("Please enter your email address.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErrorMsg("Please enter a valid email address.");
    if (!password) return setErrorMsg("Please enter a password.");
    if (password.length < 8) return setErrorMsg("Password must be at least 8 characters.");
    if (!/[A-Z]/.test(password)) return setErrorMsg("Password must contain at least one uppercase letter.");
    if (!/[a-z]/.test(password)) return setErrorMsg("Password must contain at least one lowercase letter.");
    if (!/\d/.test(password)) return setErrorMsg("Password must contain at least one digit.");

    setLoading(true); clearError();
    try {
      // The form has one password field (with a show/hide eye), so it doubles as the confirmation.
      await signupUser({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        confirmPassword: password,
      });
      // Automatically authenticate on successful registration
      await loginUser(email, password);
      onAuthSuccess();
    } catch (err) {
      setErrorMsg(err.message || "Could not create account.");
    } finally { setLoading(false); }
  };

  // Returning from Google: /signin?google=success or /signin?error=<code>.
  const googleReturnHandled = useRef(false);
  useEffect(() => {
    if (googleReturnHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const googleResult = params.get("google");
    const errorCode = params.get("error");
    if (!googleResult && !errorCode) return;
    googleReturnHandled.current = true;
    navigate("/signin", { replace: true });

    if (errorCode) {
      setErrorMsg(GOOGLE_ERROR_MESSAGES[errorCode] || GOOGLE_ERROR_MESSAGES.google_failed);
      return;
    }
    setLoading(true);
    completeGoogleSignIn()
      .then(() => onAuthSuccess())
      .catch((err) => setErrorMsg(err.message))
      .finally(() => setLoading(false));
  }, [navigate, onAuthSuccess]);

  const handleGoogleSignIn = () => {
    clearError();
    startGoogleSignIn();
  };

  // The button is part of the design, but the backend only has Google sign-in so far.
  const handleAppleSignIn = () => setErrorMsg("Apple sign-in isn't available yet. Use Google or your email instead.");

  // ─── SIGN UP ────────────────────────────────────────────────────────────────
  if (screen === "signup") return (
    <AuthPageLayout
      art="signup"
      formWidth={355}
      padX={41.5}
      footnote={
        <>
          By creating an account, you agree to our{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer" className="au-link">Terms of Service</a>{" "}
          and{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer" className="au-link">Privacy Policy</a>.
        </>
      }
    >
      <AuthHeading title="Get started for free">Create your account in just a few steps</AuthHeading>
      <ErrorBanner msg={errorMsg} />
      <form onSubmit={handleSignUp} className="au-form">
        <Field icon={User} style={{ marginTop: u(26) }} type="text" required autoComplete="name" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Full name" />
        <Field icon={Mail} style={{ marginTop: u(10) }} type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" />
        <PasswordField style={{ marginTop: u(10) }} required autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
        <button type="submit" disabled={loading} className="au-btn" style={{ marginTop: u(10.5) }}>
          {loading ? "Creating account…" : "Create Account"} <ArrowRight aria-hidden="true" />
        </button>
      </form>
      <SocialButtons gaps={[15.5, 12, 9]} onGoogle={handleGoogleSignIn} onApple={handleAppleSignIn} disabled={loading} />
      <p className="au-foot" style={{ marginTop: u(30) }}>
        Already have an account?{" "}
        <button type="button" onClick={() => navigateScreen("signin")} className="au-link">Sign in</button>
      </p>
    </AuthPageLayout>
  );

  // ─── SIGN IN ────────────────────────────────────────────────────────────────
  return (
    <AuthPageLayout art="signin" formWidth={362} padX={44}>
      <AuthHeading title="Sign in to your account">Enter your email and password to continue</AuthHeading>
      <ErrorBanner msg={errorMsg} />
      <form onSubmit={handleSignIn} className="au-form">
        <Field icon={Mail} style={{ marginTop: u(23.5) }} type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email address" />
        <PasswordField style={{ marginTop: u(11.5) }} required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" />
        <div className="au-row" style={{ marginTop: u(16) }}>
          <label><input type="checkbox" />Remember me</label>
          <button type="button" onClick={() => navigate("/forgot-password")} className="au-link">Forgot password?</button>
        </div>
        <button type="submit" disabled={loading} className="au-btn" style={{ marginTop: u(17.5) }}>
          {loading ? "Signing in…" : "Sign In"} <ArrowRight aria-hidden="true" />
        </button>
      </form>
      <SocialButtons lines gaps={[18, 16, 11.5]} onGoogle={handleGoogleSignIn} onApple={handleAppleSignIn} disabled={loading} />
      <p className="au-foot" style={{ marginTop: u(28) }}>
        Don't have an account?{" "}
        <button type="button" onClick={() => navigateScreen("signup")} className="au-link">Sign up</button>
      </p>
    </AuthPageLayout>
  );
}
