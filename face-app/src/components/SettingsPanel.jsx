import { useState, useEffect } from "react";
import { loadSettings, saveSettings, resetSettings, validateSettings, DEFAULT_SETTINGS } from "../utils/settings";
import { createBackup, downloadBackup } from "../utils/backup";
import { db } from "../db";

function SettingsPanel({ adminUser, onClose }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [errors, setErrors] = useState([]);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState("recognition");
  const [backupStatus, setBackupStatus] = useState("");

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const handleChange = (key, value) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
    setSaved(false);
  };

  const handleSave = () => {
    const validationErrors = validateSettings(settings);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    saveSettings(settings);
    setSaved(true);
    setErrors([]);
    
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    if (window.confirm("Reset all settings to default values?")) {
      const defaults = resetSettings();
      setSettings(defaults);
      setSaved(true);
    }
  };

  const handleBackup = async () => {
    try {
      setBackupStatus("Creating backup...");
      const employees = await db.getEmployees();
      const attendance = await db.getAttendance();
      
      const backup = await createBackup(employees, attendance, settings);
      const filename = downloadBackup(backup);
      
      setBackupStatus(`✅ Backup saved: ${filename}`);
      setTimeout(() => setBackupStatus(""), 5000);
    } catch (e) {
      setBackupStatus(`❌ Backup failed: ${e.message}`);
    }
  };

  const tabs = [
    { id: "recognition", label: "🎯 Recognition", icon: "🎯" },
    { id: "attendance", label: "⏱️ Attendance", icon: "⏱️" },
    { id: "liveness", label: "🛡️ Security", icon: "🛡️" },
    { id: "camera", label: "📷 Camera", icon: "📷" },
    { id: "ui", label: "🖥️ UI", icon: "🖥️" },
    { id: "backup", label: "💾 Backup", icon: "💾" },
  ];

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4">
      <div className="bg-[#111] w-full max-w-4xl rounded-3xl border border-green-500/20 max-h-[95vh] overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-green-500/20">
          <div>
            <h1 className="text-3xl font-bold text-green-400">⚙️ Settings</h1>
            <p className="text-gray-400 text-sm mt-1">Configure system parameters</p>
          </div>
          <button
            onClick={onClose}
            className="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white px-5 py-3 rounded-xl font-bold transition"
          >
            ✕ Close
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-4 border-b border-green-500/20 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl font-semibold whitespace-nowrap transition ${
                activeTab === tab.id
                  ? "bg-green-500 text-black"
                  : "bg-black border border-green-500/30 text-green-400 hover:bg-green-500/20"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {/* Recognition Tab */}
          {activeTab === "recognition" && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-green-400">🎯 Face Recognition Settings</h2>
              
              <div className="bg-black rounded-2xl p-6 border border-green-500/20">
                <label className="block mb-2">
                  <span className="text-white font-bold">Recognition Threshold</span>
                  <span className="text-gray-400 text-sm ml-2">(0.3 = strict, 0.7 = loose)</span>
                </label>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min="0.3"
                    max="0.7"
                    step="0.05"
                    value={settings.recognitionThreshold}
                    onChange={(e) => handleChange("recognitionThreshold", parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <span className="text-green-400 font-bold text-xl w-16 text-center">
                    {settings.recognitionThreshold}
                  </span>
                </div>
                <p className="text-gray-500 text-sm mt-2">
                  Lower values are stricter but may miss legitimate matches.
                </p>
              </div>

              <div className="bg-black rounded-2xl p-6 border border-green-500/20">
                <label className="block mb-2">
                  <span className="text-white font-bold">Minimum Face Size (pixels)</span>
                </label>
                <input
                  type="number"
                  min="50"
                  max="200"
                  value={settings.minFaceSize}
                  onChange={(e) => handleChange("minFaceSize", parseInt(e.target.value))}
                  className="w-full bg-[#0a0a0a] border border-green-500/30 rounded-xl p-3 text-white text-lg"
                />
                <p className="text-gray-500 text-sm mt-2">
                  Minimum face width in pixels to accept for enrollment/recognition.
                </p>
              </div>

              <div className="bg-black rounded-2xl p-6 border border-green-500/20">
                <label className="block mb-2">
                  <span className="text-white font-bold">Detection Interval (ms)</span>
                </label>
                <input
                  type="number"
                  min="500"
                  max="5000"
                  step="100"
                  value={settings.detectionInterval}
                  onChange={(e) => handleChange("detectionInterval", parseInt(e.target.value))}
                  className="w-full bg-[#0a0a0a] border border-green-500/30 rounded-xl p-3 text-white text-lg"
                />
                <p className="text-gray-500 text-sm mt-2">
                  How often to check for faces (lower = faster but more CPU).
                </p>
              </div>
            </div>
          )}

          {/* Attendance Tab */}
          {activeTab === "attendance" && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-green-400">⏱️ Attendance Settings</h2>
              
              <div className="bg-black rounded-2xl p-6 border border-green-500/20">
                <label className="block mb-2">
                  <span className="text-white font-bold">Cooldown Period (minutes)</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={settings.cooldownMinutes}
                  onChange={(e) => handleChange("cooldownMinutes", parseInt(e.target.value))}
                  className="w-full bg-[#0a0a0a] border border-green-500/30 rounded-xl p-3 text-white text-lg"
                />
                <p className="text-gray-500 text-sm mt-2">
                  Minimum time before same person can mark attendance again.
                </p>
              </div>

              <div className="bg-black rounded-2xl p-6 border border-green-500/20">
                <label className="block mb-2">
                  <span className="text-white font-bold">Grace Period (minutes)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={settings.graceMinutes}
                  onChange={(e) => handleChange("graceMinutes", parseInt(e.target.value))}
                  className="w-full bg-[#0a0a0a] border border-green-500/30 rounded-xl p-3 text-white text-lg"
                />
                <p className="text-gray-500 text-sm mt-2">
                  Extra minutes allowed before marking as "Late".
                </p>
              </div>

              <div className="bg-black rounded-2xl p-6 border border-green-500/20">
                <label className="block mb-2">
                  <span className="text-white font-bold">Session Timeout (minutes)</span>
                </label>
                <input
                  type="number"
                  min="5"
                  max="120"
                  value={settings.autoLogoutMinutes}
                  onChange={(e) => handleChange("autoLogoutMinutes", parseInt(e.target.value))}
                  className="w-full bg-[#0a0a0a] border border-green-500/30 rounded-xl p-3 text-white text-lg"
                />
                <p className="text-gray-500 text-sm mt-2">
                  Auto logout admin session after this period of inactivity.
                </p>
              </div>
            </div>
          )}

          {/* Liveness/Security Tab */}
          {activeTab === "liveness" && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-green-400">🛡️ Security Settings</h2>
              
              <div className="bg-black rounded-2xl p-6 border border-green-500/20">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enableEncryption}
                    onChange={(e) => handleChange("enableEncryption", e.target.checked)}
                    className="w-6 h-6 accent-green-500"
                  />
                  <span className="text-white font-bold">Enable Embedding Encryption</span>
                </label>
                <p className="text-gray-500 text-sm mt-2 ml-9">
                  Encrypt stored face embeddings for additional security.
                </p>
              </div>

              <div className="bg-black rounded-2xl p-6 border border-green-500/20">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.requireLivenessCheck}
                    onChange={(e) => handleChange("requireLivenessCheck", e.target.checked)}
                    className="w-6 h-6 accent-green-500"
                  />
                  <span className="text-white font-bold">Require Liveness Check</span>
                </label>
                <p className="text-gray-500 text-sm mt-2 ml-9">
                  Detect and reject photos/videos used for spoofing.
                </p>
              </div>

              <div className="bg-black rounded-2xl p-6 border border-green-500/20">
                <label className="block mb-2">
                  <span className="text-white font-bold">Nose Movement Threshold</span>
                </label>
                <input
                  type="number"
                  min="0.001"
                  max="0.01"
                  step="0.001"
                  value={settings.noseMovementThreshold}
                  onChange={(e) => handleChange("noseMovementThreshold", parseFloat(e.target.value))}
                  className="w-full bg-[#0a0a0a] border border-green-500/30 rounded-xl p-3 text-white text-lg"
                />
              </div>

              <div className="bg-black rounded-2xl p-6 border border-green-500/20">
                <label className="block mb-2">
                  <span className="text-white font-bold">Blink Detection Threshold</span>
                </label>
                <input
                  type="number"
                  min="0.01"
                  max="0.1"
                  step="0.01"
                  value={settings.blinkThreshold}
                  onChange={(e) => handleChange("blinkThreshold", parseFloat(e.target.value))}
                  className="w-full bg-[#0a0a0a] border border-green-500/30 rounded-xl p-3 text-white text-lg"
                />
              </div>
            </div>
          )}

          {/* Camera Tab */}
          {activeTab === "camera" && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-green-400">📷 Camera Settings</h2>
              
              <div className="bg-black rounded-2xl p-6 border border-green-500/20">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.mirrorCamera}
                    onChange={(e) => handleChange("mirrorCamera", e.target.checked)}
                    className="w-6 h-6 accent-green-500"
                  />
                  <span className="text-white font-bold">Mirror Camera (Selfie Mode)</span>
                </label>
              </div>

              <div className="bg-black rounded-2xl p-6 border border-green-500/20">
                <label className="block mb-2">
                  <span className="text-white font-bold">Camera Resolution Width</span>
                </label>
                <input
                  type="number"
                  min="320"
                  max="1920"
                  step="40"
                  value={settings.cameraWidth}
                  onChange={(e) => handleChange("cameraWidth", parseInt(e.target.value))}
                  className="w-full bg-[#0a0a0a] border border-green-500/30 rounded-xl p-3 text-white text-lg"
                />
              </div>

              <div className="bg-black rounded-2xl p-6 border border-green-500/20">
                <label className="block mb-2">
                  <span className="text-white font-bold">Camera Resolution Height</span>
                </label>
                <input
                  type="number"
                  min="320"
                  max="1080"
                  step="40"
                  value={settings.cameraHeight}
                  onChange={(e) => handleChange("cameraHeight", parseInt(e.target.value))}
                  className="w-full bg-[#0a0a0a] border border-green-500/30 rounded-xl p-3 text-white text-lg"
                />
              </div>
            </div>
          )}

          {/* UI Tab */}
          {activeTab === "ui" && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-green-400">🖥️ User Interface</h2>
              
              <div className="bg-black rounded-2xl p-6 border border-green-500/20">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.voiceAnnouncements}
                    onChange={(e) => handleChange("voiceAnnouncements", e.target.checked)}
                    className="w-6 h-6 accent-green-500"
                  />
                  <span className="text-white font-bold">Voice Announcements</span>
                </label>
                <p className="text-gray-500 text-sm mt-2 ml-9">
                  Speak employee name on successful recognition.
                </p>
              </div>

              <div className="bg-black rounded-2xl p-6 border border-green-500/20">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.showStatusBadge}
                    onChange={(e) => handleChange("showStatusBadge", e.target.checked)}
                    className="w-6 h-6 accent-green-500"
                  />
                  <span className="text-white font-bold">Show Online/Offline Badge</span>
                </label>
              </div>

              <div className="bg-black rounded-2xl p-6 border border-green-500/20">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.sessionTimeoutEnabled}
                    onChange={(e) => handleChange("sessionTimeoutEnabled", e.target.checked)}
                    className="w-6 h-6 accent-green-500"
                  />
                  <span className="text-white font-bold">Enable Session Timeout</span>
                </label>
              </div>
            </div>
          )}

          {/* Backup Tab */}
          {activeTab === "backup" && (
            <div className="space-y-6">
              <h2 className="text-2xl font-bold text-green-400">💾 Backup & Restore</h2>
              
              <div className="bg-black rounded-2xl p-6 border border-green-500/20">
                <h3 className="text-lg font-bold text-green-400 mb-4">📤 Create Backup</h3>
                <p className="text-gray-400 mb-4">
                  Download a backup file containing all employees, attendance records, and settings.
                </p>
                <button
                  onClick={handleBackup}
                  className="bg-green-500 hover:bg-green-600 px-6 py-3 rounded-xl font-bold text-lg transition"
                >
                  💾 Download Backup
                </button>
                {backupStatus && (
                  <p className="text-green-400 mt-3">{backupStatus}</p>
                )}
              </div>

              <div className="bg-black rounded-2xl p-6 border border-yellow-500/20">
                <h3 className="text-lg font-bold text-yellow-400 mb-4">⚠️ Danger Zone</h3>
                <button
                  onClick={handleReset}
                  className="bg-red-500 hover:bg-red-600 px-6 py-3 rounded-xl font-bold text-lg transition"
                >
                  🔄 Reset All Settings
                </button>
                <p className="text-gray-500 text-sm mt-2">
                  This will reset all settings to their default values.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-green-500/20 flex justify-between items-center">
          {errors.length > 0 && (
            <div className="text-red-400">
              {errors.map((e, i) => (
                <p key={i} className="text-sm">⚠️ {e}</p>
              ))}
            </div>
          )}
          
          <div className="flex gap-3 ml-auto">
            {saved && (
              <span className="text-green-400 font-bold self-center">
                ✅ Saved!
              </span>
            )}
            <button
              onClick={handleSave}
              className="bg-green-500 hover:bg-green-600 px-6 py-3 rounded-xl font-bold text-lg transition"
            >
              💾 Save Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPanel;