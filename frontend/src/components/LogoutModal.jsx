import React from "react";
import { LogIn } from "lucide-react";

export function LogoutModal({ isOpen, onClose, onConfirm }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-xs shadow-2xl overflow-hidden">
        <div className="px-8 pt-10 pb-8 text-center">
          
          {/* Icon */}
          <div className="w-16 h-16 rounded-full bg-ink-50 flex items-center justify-center mx-auto mb-6">
            <LogIn className="w-7 h-7 text-[#1c1c1f]" style={{ transform: 'scaleX(-1)' }} />
          </div>

          <h2 className="text-2xl font-bold text-slate-900 mb-2">Sign Out?</h2>
          <p className="text-sm text-slate-400 mb-8">
            You'll need to log in again to continue.
          </p>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 px-4 rounded-2xl font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="flex-1 py-3.5 px-4 rounded-2xl font-semibold text-white bg-[#1c1c1f] hover:bg-ink-900 transition-colors text-sm"
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
