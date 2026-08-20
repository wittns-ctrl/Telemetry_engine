import React, { useState } from "react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  CheckCircle2,
  ArrowLeft,
  Check,
} from "lucide-react";
import { loginUser, signupUser } from "../services/api";

// ── Shared right decorative panel ─────────────────────────────────────────────
function RightPanel() {
  return (
    <div className="hidden lg:flex flex-col items-center justify-center bg-[#0d3b2e] p-12 relative overflow-hidden flex-1">
      {/* Background circles */}
      <div className="absolute w-96 h-96 rounded-full bg-white/5 -top-20 -right-20" />
      <div className="absolute w-64 h-64 rounded-full bg-white/5 bottom-10 -left-16" />
      <div className="absolute w-40 h-40 rounded-full bg-emerald-400/10 top-1/2 right-8" />

      {/* Logo */}
      <div className="flex items-center gap-2.5 mb-8 relative z-10">
        <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
          <div className="w-4 h-4 border-2 border-white rounded-full" />
        </div>
        <span className="font-bold text-white text-lg tracking-tight">Donezo</span>
      </div>

      {/* Heading */}
      <div className="text-center relative z-10 mb-8">
        <h2 className="text-white font-bold text-3xl mb-3 leading-tight">
          Real-time telemetry.<br />Smarter decisions.
        </h2>
        <p className="text-white/70 text-base leading-relaxed max-w-sm">
          Monitor, ingest, and analyze your telemetry streams in real time.
        </p>
      </div>

      {/* Illustration with gauge and graph */}
      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-8 w-full max-w-md mb-8 relative z-10">
        <div className="grid grid-cols-2 gap-6">
          {/* Gauge */}
          <div className="bg-white/5 rounded-2xl p-4 flex flex-col items-center justify-center">
            <div className="relative w-20 h-20 mb-2">
              <svg className="w-20 h-20 transform -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="3"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="3"
                  strokeDasharray="98.2, 100"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white font-bold text-sm">98.2%</span>
              </div>
            </div>
            <div className="text-white/60 text-xs">Uptime</div>
          </div>

          {/* Graph */}
          <div className="bg-white/5 rounded-2xl p-4">
            <div className="flex items-end gap-1.5 h-16">
              {[30, 45, 35, 60, 50, 75, 65, 85, 55, 95].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm transition-all"
                  style={{
                    height: `${h}%`,
                    backgroundColor: i === 9 ? "rgba(52,211,153,0.9)" : "rgba(255,255,255,0.2)",
                  }}
                />
              ))}
            </div>
            <div className="text-white/60 text-xs mt-2 text-center">Events/s</div>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-3 mt-6">
          <div className="flex-1 bg-white/5 rounded-xl p-3 text-center">
            <div className="text-emerald-300 font-bold text-lg">4.2k</div>
            <div className="text-white/60 text-xs">Events/s</div>
          </div>
          <div className="flex-1 bg-white/5 rounded-xl p-3 text-center">
            <div className="text-emerald-300 font-bold text-lg">12ms</div>
            <div className="text-white/60 text-xs">Latency</div>
          </div>
          <div className="flex-1 bg-white/5 rounded-xl p-3 text-center">
            <div className="text-emerald-300 font-bold text-lg">99.9%</div>
            <div className="text-white/60 text-xs">Success</div>
          </div>
        </div>
      </div>

      {/* Feature highlights */}
      <div className="space-y-4 relative z-10 w-full max-w-md">
        <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-400/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <div className="text-white font-semibold text-sm">Real-time Monitoring</div>
            <div className="text-white/60 text-xs">Track metrics as they happen</div>
          </div>
        </div>
        <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-400/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <div className="text-white font-semibold text-sm">Powerful Analytics</div>
            <div className="text-white/60 text-xs">Deep insights and trends</div>
          </div>
        </div>
        <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-2xl p-4">
          <div className="w-10 h-10 rounded-xl bg-emerald-400/20 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5 text-emerald-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div>
            <div className="text-white font-semibold text-sm">Instant Alerts</div>
            <div className="text-white/60 text-xs">Get notified immediately</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Logo ───────────────────────────────────────────────────────────────────────
function Logo() {
  return (
    <div className="flex items-center gap-2.5 mb-8">
      <div className="w-9 h-9 rounded-full bg-[#0d3b2e] flex items-center justify-center shadow-lg">
        <div className="w-4 h-4 border-2 border-white rounded-full" />
      </div>
      <span className="font-bold text-slate-900 text-lg tracking-tight">Donezo</span>
    </div>
  );
}

// ── Password input ─────────────────────────────────────────────────────────────
function PasswordInput({ placeholder, value, onChange, name, label }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      {label && <label className="block text-sm font-medium text-slate-700 mb-1.5">{label}</label>}
      <div className="relative">
        <Lock className="w-4 h-4 text-slate-300 absolute left-3.5 top-3.5" />
        <input
          type={show ? "text" : "password"}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-10 py-3 text-sm text-slate-800 outline-none focus:border-[#0d3b2e] focus:bg-white transition-all"
        />
        <button type="button" onClick={() => setShow(s => !s)} className="absolute right-3.5 top-3.5 text-slate-400 hover:text-slate-600">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

const ErrorBanner = ({ msg }) => msg ? (
  <div className="mb-4 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{msg}</div>
) : null;

// ── Page wrapper ───────────────────────────────────────────────────────────────
function PageLayout({ children }) {
  return (
    <div className="min-h-screen flex font-sans bg-[#f3f5f7]">
      {/* Left decorative panel */}
      <RightPanel />
      {/* Right form column with frosted glass effect */}
      <div className="flex flex-col justify-center flex-1 max-w-lg px-8 md:px-16 py-12 bg-white/90 backdrop-blur-md min-h-screen">
        {children}
      </div>
    </div>
  );
}

// ── Main Auth Page ─────────────────────────────────────────────────────────────
export function AuthPage({ onAuthSuccess }) {
  const [screen, setScreen] = useState("signin");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);

  const clearError = () => setErrorMsg(null);
  const navigate = (s) => { clearError(); setScreen(s); };

  const checks = {
    length: newPassword.length >= 8,
    number: /\d/.test(newPassword),
    uppercase: /[A-Z]/.test(newPassword),
  };

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true); clearError();
    try {
      const tokenData = await loginUser(email, password);
      localStorage.setItem("telemetry_jwt_token", tokenData.access_token);
      onAuthSuccess();
    } catch (err) {
      setErrorMsg(err.message || "Invalid email or password.");
    } finally { setLoading(false); }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) return setErrorMsg("Passwords do not match.");
    if (!agreeTerms) return setErrorMsg("Please agree to the Terms of Service.");
    setLoading(true); clearError();
    try {
      await signupUser(email, password);
      const tokenData = await loginUser(email, password);
      localStorage.setItem("telemetry_jwt_token", tokenData.access_token);
      navigate("verify");
    } catch (err) {
      setErrorMsg(err.message || "Could not create account.");
    } finally { setLoading(false); }
  };

  const handleForgotPassword = (e) => {
    e.preventDefault();
    navigate("reset");
  };

  const handleResetPassword = (e) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) return setErrorMsg("Passwords do not match.");
    if (!checks.length || !checks.number || !checks.uppercase) return setErrorMsg("Password does not meet all requirements.");
    navigate("signin");
  };

  // ─── SIGN IN ────────────────────────────────────────────────────────────────
  if (screen === "signin") return (
    <PageLayout>
      <Logo />
      <h1 className="text-3xl font-bold text-slate-900 mb-2">Welcome back</h1>
      <p className="text-sm text-slate-400 mb-8">Sign in to continue to your telemetry dashboard.</p>
      <ErrorBanner msg={errorMsg} />
      <form onSubmit={handleSignIn} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-300 absolute left-3.5 top-3.5" />
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 outline-none focus:border-[#0d3b2e] focus:bg-white transition-all" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
          <PasswordInput placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} name="password" />
        </div>
        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 cursor-pointer" onClick={() => setRememberMe(r => !r)}>
            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${rememberMe ? "bg-[#0d3b2e] border-[#0d3b2e]" : "border-slate-300 bg-white"}`}>
              {rememberMe && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
            </div>
            <span className="text-slate-600 select-none">Remember me</span>
          </label>
          <button type="button" onClick={() => navigate("forgot")} className="text-[#0d3b2e] font-semibold hover:underline text-sm">Forgot password?</button>
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-3.5 rounded-xl bg-[#0d3b2e] text-white font-bold text-sm hover:bg-emerald-900 transition-colors disabled:opacity-60 shadow-lg shadow-emerald-900/20">
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-slate-100" /><span className="text-xs text-slate-400">or</span><div className="flex-1 h-px bg-slate-100" />
      </div>
      <button type="button" className="w-full py-3.5 rounded-xl border border-slate-200 flex items-center justify-center gap-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors bg-white">
        <img src="https://www.google.com/favicon.ico" alt="" className="w-4 h-4" />
        Continue with Google
      </button>
      <p className="text-center text-sm text-slate-500 mt-8">
        Don't have an account?{" "}
        <button type="button" onClick={() => navigate("signup")} className="text-[#0d3b2e] font-bold hover:underline">Sign up</button>
      </p>
    </PageLayout>
  );

  // ─── SIGN UP ────────────────────────────────────────────────────────────────
  if (screen === "signup") return (
    <PageLayout>
      <Logo />
      <h1 className="text-3xl font-bold text-slate-900 mb-2">Sign Up</h1>
      <p className="text-sm text-slate-400 mb-8">Create your account to get started</p>
      <ErrorBanner msg={errorMsg} />
      <form onSubmit={handleSignUp} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Full name</label>
          <div className="relative">
            <User className="w-4 h-4 text-slate-300 absolute left-3.5 top-3.5" />
            <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="John Doe"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 outline-none focus:border-[#0d3b2e] focus:bg-white transition-all" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-300 absolute left-3.5 top-3.5" />
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 outline-none focus:border-[#0d3b2e] focus:bg-white transition-all" />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Password</label>
          <PasswordInput placeholder="Create a strong password" value={password} onChange={e => setPassword(e.target.value)} name="password" />
          <p className="text-xs text-slate-400 mt-1.5">Password must be at least 8 characters</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm password</label>
          <PasswordInput placeholder="Confirm your password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} name="confirmPassword" />
        </div>
        <label className="flex items-start gap-2 cursor-pointer text-sm text-slate-600" onClick={() => setAgreeTerms(a => !a)}>
          <div className={`w-4 h-4 rounded border flex items-center justify-center mt-0.5 shrink-0 transition-colors ${agreeTerms ? "bg-[#0d3b2e] border-[#0d3b2e]" : "border-slate-300 bg-white"}`}>
            {agreeTerms && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
          </div>
          <span className="select-none">I agree to the <span className="text-[#0d3b2e] font-semibold">Terms of Service</span> and <span className="text-[#0d3b2e] font-semibold">Privacy Policy</span></span>
        </label>
        <button type="submit" disabled={loading}
          className="w-full py-3.5 rounded-xl bg-[#0d3b2e] text-white font-bold text-sm hover:bg-emerald-900 transition-colors disabled:opacity-60 shadow-lg shadow-emerald-900/20">
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </form>
      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-slate-100" /><span className="text-xs text-slate-400">or</span><div className="flex-1 h-px bg-slate-100" />
      </div>
      <button type="button" className="w-full py-3.5 rounded-xl border border-slate-200 flex items-center justify-center gap-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors bg-white">
        <img src="https://www.google.com/favicon.ico" alt="" className="w-4 h-4" />
        Sign up with Google
      </button>
      <p className="text-center text-sm text-slate-500 mt-6">
        Already have an account?{" "}
        <button type="button" onClick={() => navigate("signin")} className="text-[#0d3b2e] font-bold hover:underline">Sign in</button>
      </p>
    </PageLayout>
  );

  // ─── FORGOT PASSWORD ────────────────────────────────────────────────────────
  if (screen === "forgot") return (
    <PageLayout>
      <Logo />
      <h1 className="text-3xl font-bold text-slate-900 mb-2">Forgot password?</h1>
      <p className="text-sm text-slate-400 mb-8">No worries. Enter your email and we'll send you a reset link.</p>
      <ErrorBanner msg={errorMsg} />
      <form onSubmit={handleForgotPassword} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-300 absolute left-3.5 top-3.5" />
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 outline-none focus:border-[#0d3b2e] focus:bg-white transition-all" />
          </div>
        </div>
        <button type="submit" className="w-full py-3.5 rounded-xl bg-[#0d3b2e] text-white font-bold text-sm hover:bg-emerald-900 transition-colors shadow-lg shadow-emerald-900/20">
          Send Reset Link
        </button>
      </form>
      <button type="button" onClick={() => navigate("signin")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mt-8">
        <ArrowLeft className="w-4 h-4" /> Back to sign in
      </button>
    </PageLayout>
  );

  // ─── RESET PASSWORD ─────────────────────────────────────────────────────────
  if (screen === "reset") return (
    <PageLayout>
      <Logo />
      <h1 className="text-3xl font-bold text-slate-900 mb-2">Reset your password</h1>
      <p className="text-sm text-slate-400 mb-8">Enter your new password below.</p>
      <ErrorBanner msg={errorMsg} />
      <form onSubmit={handleResetPassword} className="space-y-5">
        <PasswordInput label="New password" placeholder="Enter new password" value={newPassword} onChange={e => setNewPassword(e.target.value)} name="newPassword" />
        <PasswordInput label="Confirm new password" placeholder="Confirm new password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} name="confirmNewPassword" />
        <div className="space-y-2 py-1">
          {[
            { ok: checks.length, label: "At least 8 characters" },
            { ok: checks.number, label: "Includes a number" },
            { ok: checks.uppercase, label: "Includes an uppercase letter" },
          ].map(({ ok, label }) => (
            <div key={label} className="flex items-center gap-2 text-xs">
              <CheckCircle2 className={`w-4 h-4 transition-colors ${ok ? "text-[#0d3b2e]" : "text-slate-300"}`} />
              <span className={`transition-colors ${ok ? "text-[#0d3b2e]" : "text-slate-400"}`}>{label}</span>
            </div>
          ))}
        </div>
        <button type="submit" className="w-full py-3.5 rounded-xl bg-[#0d3b2e] text-white font-bold text-sm hover:bg-emerald-900 transition-colors shadow-lg shadow-emerald-900/20">
          Reset Password
        </button>
      </form>
      <button type="button" onClick={() => navigate("signin")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mt-8">
        <ArrowLeft className="w-4 h-4" /> Back to sign in
      </button>
    </PageLayout>
  );

  // ─── EMAIL VERIFICATION ─────────────────────────────────────────────────────
  if (screen === "verify") return (
    <PageLayout>
      <Logo />
      <div className="flex flex-col items-center text-center py-8">
        <div className="w-24 h-24 rounded-full bg-emerald-50 flex items-center justify-center mb-8 relative shadow-xl shadow-emerald-100">
          <Mail className="w-10 h-10 text-[#0d3b2e]" />
          <div className="absolute -top-1 -right-1 w-7 h-7 bg-[#0d3b2e] rounded-full flex items-center justify-center shadow-md">
            <Check className="w-4 h-4 text-white" strokeWidth={3} />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-slate-900 mb-3">Verify your email</h1>
        <p className="text-sm text-slate-400 mb-1">We've sent a verification link to</p>
        <p className="text-sm font-bold text-slate-800 mb-4">{email || "you@company.com"}</p>
        <p className="text-sm text-slate-400 mb-8 max-w-xs leading-relaxed">Please check your inbox and click the link to verify your email address.</p>
        <p className="text-sm text-slate-500">
          Didn't receive the email?{" "}
          <button type="button" className="text-[#0d3b2e] font-semibold hover:underline">Resend verification email</button>
        </p>
      </div>
      <button type="button" onClick={() => navigate("signin")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mx-auto mt-4">
        <ArrowLeft className="w-4 h-4" /> Back to sign in
      </button>
    </PageLayout>
  );

  return null;
}
