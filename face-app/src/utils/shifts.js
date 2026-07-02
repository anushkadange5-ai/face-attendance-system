// Shift definitions. Each shift has a clock-in / clock-out time
// (in 24h "HH:mm" form) plus a small label + emoji for the UI.
//
// To add or change a shift, just edit this list. Everything else
// (enroll dropdown, late/half-day calculations, employee card,
// EmployeeDetails report) reads from here.

export const SHIFTS = {
  general1: {
    id:      "general1",
    label:   "General 1",
    emoji:   "☀️",
    loginAt:  "09:00",
    logoutAt: "17:00",
  },
  general2: {
    id:      "general2",
    label:   "General 2",
    emoji:   "🌤️",
    loginAt:  "08:00",
    logoutAt: "16:00",
  },
  morning: {
    id:      "morning",
    label:   "Morning",
    emoji:   "🌅",
    loginAt:  "07:00",
    logoutAt: "15:00",
  },
  afternoon: {
    id:      "afternoon",
    label:   "Afternoon",
    emoji:   "🌇",
    loginAt:  "15:00",
    logoutAt: "23:00",
  },
  night: {
    id:      "night",
    label:   "Night",
    emoji:   "🌙",
    loginAt:  "23:00",
    logoutAt: "07:00",
  },
};

// Convenience array for dropdowns / iteration.
export const SHIFT_LIST = Object.values(SHIFTS);

// Default if an old employee record has no shift saved yet.
export const DEFAULT_SHIFT_ID = "general1";

// ----------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------

// Parse "HH:mm" into { h, m }.
function parseHHMM(hhmm) {
  const [h, m] = (hhmm || "00:00").split(":").map(Number);
  return { h: h || 0, m: m || 0 };
}

// Lookup that always returns a shift (falls back to general).
export function getShift(shiftId) {
  return SHIFTS[shiftId] || SHIFTS[DEFAULT_SHIFT_ID];
}

// "Morning 🌅  07:00 – 15:00"
export function describeShift(shiftId) {
  const s = getShift(shiftId);
  return `${s.emoji} ${s.label}  ${s.loginAt} – ${s.logoutAt}`;
}

// Was this LOGIN late vs the shift's start? Allows a 1-minute
// grace (clock skew, scanner latency).
export function isLateLogin(loginDate, shiftId) {
  if (!loginDate) return false;
  const { h, m } = parseHHMM(getShift(shiftId).loginAt);
  const startMin    = h * 60 + m + 1;             // 1-min grace
  const actualMin   = loginDate.getHours() * 60 + loginDate.getMinutes();
  return actualMin > startMin;
}

// Was this LOGOUT early vs the shift's end? Used for the half-day flag.
// Handles overnight shifts (e.g. night shift 21:00 -> 05:00) by treating
// any logout earlier in the day as "next-day morning" if the start time
// is in the evening.
export function isEarlyLogout(loginDate, logoutDate, shiftId) {
  if (!loginDate || !logoutDate) return false;
  const s = getShift(shiftId);
  const start = parseHHMM(s.loginAt);
  const end   = parseHHMM(s.logoutAt);

  const startMin = start.h * 60 + start.m;
  const endMin   = end.h * 60 + end.m;

  // Overnight shift: end is conceptually on the next day.
  const overnight = endMin <= startMin;

  const logoutMin = logoutDate.getHours() * 60 + logoutDate.getMinutes();

  if (!overnight) {
    return logoutMin < endMin;
  }

  // Overnight: if logout falls in the "early morning" range it's the
  // shift end, otherwise it's same-day evening = early.
  if (logoutMin <= endMin)            return false;        // on/after end
  if (logoutMin >= startMin)          return true;         // logged out same evening
  return logoutMin < endMin;
}
