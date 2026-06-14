// Bridge between the local IndexedDB cache (localDb.js) and Firestore.
//
//   - Subscribes to Firestore in real time and mirrors every change to
//     IndexedDB, so the next time the user opens the app offline they
//     still see the latest employees + attendance.
//   - Exposes online/offline status to the UI.
//   - Drains the outbox (offline writes) the moment we go online again.

import {
  collection,
  addDoc,
  doc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  getDocs,
  writeBatch,
  Timestamp,
} from "firebase/firestore";

import { firestore } from "./firebase";

import {
  STORE_EMPLOYEES,
  STORE_ATTENDANCE,
  localReplaceAllEmployees,
  localReplaceAllAttendance,
  localGetEmployees,
  localGetAttendance,
  localPutAttendance,
  localPutEmployee,
  localDeleteEmployee,
  localDeleteAttendanceByName,
  outboxPush,
  outboxPeekAll,
  outboxDelete,
  outboxCount,
  metaSet,
  toMs,
} from "./localDb";

// --------------------------------------------------------------------------
// Online/offline pub-sub  (the UI subscribes to render a status indicator)
// --------------------------------------------------------------------------

const onlineListeners = new Set();
let _online = typeof navigator !== "undefined" ? navigator.onLine : true;

function emitOnline() {
  for (const cb of onlineListeners) {
    try { cb(_online); } catch (_) {}
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online",  () => {
    _online = true;
    emitOnline();
    // Try to drain any queued writes the moment we get connectivity.
    drainOutbox().catch((e) => console.warn("drainOutbox failed:", e));
  });
  window.addEventListener("offline", () => {
    _online = false;
    emitOnline();
  });
}

export const syncStatus = {
  isOnline() { return _online; },
  onChange(cb) {
    onlineListeners.add(cb);
    // fire current state once so subscribers can initialise.
    cb(_online);
    return () => onlineListeners.delete(cb);
  },
};

// --------------------------------------------------------------------------
// Firestore <-> IndexedDB mirroring
// --------------------------------------------------------------------------

// Internal: keep the active unsubscribe fns so we can stop on demand.
let _unsubs = [];

// Local pub-sub for components that want a single source of truth.
const empSubs = new Set();
const attSubs = new Set();

function emitEmployees(list) { for (const cb of empSubs) cb(list); }
function emitAttendance(list) { for (const cb of attSubs) cb(list); }

export function subscribeEmployees(cb) {
  empSubs.add(cb);
  // Push the current cache immediately so the UI never flashes empty.
  localGetEmployees().then(emitListIfMatch(empSubs, cb)).catch(() => {});
  return () => empSubs.delete(cb);
}

export function subscribeAttendance(cb) {
  attSubs.add(cb);
  localGetAttendance().then(emitListIfMatch(attSubs, cb)).catch(() => {});
  return () => attSubs.delete(cb);
}

function emitListIfMatch(set, cb) {
  return (list) => { if (set.has(cb)) cb(list); };
}

// Start mirroring Firestore -> IndexedDB. Call once on app boot.
export function startSync() {
  if (_unsubs.length) return; // already running

  try {
    _unsubs.push(
      onSnapshot(collection(firestore, "employees"), async (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        await localReplaceAllEmployees(list);
        emitEmployees(list);
        await metaSet("lastEmployeeSync", Date.now());
      }, (err) => {
        console.warn("Firestore employees subscribe error:", err);
      })
    );

    _unsubs.push(
      onSnapshot(collection(firestore, "attendance"), async (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        await localReplaceAllAttendance(list);
        emitAttendance(list);
        await metaSet("lastAttendanceSync", Date.now());
      }, (err) => {
        console.warn("Firestore attendance subscribe error:", err);
      })
    );
  } catch (err) {
    console.warn("startSync failed (offline?):", err);
  }

  // Try draining the outbox on boot too, just in case the user
  // reopened the app while online with pending writes.
  drainOutbox().catch(() => {});
}

export function stopSync() {
  _unsubs.forEach((u) => { try { u(); } catch (_) {} });
  _unsubs = [];
}

// --------------------------------------------------------------------------
// Offline-first write API used by the rest of the app
// --------------------------------------------------------------------------

// Save (or queue) an employee. Returns the locally-stored employee object.
export async function saveEmployee(employee) {

  // Normalise enrolledAt to ms so it sorts/serialises cleanly.
  const enrolledAtMs = toMs(employee.enrolledAt) || Date.now();

  // First, write locally so the UI sees it instantly.
  const local = await localPutEmployee({
    ...employee,
    enrolledAt: enrolledAtMs,
  });
  emitEmployees(await localGetEmployees());

  if (_online) {
    try {
      const ref = await addDoc(collection(firestore, "employees"), {
        ...employee,
        enrolledAt: Timestamp.fromMillis(enrolledAtMs),
      });
      // Replace temp id with the real Firestore id.
      await localDeleteEmployee(local.id);
      const merged = { ...local, id: ref.id };
      await localPutEmployee(merged);
      emitEmployees(await localGetEmployees());
      return merged;
    } catch (err) {
      console.warn("saveEmployee online write failed, queuing:", err);
      await outboxPush("saveEmployee", {
        ...employee,
        enrolledAt: enrolledAtMs,
        tempId: local.id,
      });
    }
  } else {
    await outboxPush("saveEmployee", {
      ...employee,
      enrolledAt: enrolledAtMs,
      tempId: local.id,
    });
  }

  return local;
}

// Save (or queue) an attendance row.
export async function saveAttendance(entry) {

  const timeMs = toMs(entry.time) || Date.now();

  const local = await localPutAttendance({
    ...entry,
    timeMs,
    // keep `time` as a JS Date for backwards-compat with existing UI
    time: new Date(timeMs),
  });
  emitAttendance(await localGetAttendance());

  if (_online) {
    try {
      const ref = await addDoc(collection(firestore, "attendance"), {
        ...entry,
        time: Timestamp.fromMillis(timeMs),
      });
      // swap temp id for real id
      const db = await import("./localDb");
      await db.localPutAttendance({ ...local, id: ref.id });
      emitAttendance(await localGetAttendance());
      return { ...local, id: ref.id };
    } catch (err) {
      console.warn("saveAttendance online write failed, queuing:", err);
      await outboxPush("saveAttendance", {
        ...entry,
        timeMs,
        tempId: local.id,
      });
    }
  } else {
    await outboxPush("saveAttendance", {
      ...entry,
      timeMs,
      tempId: local.id,
    });
  }

  return local;
}

// Delete (or queue delete of) an employee + cascade their attendance.
export async function deleteEmployee(employee) {

  if (!employee || !employee.id) {
    throw new Error("deleteEmployee: employee.id is required");
  }

  // Local cascade first.
  await localDeleteEmployee(employee.id);
  let removed = 0;
  if (employee.name) {
    removed = await localDeleteAttendanceByName(employee.name);
  }
  emitEmployees(await localGetEmployees());
  emitAttendance(await localGetAttendance());

  if (_online) {
    try {
      // Don't try to deleteDoc for a still-pending temp id.
      if (!String(employee.id).startsWith("emp_")) {
        await deleteDoc(doc(firestore, "employees", employee.id));
      }
      if (employee.name) {
        const q = query(
          collection(firestore, "attendance"),
          where("name", "==", employee.name)
        );
        const snap = await getDocs(q);
        if (!snap.empty) {
          const batch = writeBatch(firestore);
          snap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      return { removedAttendance: removed };
    } catch (err) {
      console.warn("deleteEmployee online failed, queuing:", err);
      await outboxPush("deleteEmployee", {
        id: employee.id,
        name: employee.name,
      });
    }
  } else {
    await outboxPush("deleteEmployee", {
      id: employee.id,
      name: employee.name,
    });
  }

  return { removedAttendance: removed };
}

// --------------------------------------------------------------------------
// OUTBOX DRAIN  —  push queued offline writes to Firestore
// --------------------------------------------------------------------------

let _draining = false;

export async function drainOutbox() {
  if (!_online)  return;
  if (_draining) return;
  _draining = true;

  try {
    const items = await outboxPeekAll();
    for (const item of items) {
      try {
        switch (item.op) {

          case "saveEmployee": {
            const { tempId: _tid, enrolledAt, ...rest } = item.payload;
            const ref = await addDoc(collection(firestore, "employees"), {
              ...rest,
              enrolledAt: Timestamp.fromMillis(enrolledAt || Date.now()),
            });
            // Real-time onSnapshot will mirror the new doc back,
            // so we can drop the temp local row now.
            if (_tid) await localDeleteEmployee(_tid);
            break;
          }

          case "saveAttendance": {
            const { tempId: _tid, timeMs, ...rest } = item.payload;
            await addDoc(collection(firestore, "attendance"), {
              ...rest,
              time: Timestamp.fromMillis(timeMs || Date.now()),
            });
            break;
          }

          case "deleteEmployee": {
            const { id, name } = item.payload;
            if (id && !String(id).startsWith("emp_")) {
              await deleteDoc(doc(firestore, "employees", id));
            }
            if (name) {
              const q = query(
                collection(firestore, "attendance"),
                where("name", "==", name)
              );
              const snap = await getDocs(q);
              if (!snap.empty) {
                const batch = writeBatch(firestore);
                snap.docs.forEach((d) => batch.delete(d.ref));
                await batch.commit();
              }
            }
            break;
          }

          default:
            console.warn("Unknown outbox op:", item.op);
        }

        await outboxDelete(item.id);

      } catch (err) {
        // If a single item fails (e.g. we lost connectivity again),
        // stop draining and try again next time.
        console.warn("Outbox item failed; will retry later:", item, err);
        break;
      }
    }
  } finally {
    _draining = false;
  }

  return outboxCount();
}

export { outboxCount };
