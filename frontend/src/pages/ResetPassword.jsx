import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lock, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { AuthPageLayout, ErrorBanner, SuccessBanner } from "../components/AuthLayout";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!newPassword) return setErrorMsg("Please enter a new password.");
    if (newPassword.length < 8) return setErrorMsg("Password must be at least 8 characters.");
    if (newPassword !== confirmPassword) return setErrorMsg("Passwords do not match.");
    
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    
    try {
      // TODO: Replace with actual API call
      // await resetPassword(token, newPassword);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setSuccessMsg("Your password has been successfully reset. You can now sign in with your new password.");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setErrorMsg(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout>
      <div className="text-center mb-5">
        <h1 className="text-[24px] font-bold text-slate-900 mb-1.5">Reset Password</h1>
        <p className="text-xs text-slate-500">
          Enter your new password below to reset your account.
        </p>
      </div>
      
      <ErrorBanner msg={errorMsg} />
      <SuccessBanner msg={successMsg} />
      
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <div className="relative">
            <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type={showPassword ? "text" : "password"}
              required 
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="New password"
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
          <div className="relative">
            <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type={showConfirmPassword ? "text" : "password"}
              required 
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
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
          {loading ? "Resetting..." : "Reset Password"}
        </button>
      </form>
      
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
