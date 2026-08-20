import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { AuthPageLayout, ErrorBanner } from "./AuthLayout";

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

// ── Main Auth Page ─────────────────────────────────────────────────────────────
export function AuthPage({ onAuthSuccess }) {
  const navigate = useNavigate();
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const clearError = () => setErrorMsg(null);
  const navigateScreen = (s) => { clearError(); setScreen(s); };

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
    
    // Validation
    if (!fullName.trim()) return setErrorMsg("Please enter your full name.");
    if (!email.trim()) return setErrorMsg("Please enter your email address.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setErrorMsg("Please enter a valid email address.");
    if (!password) return setErrorMsg("Please enter a password.");
    if (password.length < 8) return setErrorMsg("Password must be at least 8 characters.");
    if (password !== confirmPassword) return setErrorMsg("Passwords do not match.");
    
    setLoading(true); clearError();
    try {
      await signupUser(email, password);
      const tokenData = await loginUser(email, password);
      localStorage.setItem("telemetry_jwt_token", tokenData.access_token);
      navigate("/verify-email");
    } catch (err) {
      setErrorMsg(err.message || "Could not create account.");
    } finally { setLoading(false); }
  };

  const handleGoogleSignup = () => {
    // Placeholder for Google signup
    setErrorMsg("Google signup is not yet implemented.");
  };

  const handleForgotPassword = () => {
    navigate("/forgot-password");
  };

  const handleResetPassword = (e) => {
    e.preventDefault();
    if (newPassword !== confirmNewPassword) return setErrorMsg("Passwords do not match.");
    if (!checks.length || !checks.number || !checks.uppercase) return setErrorMsg("Password does not meet all requirements.");
    navigate("signin");
  };

  // ─── SIGN IN ────────────────────────────────────────────────────────────────
  if (screen === "signin") return (
    <AuthPageLayout>
      <div className="text-center mb-5">
        <h1 className="text-[24px] font-bold text-slate-900 mb-1.5">Sign In</h1>
        <p className="text-xs text-slate-500">Welcome back! Please enter your details.</p>
      </div>
      <ErrorBanner msg={errorMsg} />
      <form onSubmit={handleSignIn} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">Email address</label>
          <div className="relative">
            <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type="email" 
              required 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="you@company.com"
              className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-[#003D30] focus:ring-1 focus:ring-[#003D30]/20 transition-all"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">Password</label>
          <div className="relative">
            <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type={showPassword ? "text" : "password"}
              required 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              placeholder="Enter your password"
              className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-9 py-2.5 text-sm text-slate-800 outline-none focus:border-[#003D30] focus:ring-1 focus:ring-[#003D30]/20 transition-all"
            />
            <button 
              type="button" 
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600" onClick={() => setRememberMe(!rememberMe)}>
            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${rememberMe ? "bg-[#003D30] border-[#003D30]" : "border-slate-300 bg-white"}`}>
              {rememberMe && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
            </div>
            <span className="select-none">Remember me</span>
          </label>
          <button type="button" onClick={handleForgotPassword} className="text-xs text-[#003D30] font-semibold hover:underline">Forgot password?</button>
        </div>
        <button 
          type="submit" 
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-[#003D30] text-white font-bold text-sm hover:bg-[#004d3f] transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-[#003D30]/20 active:scale-[0.98]"
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-[11px] text-slate-400">or</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      <button 
        type="button" 
        className="w-full py-2.5 rounded-lg border border-slate-200 flex items-center justify-center gap-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors bg-white"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign in with Google
      </button>
      <p className="text-center text-xs text-slate-500 mt-4">
        Don't have an account?{" "}
        <button 
          type="button" 
          onClick={() => navigateScreen("signup")} 
          className="text-[#003D30] font-semibold hover:underline"
        >
          Sign up
        </button>
      </p>
    </AuthPageLayout>
  );

  // ─── SIGN UP ────────────────────────────────────────────────────────────────
  if (screen === "signup") return (
    <AuthPageLayout>
      <div className="text-center mb-5">
        <h1 className="text-[24px] font-bold text-slate-900 mb-1.5">Sign Up</h1>
        <p className="text-xs text-slate-500">Create your account to get started</p>
      </div>
      <ErrorBanner msg={errorMsg} />
      <form onSubmit={handleSignUp} className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">Full name</label>
          <div className="relative">
            <User className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              required 
              value={fullName} 
              onChange={e => setFullName(e.target.value)} 
              placeholder="Enter your full name"
              className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-[#003D30] focus:ring-1 focus:ring-[#003D30]/20 transition-all"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">Email address</label>
          <div className="relative">
            <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type="email" 
              required 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="you@company.com"
              className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-[#003D30] focus:ring-1 focus:ring-[#003D30]/20 transition-all"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">Password</label>
          <div className="relative">
            <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type={showPassword ? "text" : "password"}
              required 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              placeholder="Create a password"
              className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-9 py-2.5 text-sm text-slate-800 outline-none focus:border-[#003D30] focus:ring-1 focus:ring-[#003D30]/20 transition-all"
            />
            <button 
              type="button" 
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">Password must be at least <span className="text-[#003D30] font-semibold">8 characters</span></p>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-700 mb-1.5">Confirm password</label>
          <div className="relative">
            <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type={showConfirmPassword ? "text" : "password"}
              required 
              value={confirmPassword} 
              onChange={e => setConfirmPassword(e.target.value)} 
              placeholder="Confirm your password"
              className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-9 py-2.5 text-sm text-slate-800 outline-none focus:border-[#003D30] focus:ring-1 focus:ring-[#003D30]/20 transition-all"
            />
            <button 
              type="button" 
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showConfirmPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
        <button 
          type="submit" 
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-[#003D30] text-white font-bold text-sm hover:bg-[#004d3f] transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-[#003D30]/20 active:scale-[0.98]"
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </form>
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-[11px] text-slate-400">or</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      <button 
        type="button" 
        onClick={handleGoogleSignup}
        className="w-full py-2.5 rounded-lg border border-slate-200 flex items-center justify-center gap-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors bg-white"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign up with Google
      </button>
      <p className="text-center text-xs text-slate-500 mt-4">
        Already have an account?{" "}
        <button 
          type="button" 
          onClick={() => navigateScreen("signin")} 
          className="text-[#003D30] font-semibold hover:underline"
        >
          Sign in
        </button>
      </p>
    </AuthPageLayout>
  );

  // ─── FORGOT PASSWORD ────────────────────────────────────────────────────────
  if (screen === "forgot") return (
    <AuthPageLayout>
      <div className="text-center mb-5">
        <h1 className="text-[24px] font-bold text-slate-900 mb-1.5">Forgot password?</h1>
        <p className="text-xs text-slate-500">No worries. Enter your email and we'll send you a reset link.</p>
      </div>
      <ErrorBanner msg={errorMsg} />
      <form onSubmit={handleForgotPassword} className="space-y-3">
        <div>
          <div className="relative">
            <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type="email" 
              required 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="Email address"
              className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-[#003D30] focus:ring-1 focus:ring-[#003D30]/20 transition-all"
            />
          </div>
        </div>
        <button type="submit" className="w-full py-2.5 rounded-lg bg-[#003D30] text-white font-bold text-sm hover:bg-[#004d3f] transition-colors shadow-md shadow-[#003D30]/20">
          Send Reset Link
        </button>
      </form>
      <button type="button" onClick={() => navigateScreen("signin")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mt-8">
        <ArrowLeft className="w-4 h-4" /> Back to sign in
      </button>
    </AuthPageLayout>
  );

  // ─── RESET PASSWORD ─────────────────────────────────────────────────────────
  if (screen === "reset") return (
    <AuthPageLayout>
      <div className="text-center mb-5">
        <h1 className="text-[24px] font-bold text-slate-900 mb-1.5">Reset your password</h1>
        <p className="text-xs text-slate-500">Enter your new password below.</p>
      </div>
      <ErrorBanner msg={errorMsg} />
      <form onSubmit={handleResetPassword} className="space-y-3">
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
        <button type="submit" className="w-full py-2.5 rounded-lg bg-[#003D30] text-white font-bold text-sm hover:bg-[#004d3f] transition-colors shadow-md shadow-[#003D30]/20">
          Reset Password
        </button>
      </form>
      <button type="button" onClick={() => navigateScreen("signin")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mt-8">
        <ArrowLeft className="w-4 h-4" /> Back to sign in
      </button>
    </AuthPageLayout>
  );

  // ─── EMAIL VERIFICATION ─────────────────────────────────────────────────────
  if (screen === "verify") return (
    <AuthPageLayout>
      <div className="text-center mb-5">
        <h1 className="text-[24px] font-bold text-slate-900 mb-1.5">Verify your email</h1>
        <p className="text-xs text-slate-500">We've sent a verification link to your email.</p>
      </div>
      <ErrorBanner msg={errorMsg} />
      <div className="flex flex-col items-center text-center py-8">
        <div className="w-24 h-24 rounded-full bg-emerald-50 flex items-center justify-center mb-8 relative shadow-xl shadow-emerald-100">
          <Mail className="w-10 h-10 text-[#0d3b2e]" />
          <div className="absolute -top-1 -right-1 w-7 h-7 bg-[#0d3b2e] rounded-full flex items-center justify-center shadow-md">
            <Check className="w-4 h-4 text-white" strokeWidth={3} />
          </div>
        </div>
        <p className="text-sm text-slate-400 mb-1">Please check your inbox and click the link to verify your email address.</p>
        <p className="text-sm font-bold text-slate-800 mb-4">{email || "you@company.com"}</p>
        <p className="text-sm text-slate-500">
          Didn't receive the email?{" "}
          <button type="button" className="text-[#0d3b2e] font-semibold hover:underline">Resend verification email</button>
        </p>
      </div>
      <button type="button" onClick={() => navigateScreen("signin")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mx-auto mt-4">
        <ArrowLeft className="w-4 h-4" /> Back to sign in
      </button>
    </AuthPageLayout>
  );

  return null;
}
