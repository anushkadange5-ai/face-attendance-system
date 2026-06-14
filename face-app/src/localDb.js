// Offline-first local storage powered by IndexedDB (via the `idb`
// wrapper). Everything the app reads goes through here first, so the
// UI works with zero internet. Writes go to IndexedDB AND are queued
// in an "outbox" store; syncService.js drains that queue to Firestore
// whenever we're online.

import { openDB } from "idb";

const DB_NAME    = "face-attendance-local";
const DB_VERSION = 1;

// Store names — keep in sync with onUpgradeNeeded below.
export const STORE_EMPLOYEES  = "employees";
export const STORE_ATTENDANCE = "attendance";
export const STORE_OUTBOX     = "outbox";    // pending writes for Firestore
export const STORE_META       = "meta";      // misc key/value (last sync, etc.)

let _dbPromise = null;

function getDb() {
  if (!_dbPromise) {
    _dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {

        if (!db.objectStoreNames.contains(STORE_EMPLOYEES)) {
          // employee.id is the Firestore doc id (or a temp uuid if we
          // enrolled while offline).
          db.createObjectStore(STORE_EMPLOYEES, { keyPath: "id" });
        }

        if (!db.objectStoreNames.contains(STORE_ATTENDANCE)) {
          const att = db.createObjectStore(STORE_ATTENDANCE, {
            keyPath: "id",
          });
          att.createIndex("byName", "name", { unique: false });
          att.createIndex("byTime", "timeMs", { unique: false });
        }

        if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
          // Auto-incrementing primary key — order of writes is preserved.
          db.createObjectStore(STORE_OUTBOX, {
            keyPath: "id",
            autoIncrement: true,
          });
        }

        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: "key" });
        }
      },
    });
  }
  return _dbPromise;
}

// ---------------------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------------------

// Tiny RFC-4122-ish id used when we create something while offline and
// don't yet have a Firestore-assigned id. Replaced on first successful sync.
export function tempId(prefix = "local") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// Normalise a time value (Firestore Timestamp / Date / number / string)
// to a plain millis-since-epoch number, so IndexedDB can index it.
export function toMs(value) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  if (value instanceof Date)              return value.getTime();
  if (typeof value === "object" && typeof value.seconds === "number") {
    return value.seconds * 1000;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

// ---------------------------------------------------------------------------
// EMPLOYEES
// ---------------------------------------------------------------------------

export async function localGetEmployees() {
  const db = await getDb();
  return db.getAll(STORE_EMPLOYEES);
}

export async function localPutEmployee(emp) {
  if (!emp.id) emp.id = tempId("emp");
  const db = await getDb();
  await db.put(STORE_EMPLOYEES, emp);
  return emp;
}

export async function localDeleteEmployee(id) {
  const db = await getDb();
  await db.delete(STORE_EMPLOYEES, id);
}

export async function localReplaceAllEmployees(list) {
  const db = await getDb();
  const tx = db.transaction(STORE_EMPLOYEES, "readwrite");
  await tx.store.clear();
  for (const emp of list) {
    if (emp?.id) await tx.store.put(emp);
  }
  await tx.done;
}

// ---------------------------------------------------------------------------
// ATTENDANCE
// ---------------------------------------------------------------------------

export async function localGetAttendance() {
  const db = await getDb();
  return db.getAll(STORE_ATTENDANCE);
}

export async function localPutAttendance(entry) {
  if (!entry.id)     entry.id     = tempId("att");
  if (!entry.timeMs) entry.timeMs = toMs(entry.time) || Date.now();
  const db = await getDb();
  await db.put(STORE_ATTENDANCE, entry);
  return entry;
}

export async function localDeleteAttendanceByName(name) {
  const db = await getDb();
  const tx = db.transaction(STORE_ATTENDANCE, "readwrite");
  const idx = tx.store.index("byName");
  let cursor = await idx.openCursor(IDBKeyRange.only(name));
  let removed = 0;
  while (cursor) {
    await cursor.delete();
    removed++;
    cursor = await cursor.continue();
  }
  await tx.done;
  return removed;
}

export async function localReplaceAllAttendance(list) {
  const db = await getDb();
  const tx = db.transaction(STORE_ATTENDANCE, "readwrite");
  await tx.store.clear();
  for (const a of list) {
    if (!a?.id) continue;
    if (!a.timeMs) a.timeMs = toMs(a.time) || Date.now();
    await tx.store.put(a);
  }
  await tx.done;
}

// ---------------------------------------------------------------------------
// OUTBOX  (pending writes to push to Firestore once we're online)
//   op: "saveEmployee" | "saveAttendance" | "deleteEmployee"
//   payload: the data needed to perform the op on the remote
// ---------------------------------------------------------------------------

export async function outboxPush(op, payload) {
  const db = await getDb();
  const id = await db.add(STORE_OUTBOX, {
    op,
    payload,
    createdAt: Date.now(),
  });
  return id;
}

export async function outboxPeekAll() {
  const db = await getDb();
  return db.getAll(STORE_OUTBOX);
}

export async function outboxDelete(id) {
  const db = await getDb();
  await db.delete(STORE_OUTBOX, id);
}

export async function outboxCount() {
  const db = await getDb();
  return db.count(STORE_OUTBOX);
}

// ---------------------------------------------------------------------------
// META  (last sync time, etc.)
// ---------------------------------------------------------------------------

export async function metaSet(key, value) {
  const db = await getDb();
  await db.put(STORE_META, { key, value });
}

export async function metaGet(key) {
  const db = await getDb();
  const row = await db.get(STORE_META, key);
  return row?.value;
}
