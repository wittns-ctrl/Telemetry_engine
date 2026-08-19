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

      {/* Mini dashboard card */}
      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-6 w-full max-w-sm mb-8 relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="space-y-1.5">
            <div className="w-24 h-2 bg-white/30 rounded-full" />
            <div className="w-16 h-2 bg-white/20 rounded-full" />
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-400/30 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white/70 rounded-md" />
          </div>
        </div>
        <div className="flex items-end gap-1.5 h-20 mt-4">
          {[35, 55, 42, 70, 48, 85, 58, 72, 50, 90].map((h, i) => (
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
        <div className="flex gap-2 mt-4">
          <div className="flex-1 h-1.5 bg-emerald-400/50 rounded-full" />
          <div className="flex-1 h-1.5 bg-white/20 rounded-full" />
          <div className="flex-1 h-1.5 bg-white/20 rounded-full" />
        </div>
      </div>

      {/* Stats pills */}
      <div className="flex gap-3 mb-8 relative z-10">
        <div className="bg-white/10 border border-white/20 rounded-2xl px-4 py-2.5 text-center">
          <div className="text-emerald-300 font-bold text-lg">98.2%</div>
          <div className="text-white/60 text-xs">Uptime</div>
        </div>
        <div className="bg-white/10 border border-white/20 rounded-2xl px-4 py-2.5 text-center">
          <div className="text-emerald-300 font-bold text-lg">4.2k</div>
          <div className="text-white/60 text-xs">Events/s</div>
        </div>
        <div className="bg-white/10 border border-white/20 rounded-2xl px-4 py-2.5 text-center">
          <div className="text-emerald-300 font-bold text-lg">12ms</div>
          <div className="text-white/60 text-xs">Latency</div>
        </div>
      </div>

      <div className="text-center relative z-10">
        <h2 className="text-white font-bold text-2xl mb-3 leading-tight">
          Real-time telemetry.<br />Smarter decisions.
        </h2>
        <p className="text-white/60 text-sm leading-relaxed max-w-xs">
          Monitor, ingest, and analyze your telemetry streams in real time with powerful dashboards.
        </p>
      </div>

      {/* Dot indicators */}
      <div className="flex gap-2 mt-8 relative z-10">
        <div className="w-6 h-2 rounded-full bg-emerald-400" />
        <div className="w-2 h-2 rounded-full bg-white/30" />
        <div className="w-2 h-2 rounded-full bg-white/30" />
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
      {/* Left form column */}
      <div className="flex flex-col justify-center flex-1 max-w-lg px-8 md:px-16 py-12 bg-white min-h-screen">
        {children}
      </div>
      <RightPanel />
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
      <h1 className="text-3xl font-bold text-slate-900 mb-2">Create your account</h1>
      <p className="text-sm text-slate-400 mb-8">Get started with your telemetry engine.</p>
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
        <PasswordInput label="Password" placeholder="Create a strong password" value={password} onChange={e => setPassword(e.target.value)} name="password" />
        <PasswordInput label="Confirm password" placeholder="Confirm your password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} name="confirmPassword" />
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
