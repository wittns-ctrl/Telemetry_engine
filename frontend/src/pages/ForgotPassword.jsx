import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, ArrowLeft } from "lucide-react";
import { AuthPageLayout, ErrorBanner, SuccessBanner } from "../components/AuthLayout";

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
      // TODO: Replace with actual API call
      // await forgotPassword(email);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setSuccessMsg("If an account exists with this email, a password reset link has been sent.");
      setEmail("");
    } catch (err) {
      setErrorMsg(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout>
      <div className="text-center mb-5">
        <h1 className="text-[24px] font-bold text-slate-900 mb-1.5">Forgot Password</h1>
        <p className="text-xs text-slate-500">
          Enter your email address and we'll send you a link to reset your password.
        </p>
      </div>
      
      <ErrorBanner msg={errorMsg} />
      <SuccessBanner msg={successMsg} />
      
      <form onSubmit={handleSubmit} className="space-y-3">
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
        
        <button 
          type="submit" 
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-[#003D30] text-white font-bold text-sm hover:bg-[#004d3f] transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-[#003D30]/20 active:scale-[0.98]"
        >
          {loading ? "Sending..." : "Send Reset Link"}
        </button>
      </form>
      
      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-slate-200" />
        <span className="text-[11px] text-slate-400">or</span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>
      
      <button 
        type="button"
        onClick={() => navigate("/signin")}
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
        <button 
          type="button" 
          onClick={() => navigate("/signin")}
          className="flex items-center justify-center gap-1.5 text-[#003D30] font-semibold hover:underline mx-auto"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to sign in
        </button>
      </p>
    </AuthPageLayout>
  );
}
