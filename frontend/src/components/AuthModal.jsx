import React, { useState } from "react";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  CheckCircle2,
  ArrowLeft,
  X,
  Check,
} from "lucide-react";
import { loginUser, signupUser } from "../services/api";

function Logo() {
  return (
    <div className="flex items-center gap-2 mb-6">
      <div className="w-8 h-8 rounded-full bg-[#0d3b2e] flex items-center justify-center">
        <div className="w-3.5 h-3.5 border-2 border-white rounded-full" />
      </div>
      <span className="font-bold text-slate-900 text-base tracking-tight">Donezo</span>
    </div>
  );
}

function PasswordInput({ placeholder, value, onChange, name }) {
  const [show, setShow] = useState(false);
  return (
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
  );
}

const ErrorBanner = ({ msg }) => msg ? (
  <div className="mb-4 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">{msg}</div>
) : null;

export function AuthModal({ isOpen, onClose, onAuthSuccess }) {
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

  if (!isOpen) return null;

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
      onClose();
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

  const Wrapper = ({ children }) => (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl relative p-8">
        <button onClick={onClose} className="absolute top-5 right-5 p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
          <X className="w-5 h-5" />
        </button>
        {children}
      </div>
    </div>
  );

  // ─── SIGN IN ────────────────────────────────────────────────────────────────
  if (screen === "signin") return (
    <Wrapper>
      <Logo />
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Welcome back</h1>
      <p className="text-sm text-slate-400 mb-6">Sign in to continue to your telemetry dashboard.</p>
      <ErrorBanner msg={errorMsg} />
      <form onSubmit={handleSignIn} className="space-y-4">
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
          <button type="button" onClick={() => navigate("forgot")} className="text-[#0d3b2e] font-semibold hover:underline">Forgot password?</button>
        </div>
        <button type="submit" disabled={loading}
          className="w-full py-3 rounded-xl bg-[#0d3b2e] text-white font-bold text-sm hover:bg-emerald-900 transition-colors disabled:opacity-60">
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-slate-100" /><span className="text-xs text-slate-400">or</span><div className="flex-1 h-px bg-slate-100" />
      </div>
      <button type="button" className="w-full py-3 rounded-xl border border-slate-200 flex items-center justify-center gap-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
        <img src="https://www.google.com/favicon.ico" alt="" className="w-4 h-4" />
        Continue with Google
      </button>
      <p className="text-center text-sm text-slate-500 mt-5">
        Don't have an account? <button type="button" onClick={() => navigate("signup")} className="text-[#0d3b2e] font-bold hover:underline">Sign up</button>
      </p>
    </Wrapper>
  );

  // ─── SIGN UP ────────────────────────────────────────────────────────────────
  if (screen === "signup") return (
    <Wrapper>
      <Logo />
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Create your account</h1>
      <p className="text-sm text-slate-400 mb-6">Get started with your telemetry engine.</p>
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
          className="w-full py-3 rounded-xl bg-[#0d3b2e] text-white font-bold text-sm hover:bg-emerald-900 transition-colors disabled:opacity-60">
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </form>
      <p className="text-center text-sm text-slate-500 mt-5">
        Already have an account? <button type="button" onClick={() => navigate("signin")} className="text-[#0d3b2e] font-bold hover:underline">Sign in</button>
      </p>
    </Wrapper>
  );

  // ─── FORGOT PASSWORD ────────────────────────────────────────────────────────
  if (screen === "forgot") return (
    <Wrapper>
      <Logo />
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Forgot password?</h1>
      <p className="text-sm text-slate-400 mb-6">No worries. Enter your email address and we'll send you a link to reset your password.</p>
      <ErrorBanner msg={errorMsg} />
      <form onSubmit={handleForgotPassword} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Email address</label>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-300 absolute left-3.5 top-3.5" />
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm text-slate-800 outline-none focus:border-[#0d3b2e] focus:bg-white transition-all" />
          </div>
        </div>
        <button type="submit" className="w-full py-3 rounded-xl bg-[#0d3b2e] text-white font-bold text-sm hover:bg-emerald-900 transition-colors">
          Send Reset Link
        </button>
      </form>
      <button type="button" onClick={() => navigate("signin")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mt-6">
        <ArrowLeft className="w-4 h-4" /> Back to sign in
      </button>
    </Wrapper>
  );

  // ─── RESET PASSWORD ─────────────────────────────────────────────────────────
  if (screen === "reset") return (
    <Wrapper>
      <Logo />
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Reset your password</h1>
      <p className="text-sm text-slate-400 mb-6">Enter your new password below.</p>
      <ErrorBanner msg={errorMsg} />
      <form onSubmit={handleResetPassword} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">New password</label>
          <PasswordInput placeholder="Enter new password" value={newPassword} onChange={e => setNewPassword(e.target.value)} name="newPassword" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Confirm new password</label>
          <PasswordInput placeholder="Confirm new password" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} name="confirmNewPassword" />
        </div>
        <div className="space-y-1.5 pt-1">
          {[
            { ok: checks.length, label: "At least 8 characters" },
            { ok: checks.number, label: "Includes a number" },
            { ok: checks.uppercase, label: "Includes an uppercase letter" },
          ].map(({ ok, label }) => (
            <div key={label} className="flex items-center gap-2 text-xs">
              <CheckCircle2 className={`w-4 h-4 ${ok ? "text-[#0d3b2e]" : "text-slate-300"}`} />
              <span className={ok ? "text-[#0d3b2e]" : "text-slate-400"}>{label}</span>
            </div>
          ))}
        </div>
        <button type="submit" className="w-full py-3 rounded-xl bg-[#0d3b2e] text-white font-bold text-sm hover:bg-emerald-900 transition-colors">
          Reset Password
        </button>
      </form>
      <button type="button" onClick={() => navigate("signin")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mt-6">
        <ArrowLeft className="w-4 h-4" /> Back to sign in
      </button>
    </Wrapper>
  );

  // ─── EMAIL VERIFICATION ─────────────────────────────────────────────────────
  if (screen === "verify") return (
    <Wrapper>
      <Logo />
      <div className="flex flex-col items-center text-center py-4">
        <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-6 relative">
          <Mail className="w-9 h-9 text-[#0d3b2e]" />
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-[#0d3b2e] rounded-full flex items-center justify-center">
            <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Verify your email</h1>
        <p className="text-sm text-slate-400 mb-1">We've sent a verification link to</p>
        <p className="text-sm font-bold text-slate-800 mb-4">{email || "you@company.com"}</p>
        <p className="text-sm text-slate-400 mb-6">Please check your inbox and click the link to verify your email address.</p>
        <p className="text-sm text-slate-500">
          Didn't receive the email?{" "}
          <button type="button" className="text-[#0d3b2e] font-semibold hover:underline">Resend verification email</button>
        </p>
      </div>
      <button type="button" onClick={() => navigate("signin")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mt-4">
        <ArrowLeft className="w-4 h-4" /> Back to sign in
      </button>
    </Wrapper>
  );

  return null;
}
