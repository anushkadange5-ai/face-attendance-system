// Settings management - configurable system parameters
// Stored in localStorage for persistence

const SETTINGS_KEY = "faceSystemSettings";

// Default settings
export const DEFAULT_SETTINGS = {
  // Recognition
  recognitionThreshold: 0.5,        // 0.3 to 0.7 (lower = stricter)
  minFaceSize: 100,                 // pixels
  detectionInterval: 1500,          // ms between face checks

  // Attendance
  cooldownMinutes: 5,               // minutes between same-person marks
  graceMinutes: 1,                  // grace period for late detection
  autoLogoutMinutes: 30,            // session timeout

  // Liveness
  livenessFramesRequired: 2,        // frames needed for liveness check
  noseMovementThreshold: 0.003,     // normalized movement threshold
  blinkThreshold: 0.03,             // Eye Aspect Ratio change threshold

  // Camera
  preferredCameraId: "",            // saved camera device ID
  cameraWidth: 360,
  cameraHeight: 360,
  mirrorCamera: true,

  // Security
  enableEncryption: false,          // encrypt stored embeddings (set to true after fixing decryption)
  requireLivenessCheck: true,       // require anti-spoofing
  sessionTimeoutEnabled: true,      // auto logout after inactivity

  // UI
  voiceAnnouncements: true,         // TTS for welcome/goodbye
  showStatusBadge: true,            // online/offline indicator
  darkMode: true,                   // dark theme (always on for now)
};

// Load settings from localStorage
export function loadSettings() {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new settings added in updates
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn("Failed to load settings:", e);
  }
  return { ...DEFAULT_SETTINGS };
}

// Save settings to localStorage
export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    return true;
  } catch (e) {
    console.error("Failed to save settings:", e);
    return false;
  }
}

// Update a single setting
export function updateSetting(key, value) {
  const settings = loadSettings();
  settings[key] = value;
  return saveSettings(settings);
}

// Get a single setting
export function getSetting(key) {
  const settings = loadSettings();
  return settings[key] ?? DEFAULT_SETTINGS[key];
}

// Reset to defaults
export function resetSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
  return { ...DEFAULT_SETTINGS };
}

// Validate settings
export function validateSettings(settings) {
  const errors = [];

  if (settings.recognitionThreshold < 0.3 || settings.recognitionThreshold > 0.7) {
    errors.push("Recognition threshold must be between 0.3 and 0.7");
  }

  if (settings.minFaceSize < 50 || settings.minFaceSize > 200) {
    errors.push("Minimum face size must be between 50 and 200 pixels");
  }

  if (settings.cooldownMinutes < 1 || settings.cooldownMinutes > 60) {
    errors.push("Cooldown minutes must be between 1 and 60");
  }

  if (settings.graceMinutes < 0 || settings.graceMinutes > 10) {
    errors.push("Grace minutes must be between 0 and 10");
  }

  if (settings.autoLogoutMinutes < 5 || settings.autoLogoutMinutes > 120) {
    errors.push("Auto logout minutes must be between 5 and 120");
  }

  return errors;
}