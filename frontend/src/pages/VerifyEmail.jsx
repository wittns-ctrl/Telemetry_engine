import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Mail, ArrowLeft, RefreshCw, CheckCircle2 } from "lucide-react";
import { AuthPageLayout, ErrorBanner, SuccessBanner } from "../components/AuthLayout";
import { verifyEmail, resendVerification } from "../services/api";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const emailParam = searchParams.get("email");

  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(Boolean(token));
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  
  const userEmail = emailParam || "your registered email address";

  useEffect(() => {
    if (token) {
      setVerifying(true);
      verifyEmail(token)
        .then((res) => {
          setSuccessMsg(res.message || "Email verified successfully! You can now sign in.");
          setErrorMsg(null);
        })
        .catch((err) => {
          setErrorMsg(err.message || "Verification link is invalid or has expired.");
        })
        .finally(() => {
          setVerifying(false);
        });
    }
  }, [token]);

  const handleResend = async () => {
    if (!emailParam) {
      setErrorMsg("Please provide your email address to resend verification.");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    
    try {
      const res = await resendVerification(emailParam);
      setSuccessMsg(res.message || "Verification email has been resent. Please check your inbox.");
    } catch (err) {
      setErrorMsg(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthPageLayout>
      <div className="flex flex-col items-center mb-5">
        {/* Email verification illustration */}
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <Mail className="w-10 h-10 text-[#003D30]" />
        </div>
        
        <h1 className="text-[24px] font-bold text-slate-900 mb-1.5 text-center">Verify your email</h1>
        <p className="text-xs text-slate-500 text-center max-w-xs">
          We've sent a verification link to <span className="font-semibold text-slate-700">{userEmail}</span>. 
          Please check your inbox and click the link to verify your account.
        </p>
      </div>
      
      <ErrorBanner msg={errorMsg} />
      <SuccessBanner msg={successMsg} />
      
      <div className="space-y-3 w-full">
        <button 
          type="button"
          onClick={handleResend}
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-[#003D30] text-white font-bold text-sm hover:bg-[#004d3f] transition-colors disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-[#003D30]/20 active:scale-[0.98] flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4" />
              Resend verification email
            </>
          )}
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
      </div>
      
      <div className="mt-6 text-center">
        <p className="text-[11px] text-slate-400">
          Didn't receive the email? Check your spam folder or request a new link.
        </p>
      </div>
    </AuthPageLayout>
  );
}
