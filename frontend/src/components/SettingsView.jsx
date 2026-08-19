import React, { useState } from "react";
import { User, Lock, Check, ChevronDown, Calendar, Edit2, KeyRound } from "lucide-react";

export function SettingsView({ thresholds, onUpdateThresholds, onOpenAuth, profileImage, setProfileImage }) {
  const [activeTab, setActiveTab] = useState('personal'); // 'personal' or 'security'

  // Mock User Data
  const [user, setUser] = useState({
    firstName: "Roland",
    lastName: "Donald",
    email: "rolandDonald@mail.com",
    address: "3605 Parker Rd.",
    phone: "(405) 555-0128",
    dob: "1 Feb, 1995",
    location: "Atlanta, USA",
    postalCode: "30301",
    gender: "Male"
  });

  const [securityData, setSecurityData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUser(prev => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const imageUrl = URL.createObjectURL(file);
      setProfileImage(imageUrl);
    }
  };

  const handleSecurityChange = (e) => {
    const { name, value } = e.target;
    setSecurityData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    // Simulate save
  };

  const handleDiscard = () => {
    // Simulate discard
  };

  return (
    <div className="max-w-6xl mx-auto h-full p-4 flex gap-6">
      {/* LEFT COLUMN: Profile Sidebar */}
      <div className="w-[300px] shrink-0 bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col items-center p-8 h-fit">
        <div className="relative mb-4">
          <div className="w-32 h-32 rounded-full overflow-hidden bg-slate-200 border-4 border-white shadow-sm">
            <img 
              src={profileImage} 
              alt="Profile avatar" 
              className="w-full h-full object-cover"
            />
          </div>
          <label className="absolute bottom-1 right-1 bg-[#0d3b2e] text-white p-2 rounded-full shadow-md hover:bg-emerald-800 transition-colors cursor-pointer border-2 border-white flex items-center justify-center">
            <Edit2 className="w-4 h-4" />
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              onChange={handleImageUpload} 
            />
          </label>
        </div>
        
        <h2 className="text-xl font-bold text-slate-900 mb-8">{user.firstName} {user.lastName}</h2>

        <div className="w-full space-y-2">
          <button 
            onClick={() => setActiveTab('personal')}
            className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-xl font-semibold transition-colors cursor-pointer text-sm ${
              activeTab === 'personal' ? 'bg-emerald-50 text-emerald-900' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <User className={`w-5 h-5 ${activeTab === 'personal' ? 'text-emerald-600' : 'text-slate-400'}`} />
            Personal Information
          </button>
          <button 
            onClick={() => setActiveTab('security')}
            className={`w-full flex items-center gap-3 px-5 py-3.5 rounded-xl font-semibold transition-colors cursor-pointer text-sm ${
              activeTab === 'security' ? 'bg-emerald-50 text-emerald-900' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <Lock className={`w-5 h-5 ${activeTab === 'security' ? 'text-emerald-600' : 'text-slate-400'}`} />
            Login & Password
          </button>
        </div>
      </div>

      {/* RIGHT COLUMN: Content Area */}
      <div className="flex-1 bg-white rounded-3xl shadow-sm border border-slate-100 p-10">
        
        {activeTab === 'personal' && (
          <>
            <h1 className="text-2xl font-bold text-slate-900 mb-8">Personal Information</h1>
            <form className="space-y-6" onSubmit={handleSave}>
              {/* Gender Radios */}
              <div className="flex items-center gap-6 mb-8 text-sm">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${user.gender === 'Male' ? 'border-[#0d3b2e]' : 'border-slate-300'}`}>
                    {user.gender === 'Male' && <div className="w-2.5 h-2.5 rounded-full bg-[#0d3b2e]"></div>}
                  </div>
                  <input type="radio" name="gender" value="Male" checked={user.gender === 'Male'} onChange={handleChange} className="hidden" />
                  Male
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${user.gender === 'Female' ? 'border-[#0d3b2e]' : 'border-slate-300'}`}>
                    {user.gender === 'Female' && <div className="w-2.5 h-2.5 rounded-full bg-[#0d3b2e]"></div>}
                  </div>
                  <input type="radio" name="gender" value="Female" checked={user.gender === 'Female'} onChange={handleChange} className="hidden" />
                  Female
                </label>
              </div>

              {/* Form Grid */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                <div>
                  <label className="block text-slate-500 text-sm font-medium mb-2">First Name</label>
                  <input type="text" name="firstName" value={user.firstName} onChange={handleChange} className="w-full bg-slate-50/70 border-none rounded-xl px-4 py-3.5 text-slate-800 font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all" />
                </div>
                <div>
                  <label className="block text-slate-500 text-sm font-medium mb-2">Last Name</label>
                  <input type="text" name="lastName" value={user.lastName} onChange={handleChange} className="w-full bg-slate-50/70 border-none rounded-xl px-4 py-3.5 text-slate-800 font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all" />
                </div>
                <div className="col-span-2 relative">
                  <label className="block text-slate-500 text-sm font-medium mb-2">Email</label>
                  <input type="email" name="email" value={user.email} onChange={handleChange} className="w-full bg-slate-50/70 border-none rounded-xl pl-4 pr-24 py-3.5 text-slate-800 font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all" />
                  <div className="absolute right-4 top-[38px] flex items-center gap-1 text-emerald-500 font-medium text-sm">
                    <Check className="w-4 h-4 bg-emerald-500 text-white rounded-full p-0.5" />
                    Verified
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-slate-500 text-sm font-medium mb-2">Address</label>
                  <input type="text" name="address" value={user.address} onChange={handleChange} className="w-full bg-slate-50/70 border-none rounded-xl px-4 py-3.5 text-slate-800 font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all" />
                </div>
                <div>
                  <label className="block text-slate-500 text-sm font-medium mb-2">Phone Number</label>
                  <input type="text" name="phone" value={user.phone} onChange={handleChange} className="w-full bg-slate-50/70 border-none rounded-xl px-4 py-3.5 text-slate-800 font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all" />
                </div>
                <div className="relative">
                  <label className="block text-slate-500 text-sm font-medium mb-2">Date of Birth</label>
                  <input type="text" name="dob" value={user.dob} onChange={handleChange} className="w-full bg-slate-50/70 border-none rounded-xl px-4 py-3.5 text-slate-800 font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all pr-10" />
                  <Calendar className="w-5 h-5 text-slate-400 absolute right-4 top-[38px] pointer-events-none" />
                </div>
                <div className="relative">
                  <label className="block text-slate-500 text-sm font-medium mb-2">Location</label>
                  <input type="text" name="location" value={user.location} onChange={handleChange} className="w-full bg-slate-50/70 border-none rounded-xl px-4 py-3.5 text-slate-800 font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all pr-10" />
                  <ChevronDown className="w-5 h-5 text-slate-400 absolute right-4 top-[38px] pointer-events-none" />
                </div>
                <div>
                  <label className="block text-slate-500 text-sm font-medium mb-2">Postal Code</label>
                  <input type="text" name="postalCode" value={user.postalCode} onChange={handleChange} className="w-full bg-slate-50/70 border-none rounded-xl px-4 py-3.5 text-slate-800 font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all" />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={handleDiscard} className="flex-1 py-4 border-2 border-[#0d3b2e] text-[#0d3b2e] rounded-xl font-bold hover:bg-emerald-50 transition-colors cursor-pointer">
                  Discard Changes
                </button>
                <button type="submit" className="flex-1 py-4 bg-[#0d3b2e] text-white rounded-xl font-bold hover:bg-emerald-900 transition-colors cursor-pointer shadow-md shadow-emerald-900/20">
                  Save Changes
                </button>
              </div>
            </form>
          </>
        )}

        {activeTab === 'security' && (
          <>
            <h1 className="text-2xl font-bold text-slate-900 mb-8">Login & Password</h1>
            
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-5 mb-8 flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-200/50 flex items-center justify-center text-emerald-700 shrink-0 mt-1">
                <KeyRound className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-emerald-900 mb-1">Secure your account</h3>
                <p className="text-xs text-emerald-800/80 leading-relaxed">
                  Update your password regularly to keep your account secure. We recommend using a strong password that you aren't using for any other websites.
                </p>
              </div>
            </div>

            <form className="space-y-6" onSubmit={handleSave}>
              <div className="space-y-6">
                <div>
                  <label className="block text-slate-500 text-sm font-medium mb-2">Current Password</label>
                  <input 
                    type="password" 
                    name="currentPassword" 
                    value={securityData.currentPassword} 
                    onChange={handleSecurityChange} 
                    placeholder="Enter your current password"
                    className="w-full bg-slate-50/70 border-none rounded-xl px-4 py-3.5 text-slate-800 font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all" 
                  />
                </div>
                
                <div className="h-px bg-slate-100 my-2"></div>

                <div>
                  <label className="block text-slate-500 text-sm font-medium mb-2">New Password</label>
                  <input 
                    type="password" 
                    name="newPassword" 
                    value={securityData.newPassword} 
                    onChange={handleSecurityChange} 
                    placeholder="Enter new password"
                    className="w-full bg-slate-50/70 border-none rounded-xl px-4 py-3.5 text-slate-800 font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all" 
                  />
                </div>
                
                <div>
                  <label className="block text-slate-500 text-sm font-medium mb-2">Confirm New Password</label>
                  <input 
                    type="password" 
                    name="confirmPassword" 
                    value={securityData.confirmPassword} 
                    onChange={handleSecurityChange} 
                    placeholder="Confirm new password"
                    className="w-full bg-slate-50/70 border-none rounded-xl px-4 py-3.5 text-slate-800 font-medium outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all" 
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setSecurityData({ currentPassword: "", newPassword: "", confirmPassword: "" })} className="flex-1 py-4 border-2 border-[#0d3b2e] text-[#0d3b2e] rounded-xl font-bold hover:bg-emerald-50 transition-colors cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="flex-1 py-4 bg-[#0d3b2e] text-white rounded-xl font-bold hover:bg-emerald-900 transition-colors cursor-pointer shadow-md shadow-emerald-900/20">
                  Update Password
                </button>
              </div>
            </form>
          </>
        )}

      </div>
    </div>
  );
}

