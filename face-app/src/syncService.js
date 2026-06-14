// Sync service — wires IndexedDB (localDb.js) to Firestore.
// Keeps IndexedDB as the single source of truth for the UI and
// pushes writes upstream whenever we're online.

import {
  localGetEmployees,
  localPutEmployee,
  localDeleteEmployee,
  localReplaceAllEmployees,
  localGetAttendance,
  localPutAttendance,
  localDeleteAttendanceByName,
  localReplaceAllAttendance,
  outboxPush,
  outboxPeekAll,
  outboxDelete,
  metaSet,
  metaGet,
  tempId,
  toMs,
} from "./localDb";

// -----------------------------------------------------------------------
// Sync status pub-sub
// -----------------------------------------------------------------------

export const syncStatus = (() => {
  let online    = navigator.onLine;
  let listeners = new Set();

  window.addEventListener("online",  () => { online = true;  emit(); });
  window.addEventListener("offline", () => { online = false; emit(); });

  function emit() { listeners.forEach((fn) => fn(online)); }

  return {
    isOnline: () => online,
    onChange: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
})();

// -----------------------------------------------------------------------
// Firestore refs (lazy — don't init until we actually sync)
// -----------------------------------------------------------------------

let _employeesRef = null;
let _attendanceRef = null;
let _unsubEmp = null;
let _unsubAtt = null;

async function getFirestore() {
  const { db } = await import("./firebase");
  return db;
}

async function employeesRef() {
  if (!_employeesRef) {
    const db = await getFirestore();
    _employeesRef = db.collection("employees");
  }
  return _employeesRef;
}

async function attendanceRef() {
  if (!_attendanceRef) {
    const db = await getFirestore();
    _attendanceRef = db.collection("attendance");
  }
  return _attendanceRef;
}

// -----------------------------------------------------------------------
// Start sync — open Firestore subscriptions and mirror to IndexedDB
// -----------------------------------------------------------------------

export async function startSync() {

  // Subscribe to employees collection
  try {
    const ref = await employeesRef();
    _unsubEmp = ref.onSnapshot((snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      localReplaceAllEmployees(list);
    }, (err) => {
      console.warn("Employees sync error:", err);
    });
  } catch (e) {
    console.warn("Could not subscribe to employees:", e);
  }

  // Subscribe to attendance collection
  try {
    const ref = await attendanceRef();
    _unsubAtt = ref.onSnapshot((snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data(), timeMs: toMs(d.data().time) }));
      localReplaceAllAttendance(list);
    }, (err) => {
      console.warn("Attendance sync error:", err);
    });
  } catch (e) {
    console.warn("Could not subscribe to attendance:", e);
  }

  // Drain outbox on boot
  setTimeout(drainOutbox, 1000);

  // Drain outbox on every "online" event
  window.addEventListener("online", () => {
    console.log("🌐 Online — draining outbox");
    setTimeout(drainOutbox, 500);
  });

}

// -----------------------------------------------------------------------
// Drain outbox — push pending writes to Firestore in order
// -----------------------------------------------------------------------

async function drainOutbox() {
  if (!syncStatus.isOnline()) return;

  const items = await outboxPeekAll();
  if (!items.length) return;

  console.log(`Draining outbox (${items.length} items)…`);

  for (const item of items) {
    try {
      await drainItem(item);
      await outboxDelete(item.id);
      console.log(`  ✅ Synced ${item.op}:`, item.payload?.name || item.payload?.id);
    } catch (err) {
      console.warn(`  ❌ Failed to sync ${item.op}:`, err);
      // Stop here — next online event will retry from where we left off
      break;
    }
  }
}

async function drainItem(item) {
  const ref = await employeesRef();
  const attRef = await attendanceRef();

  switch (item.op) {
    case "saveEmployee": {
      const data = item.payload;
      // If it has a temp id but no Firestore id yet, add it
      const id = data.id?.startsWith("emp_") ? data.id : data.id;
      await ref.doc(id).set(data);
      break;
    }
    case "saveAttendance": {
      const data = item.payload;
      const id = data.id?.startsWith("att_") ? data.id : data.id;
      await attRef.doc(id).set(data);
      break;
    }
    case "deleteEmployee": {
      const { id, name } = item.payload;
      if (id) {
        await ref.doc(id).delete();
      }
      if (name) {
        // Cascade delete all attendance for this employee
        const snap = await attRef.where("name", "==", name).get();
        if (!snap.empty) {
          const batch = (await getFirestore()).batch();
          snap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      break;
    }
  }
}

// -----------------------------------------------------------------------
// Public API (mirrors original db.js signatures)
// -----------------------------------------------------------------------

export async function saveEmployee(employee) {
  // Always write to IndexedDB first (instant UI update)
  await localPutEmployee(employee);

  if (syncStatus.isOnline()) {
    // Try to write to Firestore
    try {
      const ref = await employeesRef();
      await ref.doc(employee.id).set(employee);
    } catch (err) {
      // Firestore write failed — queue for later
      console.warn("Firestore write failed, queuing:", err);
      await outboxPush("saveEmployee", employee);
    }
  } else {
    // Offline — queue the write
    await outboxPush("saveEmployee", employee);
  }

  return employee;
}

export async function getEmployees() {
  return localGetEmployees();
}

export async function deleteEmployee(employee) {
  // Delete locally first
  await localDeleteEmployee(employee.id);

  // Cascade delete attendance locally
  const removedAttendance = await localDeleteAttendanceByName(employee.name);

  if (syncStatus.isOnline()) {
    try {
      const ref = await employeesRef();
      await ref.doc(employee.id).delete();

      // Cascade delete from Firestore
      const attRef = await attendanceRef();
      const snap = await attRef.where("name", "==", employee.name).get();
      if (!snap.empty) {
        const batch = (await getFirestore()).batch();
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    } catch (err) {
      console.warn("Firestore delete failed, queuing:", err);
      await outboxPush("deleteEmployee", { id: employee.id, name: employee.name });
    }
  } else {
    await outboxPush("deleteEmployee", { id: employee.id, name: employee.name });
  }

  return { removedAttendance };
}

export function subscribeEmployees(callback) {
  // Immediately call with current local data
  localGetEmployees().then(callback);

  // Subscribe to local changes (triggered by sync updates)
  const interval = setInterval(async () => {
    callback(await localGetEmployees());
  }, 2000);

  // Also listen for online changes to refresh
  const offOnline = syncStatus.onChange(async () => {
    callback(await localGetEmployees());
  });

  return () => {
    clearInterval(interval);
    offOnline();
  };
}

export async function saveAttendance(entry) {
  // Normalize time
  if (!entry.timeMs) {
    entry.timeMs = toMs(entry.time) || Date.now();
  }

  // Always write locally first
  await localPutAttendance(entry);

  if (syncStatus.isOnline()) {
    try {
      const ref = await attendanceRef();
      await ref.doc(entry.id).set(entry);
    } catch (err) {
      console.warn("Firestore attendance write failed, queuing:", err);
      await outboxPush("saveAttendance", entry);
    }
  } else {
    await outboxPush("saveAttendance", entry);
  }

  return entry;
}

export async function getAttendance() {
  return localGetAttendance();
}

export function subscribeAttendance(callback) {
  // Immediately call with current local data
  localGetAttendance().then(callback);

  // Poll for updates (simple but reliable)
  const interval = setInterval(async () => {
    callback(await localGetAttendance());
  }, 2000);

  const offOnline = syncStatus.onChange(async () => {
    callback(await localGetAttendance());
  });

  return () => {
    clearInterval(interval);
    offOnline();
  };
}

export async function outboxCount() {
  const items = await outboxPeekAll();
  return items.length;
}

// Export tempId and toMs for convenience
export { tempId, toMs };