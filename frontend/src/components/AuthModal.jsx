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
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 flex items-center justify-center mx-auto mb-3">
            <KeyRound className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            {isLogin
              ? "Sign In to Telemetry Engine"
              : "Register Engine Account"}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            JWT Token Authentication for Protected API Ingestion
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Email Address
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500 transition-colors font-mono"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-50"
          >
            {loading
              ? "Authenticating..."
              : isLogin
                ? "Sign In & Get Token"
                : "Create Account"}
          </button>
        </form>

        {/* Demo Creds Helper */}
        <div className="mt-4 pt-4 border-t border-slate-800 text-center">
          <button
            type="button"
            onClick={fillDemoCreds}
            className="text-[11px] text-indigo-400 hover:underline font-mono"
          >
            Click here to fill demo admin credentials
          </button>

          <div className="mt-3 text-xs text-slate-400">
            {isLogin ? "Don't have an account?" : "Already registered?"}
            <button
              onClick={() => {
                setIsLogin(!isLogin);
                setErrorMsg(null);
              }}
              className="ml-1 text-white font-semibold hover:underline"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
