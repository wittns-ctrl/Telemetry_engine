import React, { useState } from "react";
import {
  User,
  Lock,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  X,
} from "lucide-react";
import { loginUser, signupUser } from "../services/api";

export function AuthModal({ isOpen, onClose, onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      if (isLogin) {
        const tokenData = await loginUser(email, password);
        localStorage.setItem("telemetry_jwt_token", tokenData.access_token);
        setSuccessMsg("Authentication successful!");
        setTimeout(() => {
          onAuthSuccess();
          onClose();
        }, 500);
      } else {
        await signupUser(email, password);
        setSuccessMsg("Account created! Logging in...");
        const tokenData = await loginUser(email, password);
        localStorage.setItem("telemetry_jwt_token", tokenData.access_token);
        setTimeout(() => {
          onAuthSuccess();
          onClose();
        }, 600);
      }
    } catch (err) {
      setErrorMsg(err.message || "Authentication error");
    } finally {
      setLoading(false);
    }
  };

  const fillDemoCreds = () => {
    setEmail("admin@telemetry-engine.io");
    setPassword("TelemetrySecured123!");
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 font-sans">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 shadow-2xl relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#0b4d36] border border-emerald-100 flex items-center justify-center mx-auto mb-3">
            <KeyRound className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            {isLogin
              ? "Sign In to Telemetry Engine"
              : "Register Engine Account"}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            JWT Token Authentication for Protected API Ingestion
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Email Address
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3.5 py-2 text-xs text-slate-800 outline-none focus:bg-white focus:border-[#0b4d36] transition-all font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-3.5 py-2 text-xs text-slate-800 outline-none focus:bg-white focus:border-[#0b4d36] transition-all font-mono"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-full bg-[#0b4d36] hover:bg-[#073924] text-white font-bold text-xs shadow-xs transition-all disabled:opacity-50"
          >
            {loading
              ? "Authenticating..."
              : isLogin
                ? "Sign In & Get Token"
                : "Create Account"}
          </button>
        </form>

        {/* Demo Creds Helper */}
        <div className="mt-4 pt-4 border-t border-slate-100 text-center">
          <button
            type="button"
            onClick={fillDemoCreds}
            className="text-[11px] text-[#0b4d36] hover:underline font-mono font-bold"
          >
            Click here to fill demo admin credentials
          </button>

          <div className="mt-3 text-xs text-slate-500">
            {isLogin ? "Don't have an account?" : "Already registered?"}
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setErrorMsg(null);
              }}
              className="ml-1 text-slate-900 font-extrabold hover:underline"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
