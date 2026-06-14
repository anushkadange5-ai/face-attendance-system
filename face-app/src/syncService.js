// Sync service — wires IndexedDB (localDb.js) to Firestore.
import { db } from "./firebase";
import { collection, doc, setDoc, deleteDoc, onSnapshot, query, where, getDocs, writeBatch } from "firebase/firestore";

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
  tempId,
  toMs,
} from "./localDb";

// -----------------------------------------------------------------------
// Sync status pub-sub
// -----------------------------------------------------------------------

export const syncStatus = (() => {
  let online = navigator.onLine;
  let listeners = new Set();
  window.addEventListener("online", () => { online = true; emit(); });
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
// Start sync
// -----------------------------------------------------------------------

export async function startSync() {
  try {
    const empCollection = collection(db, "employees");
    onSnapshot(empCollection, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      localReplaceAllEmployees(list);
    }, (err) => { console.warn("Employees sync error:", err); });
  } catch (e) { console.warn("Could not subscribe to employees:", e); }

  try {
    const attCollection = collection(db, "attendance");
    onSnapshot(attCollection, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data(), timeMs: toMs(d.data().time) }));
      localReplaceAllAttendance(list);
    }, (err) => { console.warn("Attendance sync error:", err); });
  } catch (e) { console.warn("Could not subscribe to attendance:", e); }

  setTimeout(drainOutbox, 1000);
  window.addEventListener("online", () => { console.log("🌐 Online — draining outbox"); setTimeout(drainOutbox, 500); });
}

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
      break;
    }
  }
}

async function drainItem(item) {
  switch (item.op) {
    case "saveEmployee": {
      await setDoc(doc(db, "employees", item.payload.id), item.payload);
      break;
    }
    case "saveAttendance": {
      await setDoc(doc(db, "attendance", item.payload.id), item.payload);
      break;
    }
    case "deleteEmployee": {
      const { id, name } = item.payload;
      if (id) await deleteDoc(doc(db, "employees", id));
      if (name) {
        const q = query(collection(db, "attendance"), where("name", "==", name));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const batch = writeBatch(db);
          snap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      break;
    }
  }
}

export async function saveEmployee(employee) {
  await localPutEmployee(employee);
  if (syncStatus.isOnline()) {
    try {
      await setDoc(doc(db, "employees", employee.id), employee);
    } catch (err) {
      console.warn("Firestore write failed, queuing:", err);
      await outboxPush("saveEmployee", employee);
    }
  } else {
    await outboxPush("saveEmployee", employee);
  }
  return employee;
}

export async function getEmployees() { return localGetEmployees(); }

export async function deleteEmployee(employee) {
  await localDeleteEmployee(employee.id);
  const removedAttendance = await localDeleteAttendanceByName(employee.name);
  if (syncStatus.isOnline()) {
    try {
      await deleteDoc(doc(db, "employees", employee.id));
      const q = query(collection(db, "attendance"), where("name", "==", employee.name));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const batch = writeBatch(db);
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
  localGetEmployees().then(callback);
  const interval = setInterval(async () => { callback(await localGetEmployees()); }, 2000);
  const offOnline = syncStatus.onChange(async () => { callback(await localGetEmployees()); });
  return () => { clearInterval(interval); offOnline(); };
}

export async function saveAttendance(entry) {
  if (!entry.timeMs) entry.timeMs = toMs(entry.time) || Date.now();
  await localPutAttendance(entry);
  if (syncStatus.isOnline()) {
    try {
      await setDoc(doc(db, "attendance", entry.id), entry);
    } catch (err) {
      console.warn("Firestore attendance write failed, queuing:", err);
      await outboxPush("saveAttendance", entry);
    }
  } else {
    await outboxPush("saveAttendance", entry);
  }
  return entry;
}

export async function getAttendance() { return localGetAttendance(); }

export function subscribeAttendance(callback) {
  localGetAttendance().then(callback);
  const interval = setInterval(async () => { callback(await localGetAttendance()); }, 2000);
  const offOnline = syncStatus.onChange(async () => { callback(await localGetAttendance()); });
  return () => { clearInterval(interval); offOnline(); };
}

export async function outboxCount() {
  const items = await outboxPeekAll();
  return items.length;
}

export { tempId, toMs };