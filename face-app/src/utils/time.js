// SAFELY CONVERT ANY TIME VALUE TO JS DATE
// Handles: Firestore Timestamp, JS Date, ISO string, number
export function toJsDate(value) {
  if (!value) return null;

  // Firestore Timestamp has .toDate()
  if (typeof value?.toDate === "function") {
    return value.toDate();
  }

  // Already a Date
  if (value instanceof Date) return value;

  // Firestore Timestamp serialized form { seconds, nanoseconds }
  if (typeof value === "object" && typeof value.seconds === "number") {
    return new Date(value.seconds * 1000);
  }

  // ISO string / number
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// SAFE LOCALE DATE STRING (e.g. "1/6/2026")
export function toDateString(value) {
  const d = toJsDate(value);
  return d ? d.toLocaleDateString() : "";
}

// SAFE LOCALE TIME STRING
export function toTimeString(value) {
  const d = toJsDate(value);
  return d ? d.toLocaleTimeString() : "";
}
