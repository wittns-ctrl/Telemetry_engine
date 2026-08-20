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
  Activity,
  BarChart3,
  Bell,
  Cpu,
  Server,
  Database,
  Cloud,
} from "lucide-react";
import { loginUser, signupUser } from "../services/api";

// ── Left Brand Panel with Telemetry Illustration ─────────────────────────────
function BrandPanel() {
  return (
    <div className="hidden lg:flex flex-col bg-[#003D30] relative overflow-hidden w-1/2 rounded-l-3xl">
      {/* Background decorative elements */}
      <div className="absolute w-96 h-96 rounded-full bg-white/5 -top-20 -right-20" />
      <div className="absolute w-64 h-64 rounded-full bg-white/5 bottom-10 -left-16" />
      <div className="absolute w-40 h-40 rounded-full bg-emerald-400/10 top-1/2 right-8" />

      {/* Logo positioned at top-left */}
      <div className="flex items-center gap-2.5 mt-8 ml-8 relative z-10">
        <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
          <div className="w-4 h-4 border-2 border-white rounded-full" />
        </div>
        <span className="font-bold text-white text-lg tracking-tight">Donezo</span>
      </div>

      {/* Main heading and description */}
      <div className="mt-12 ml-8 mr-8 relative z-10">
        <h2 className="text-white font-bold text-[32px] leading-tight mb-4">
          Real-time telemetry.<br />Smarter decisions.
        </h2>
        <p className="text-white/70 text-base leading-relaxed max-w-sm">
          Monitor, ingest, and analyze your telemetry<br />streams in real time.
        </p>
      </div>

      {/* Telemetry Illustration */}
      <div className="flex-1 flex items-center justify-center p-8 relative z-10">
        <TelemetryIllustration />
      </div>

      {/* Feature highlights at bottom */}
      <div className="grid grid-cols-3 gap-4 p-8 relative z-10">
        <FeatureItem 
          icon={<Activity className="w-5 h-5" />} 
          title="Real-time Monitoring" 
          description="Track everything as it happens." 
        />
        <FeatureItem 
          icon={<BarChart3 className="w-5 h-5" />} 
          title="Powerful Analytics" 
          description="Visualize and analyze data." 
        />
        <FeatureItem 
          icon={<Bell className="w-5 h-5" />} 
          title="Instant Alerts" 
          description="Get notified instantly." 
        />
      </div>
    </div>
  );
}

// ── Mobile Brand Header (shown on mobile/tablet) ───────────────────────────────
function MobileBrandHeader() {
  return (
    <div className="lg:hidden flex flex-col items-center justify-center bg-[#003D30] p-6 rounded-t-3xl">
      <div className="flex items-center gap-2.5 mb-4">
        <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
          <div className="w-3.5 h-3.5 border-2 border-white rounded-full" />
        </div>
        <span className="font-bold text-white text-base tracking-tight">Donezo</span>
      </div>
      <h2 className="text-white font-bold text-xl text-center leading-tight mb-2">
        Real-time telemetry.<br />Smarter decisions.
      </h2>
      <p className="text-white/70 text-sm text-center leading-relaxed">
        Monitor, ingest, and analyze your telemetry streams in real time.
      </p>
    </div>
  );
}

// ── Telemetry Illustration Component ────────────────────────────────────────
function TelemetryIllustration() {
  return (
    <div className="relative w-full max-w-lg">
      {/* Connection lines */}
      <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 0 }}>
        {/* Line from left sensor to dashboard */}
        <line x1="10%" y1="50%" x2="30%" y2="50%" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeDasharray="4,4" />
        {/* Line from right device to dashboard */}
        <line x1="70%" y1="30%" x2="50%" y2="50%" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeDasharray="4,4" />
        {/* Line from database to dashboard */}
        <line x1="15%" y1="75%" x2="35%" y2="60%" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeDasharray="4,4" />
        {/* Line from cloud to dashboard */}
        <line x1="85%" y1="70%" x2="65%" y2="55%" stroke="rgba(255,255,255,0.2)" strokeWidth="2" strokeDasharray="4,4" />
      </svg>

      {/* Left sensor device */}
      <div className="absolute left-0 top-1/2 -translate-y-1/2" style={{ zIndex: 1 }}>
        <div className="w-16 h-16 bg-white/10 border border-white/20 rounded-2xl flex items-center justify-center">
          <div className="w-8 h-8 bg-emerald-400/30 rounded-lg flex items-center justify-center">
            <Cpu className="w-5 h-5 text-emerald-300" />
          </div>
        </div>
      </div>

      {/* Right connected device with WiFi signal */}
      <div className="absolute right-0 top-[20%]" style={{ zIndex: 1 }}>
        <div className="relative">
          {/* WiFi signal lines */}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 space-y-1">
            <div className="w-6 h-1 bg-white/30 rounded" />
            <div className="w-4 h-1 bg-white/40 rounded ml-1" />
            <div className="w-2 h-1 bg-white/50 rounded ml-2" />
          </div>
          <div className="w-16 h-16 bg-white/10 border border-white/20 rounded-2xl flex items-center justify-center">
            <div className="w-8 h-8 bg-emerald-400/30 rounded-lg flex items-center justify-center">
              <Server className="w-5 h-5 text-emerald-300" />
            </div>
          </div>
        </div>
      </div>

      {/* Database cylinder (lower left) */}
      <div className="absolute left-[5%] bottom-[15%]" style={{ zIndex: 1 }}>
        <div className="w-14 h-14 bg-white/10 border border-white/20 rounded-2xl flex items-center justify-center">
          <Database className="w-6 h-6 text-emerald-300" />
        </div>
      </div>

      {/* Cloud icon (lower right) */}
      <div className="absolute right-[5%] bottom-[20%]" style={{ zIndex: 1 }}>
        <div className="w-14 h-14 bg-white/10 border border-white/20 rounded-2xl flex items-center justify-center">
          <Cloud className="w-6 h-6 text-emerald-300" />
        </div>
      </div>

      {/* Central dashboard panel */}
      <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-3xl p-6 relative" style={{ zIndex: 2 }}>
        {/* Dashboard header with indicators */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-red-400/50" />
            <div className="w-3 h-3 rounded-full bg-yellow-400/50" />
            <div className="w-3 h-3 rounded-full bg-green-400/50" />
          </div>
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded bg-white/10 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-white/50" />
            </div>
          </div>
        </div>

        {/* Dashboard content grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Left side - data indicators */}
          <div className="space-y-3">
            <div className="bg-white/5 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                <div className="text-white/60 text-xs">Status</div>
              </div>
              <div className="text-white font-semibold text-sm">Active</div>
            </div>
            <div className="bg-white/5 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-blue-400" />
                <div className="text-white/60 text-xs">Connections</div>
              </div>
              <div className="text-white font-semibold text-sm">247</div>
            </div>
          </div>

          {/* Right side - uptime gauge */}
          <div className="bg-white/5 rounded-xl p-3 flex flex-col items-center justify-center">
            <div className="relative w-16 h-16 mb-2">
              <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="2.5"
                />
                <path
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="2.5"
                  strokeDasharray="98.2, 100"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white font-bold text-xs">98.2%</span>
              </div>
            </div>
            <div className="text-white/60 text-xs">Uptime</div>
          </div>
        </div>

        {/* Line chart */}
        <div className="mt-4 bg-white/5 rounded-xl p-3">
          <div className="flex items-end gap-1 h-12">
            {[25, 40, 35, 55, 45, 70, 60, 80, 50, 90, 65, 85].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-sm transition-all"
                style={{
                  height: `${h}%`,
                  backgroundColor: i === 11 ? "rgba(52,211,153,0.9)" : "rgba(255,255,255,0.15)",
                }}
              />
            ))}
          </div>
          <div className="text-white/60 text-xs mt-2 text-center">Telemetry Stream</div>
        </div>

        {/* Bottom row - bar chart and list */}
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div className="bg-white/5 rounded-xl p-3">
            <div className="flex items-end gap-1 h-8">
              {[40, 60, 35, 80, 55, 70, 45, 90].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-t-sm"
                  style={{
                    height: `${h}%`,
                    backgroundColor: i === 7 ? "rgba(52,211,153,0.8)" : "rgba(255,255,255,0.15)",
                  }}
                />
              ))}
            </div>
            <div className="text-white/60 text-xs mt-1 text-center">Metrics</div>
          </div>
          <div className="bg-white/5 rounded-xl p-3">
            <div className="space-y-1.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <div className="h-1.5 bg-white/20 rounded flex-1" style={{ width: `${60 + i * 10}%` }} />
                </div>
              ))}
            </div>
            <div className="text-white/60 text-xs mt-1 text-center">Events</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Feature Item Component ───────────────────────────────────────────────────
function FeatureItem({ icon, title, description }) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="w-10 h-10 rounded-xl bg-emerald-400/20 flex items-center justify-center mb-2">
        <div className="text-emerald-300">{icon}</div>
      </div>
      <div className="text-white font-semibold text-xs mb-1">{title}</div>
      <div className="text-white/50 text-[10px] leading-tight">{description}</div>
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

// ── Page wrapper with centered card layout ────────────────────────────────────
function PageLayout({ children }) {
  return (
    <div className="min-h-screen flex items-center justify-center font-sans bg-[#e8ecef] p-4 md:p-8">
      <div className="w-full max-w-6xl h-[90vh] md:h-auto min-h-[600px] bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col lg:flex-row">
        {/* Mobile brand header */}
        <MobileBrandHeader />
        {/* Left brand panel (desktop only) */}
        <BrandPanel />
        {/* Right form panel */}
        <div className="flex-1 bg-white/95 backdrop-blur-sm rounded-r-none lg:rounded-r-3xl flex flex-col justify-center px-6 md:px-12 lg:px-16 py-8 lg:py-12">
          {children}
        </div>
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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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
      navigate("verify");
    } catch (err) {
      setErrorMsg(err.message || "Could not create account.");
    } finally { setLoading(false); }
  };

  const handleGoogleSignup = () => {
    // Placeholder for Google signup
    setErrorMsg("Google signup is not yet implemented.");
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
      <div className="text-center mb-8">
        <h1 className="text-[28px] font-bold text-slate-900 mb-2">Sign Up</h1>
        <p className="text-sm text-slate-500">Create your account to get started</p>
      </div>
      <ErrorBanner msg={errorMsg} />
      <form onSubmit={handleSignUp} className="space-y-4">
        <div>
          <div className="relative">
            <User className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input 
              type="text" 
              required 
              value={fullName} 
              onChange={e => setFullName(e.target.value)} 
              placeholder="Full name"
              className="w-full bg-white border border-slate-200 rounded-xl pl-12 pr-4 py-3.5 text-sm text-slate-800 outline-none focus:border-[#003D30] focus:ring-1 focus:ring-[#003D30]/20 transition-all"
            />
          </div>
        </div>
        <div>
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input 
              type="email" 
              required 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="Email address"
              className="w-full bg-white border border-slate-200 rounded-xl pl-12 pr-4 py-3.5 text-sm text-slate-800 outline-none focus:border-[#003D30] focus:ring-1 focus:ring-[#003D30]/20 transition-all"
            />
          </div>
        </div>
        <div>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input 
              type={showPassword ? "text" : "password"}
              required 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              placeholder="Password"
              className="w-full bg-white border border-slate-200 rounded-xl pl-12 pr-12 py-3.5 text-sm text-slate-800 outline-none focus:border-[#003D30] focus:ring-1 focus:ring-[#003D30]/20 transition-all"
            />
            <button 
              type="button" 
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-2">Password must be at least <span className="text-[#003D30] font-semibold">8 characters</span></p>
        </div>
        <div>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
            <input 
              type={showConfirmPassword ? "text" : "password"}
              required 
              value={confirmPassword} 
              onChange={e => setConfirmPassword(e.target.value)} 
              placeholder="Confirm password"
              className="w-full bg-white border border-slate-200 rounded-xl pl-12 pr-12 py-3.5 text-sm text-slate-800 outline-none focus:border-[#003D30] focus:ring-1 focus:ring-[#003D30]/20 transition-all"
            />
            <button 
              type="button" 
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <button 
          type="submit" 
          disabled={loading}
          className="w-full py-3.5 rounded-xl bg-[#003D30] text-white font-bold text-sm hover:bg-[#004d3f] transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-lg shadow-[#003D30]/20 active:scale-[0.98]"
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </form>
      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-xs text-slate-400">or</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      <button 
        type="button" 
        onClick={handleGoogleSignup}
        className="w-full py-3.5 rounded-xl border border-slate-200 flex items-center justify-center gap-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors bg-white"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        Sign up with Google
      </button>
      <p className="text-center text-sm text-slate-500 mt-6">
        Already have an account?{" "}
        <button 
          type="button" 
          onClick={() => navigate("signin")} 
          className="text-[#003D30] font-semibold hover:underline"
        >
          Sign in
        </button>
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
