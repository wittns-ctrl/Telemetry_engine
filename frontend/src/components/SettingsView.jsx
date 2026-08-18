import React, { useState } from "react";
import {
  User,
  SlidersHorizontal,
  Bell,
  Key,
  Pencil,
  Thermometer,
  Cpu,
  Radio,
  Save,
  Eye,
  EyeOff,
  Copy,
  Check,
  FileText,
} from "lucide-react";

export function SettingsView({ thresholds, onUpdateThresholds }) {
  // Threshold state
  const [tempMax, setTempMax] = useState(thresholds?.temperature?.max || 100);
  const [cpuMax, setCpuMax] = useState(thresholds?.cpu?.max || 90);
  const [netMax, setNetMax] = useState(thresholds?.network?.max || 1000);
  const [thresholdSaved, setThresholdSaved] = useState(false);

  // Notification state
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [webhookAlerts, setWebhookAlerts] = useState(true);
  const [emailAddress, setEmailAddress] = useState("mugisha@example.com");
  const [webhookUrl, setWebhookUrl] = useState("https://httpbin.org/post");
  const [notificationSaved, setNotificationSaved] = useState(false);

  // Token state
  const [showToken, setShowToken] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [rawToken, setRawToken] = useState(
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NmI1YTlk...",
  );

  const handleSaveThresholds = (e) => {
    e.preventDefault();
    if (onUpdateThresholds) {
      onUpdateThresholds({
        temperature: { max: Number(tempMax) },
        cpu: { max: Number(cpuMax) },
        network: { max: Number(netMax) },
      });
    }
    setThresholdSaved(true);
    setTimeout(() => setThresholdSaved(false), 2000);
  };

  const handleSaveNotifications = (e) => {
    e.preventDefault();
    setNotificationSaved(true);
    setTimeout(() => setNotificationSaved(false), 2000);
  };

  const handleCopyToken = () => {
    navigator.clipboard.writeText(rawToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleRegenerateToken = () => {
    const newToken = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sub_${Math.random().toString(36).substring(2, 10)}`;
    setRawToken(newToken);
    localStorage.setItem("telemetry_jwt_token", newToken);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page Title & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <div className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
            WORKSPACE / SETTINGS
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">
            Settings & Configuration
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Manage your account, thresholds, and notification channels.
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Changes sync automatically</span>
        </div>
      </div>

      {/* 2x2 Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CARD 1: User Profile */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  User Profile
                </h2>
                <p className="text-xs text-slate-400">
                  Your account information
                </p>
              </div>
              <User className="w-4 h-4 text-emerald-700" />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-800 font-bold text-lg flex items-center justify-center border border-emerald-200 shadow-2xs">
                  MB
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      Mugisha B.
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 font-mono">
                    mugisha@example.com
                  </p>
                </div>
              </div>

              <span className="bg-emerald-100 text-emerald-700 font-extrabold text-[10px] tracking-wider px-2.5 py-0.5 rounded-md uppercase">
                ACTIVE
              </span>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between">
            <div className="text-[11px] text-slate-400 font-mono">
              <span className="uppercase text-[10px] block text-slate-400 font-sans">
                JOINED
              </span>
              <span className="font-bold text-slate-700">Aug 9, 2026</span>
            </div>

            <button
              type="button"
              className="border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5 text-slate-500" />
              <span>Edit Profile</span>
            </button>
          </div>
        </div>

        {/* CARD 2: Threshold Configuration */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 flex flex-col justify-between">
          <form onSubmit={handleSaveThresholds}>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Threshold Configuration
                </h2>
                <p className="text-xs text-slate-400">
                  Set limits for your sensor alerts
                </p>
              </div>
              <SlidersHorizontal className="w-4 h-4 text-emerald-700" />
            </div>

            <div className="space-y-3">
              {/* Row 1: Temp Max */}
              <div className="flex items-center justify-between bg-slate-50/70 border border-slate-200/80 rounded-xl px-3.5 py-2">
                <div className="flex items-center gap-2.5">
                  <Thermometer className="w-4 h-4 text-emerald-700" />
                  <span className="text-xs font-semibold text-slate-700">
                    Temperature Max
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={tempMax}
                    onChange={(e) => setTempMax(e.target.value)}
                    className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-right font-mono font-bold text-slate-800 outline-none focus:border-emerald-600"
                  />
                  <span className="text-xs text-slate-400 font-mono w-6">
                    °C
                  </span>
                </div>
              </div>

              {/* Row 2: CPU Max */}
              <div className="flex items-center justify-between bg-slate-50/70 border border-slate-200/80 rounded-xl px-3.5 py-2">
                <div className="flex items-center gap-2.5">
                  <Cpu className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-semibold text-slate-700">
                    CPU Max
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={cpuMax}
                    onChange={(e) => setCpuMax(e.target.value)}
                    className="w-16 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-right font-mono font-bold text-slate-800 outline-none focus:border-emerald-600"
                  />
                  <span className="text-xs text-slate-400 font-mono w-6">
                    %
                  </span>
                </div>
              </div>

              {/* Row 3: Network Max */}
              <div className="flex items-center justify-between bg-slate-50/70 border border-slate-200/80 rounded-xl px-3.5 py-2">
                <div className="flex items-center gap-2.5">
                  <Radio className="w-4 h-4 text-cyan-600" />
                  <span className="text-xs font-semibold text-slate-700">
                    Network Max
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={netMax}
                    onChange={(e) => setNetMax(e.target.value)}
                    className="w-20 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-right font-mono font-bold text-slate-800 outline-none focus:border-emerald-600"
                  />
                  <span className="text-xs text-slate-400 font-mono w-6">
                    MB/s
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between">
              <p className="text-[11px] text-slate-400 max-w-[220px]">
                Alerts are triggered when sensor values exceed these limits.
              </p>

              <button
                type="submit"
                className="bg-[#0d3b2e] hover:bg-[#082920] text-white font-bold text-xs px-4 py-2 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors"
              >
                {thresholdSaved ? (
                  <Check className="w-3.5 h-3.5 text-emerald-300" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>{thresholdSaved ? "Saved!" : "Save Thresholds"}</span>
              </button>
            </div>
          </form>
        </div>

        {/* CARD 3: Notification Settings */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 flex flex-col justify-between">
          <form onSubmit={handleSaveNotifications}>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Notification Settings
                </h2>
                <p className="text-xs text-slate-400">
                  Choose how alerts reach your team
                </p>
              </div>
              <Bell className="w-4 h-4 text-emerald-700" />
            </div>

            <div className="space-y-4">
              {/* Option 1: Email Alerts */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <h3 className="text-xs font-bold text-slate-800">
                      Email Alerts
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Send email when threshold is breached
                    </p>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={emailAlerts}
                      onChange={(e) => setEmailAlerts(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                <input
                  type="email"
                  value={emailAddress}
                  onChange={(e) => setEmailAddress(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-700 font-mono outline-none focus:bg-white focus:border-emerald-600 transition-all"
                />
              </div>

              {/* Option 2: Webhook Alerts */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div>
                    <h3 className="text-xs font-bold text-slate-800">
                      Webhook Alerts
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Post to webhook URL on alert
                    </p>
                  </div>

                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={webhookAlerts}
                      onChange={(e) => setWebhookAlerts(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2 text-xs text-slate-700 font-mono outline-none focus:bg-white focus:border-emerald-600 transition-all"
                />
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-100 text-right">
              <button
                type="submit"
                className="bg-[#0d3b2e] hover:bg-[#082920] text-white font-bold text-xs px-4 py-2 rounded-lg shadow-xs transition-colors"
              >
                {notificationSaved ? "Saved!" : "Save Notification Settings"}
              </button>
            </div>
          </form>
        </div>

        {/* CARD 4: API Access & Authentication */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  API Access & Authentication
                </h2>
                <p className="text-xs text-slate-400">
                  Manage programmatic access
                </p>
              </div>
              <Key className="w-4 h-4 text-emerald-700" />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                CURRENT ACCESS TOKEN
              </label>

              <div className="relative">
                <input
                  type={showToken ? "text" : "password"}
                  readOnly
                  value={rawToken}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-3.5 pr-20 py-2 text-xs text-slate-700 font-mono outline-none"
                />

                <div className="absolute right-2 top-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setShowToken(!showToken)}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                    title={showToken ? "Hide token" : "Show token"}
                  >
                    {showToken ? (
                      <EyeOff className="w-3.5 h-3.5" />
                    ) : (
                      <Eye className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyToken}
                    className="p-1 text-slate-400 hover:text-slate-600 rounded transition-colors"
                    title="Copy token"
                  >
                    {copiedToken ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between">
            <div className="text-xs text-slate-500 font-mono">
              Token expiry{" "}
              <strong className="text-slate-800">30 minutes</strong>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRegenerateToken}
                className="border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                Regenerate Token
              </button>

              <button
                type="button"
                className="text-slate-600 hover:text-slate-900 text-xs font-semibold flex items-center gap-1 transition-colors px-2 py-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>View Docs</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
