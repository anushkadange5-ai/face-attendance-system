// Sync service — wires IndexedDB (localDb.js) to Firestore.
// Keeps IndexedDB as the single source of truth for the UI and
// pushes writes upstream whenever we're online.

import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, where, getDocs, writeBatch } from "firebase/firestore";

// Firebase config - inline to avoid import issues
const firebaseConfig = {
  apiKey: "AIzaSyBjhqij7zlfj2hnDEwp0w8WnSeT5TJAFbU",
  authDomain: "faceattendancesystem-75a39.firebaseapp.com",
  projectId: "faceattendancesystem-75a39",
  storageBucket: "faceattendancesystem-75a39.firebasestorage.app",
  messagingSenderId: "823910435683",
  appId: "1:823910435683:web:d49d80c5b92fff0ca4a156",
};

let app = null;
let db = null;

function getDb() {
  if (!db) {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  }
  return db;
}

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
// Start sync — open Firestore subscriptions and mirror to IndexedDB
// -----------------------------------------------------------------------

export async function startSync() {
  const firestoreDb = getDb();

  // Subscribe to employees collection
  try {
    const empCollection = collection(firestoreDb, "employees");
    onSnapshot(empCollection, (snap) => {
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
    const attCollection = collection(firestoreDb, "attendance");
    onSnapshot(attCollection, (snap) => {
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
// Drain outbox
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
      break;
    }
  }
}

async function drainItem(item) {
  const firestoreDb = getDb();

  switch (item.op) {
    case "saveEmployee": {
      const data = item.payload;
      const docRef = doc(firestoreDb, "employees", data.id);
      await setDoc(docRef, data);
      break;
    }
    case "saveAttendance": {
      const data = item.payload;
      const docRef = doc(firestoreDb, "attendance", data.id);
      await setDoc(docRef, data);
      break;
    }
    case "deleteEmployee": {
      const { id, name } = item.payload;
      if (id) {
        await deleteDoc(doc(firestoreDb, "employees", id));
      }
      if (name) {
        const q = query(collection(firestoreDb, "attendance"), where("name", "==", name));
        const snap = await getDocs(q);
        if (!snap.empty) {
          const batch = writeBatch(firestoreDb);
          snap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      break;
    }
  }
}

// -----------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------

export async function saveEmployee(employee) {
  await localPutEmployee(employee);

  if (syncStatus.isOnline()) {
    try {
      const firestoreDb = getDb();
      await setDoc(doc(firestoreDb, "employees", employee.id), employee);
    } catch (err) {
      console.warn("Firestore write failed, queuing:", err);
      await outboxPush("saveEmployee", employee);
    }
  } else {
    await outboxPush("saveEmployee", employee);
  }

  return employee;
}

export async function getEmployees() {
  return localGetEmployees();
}

export async function deleteEmployee(employee) {
  await localDeleteEmployee(employee.id);
  const removedAttendance = await localDeleteAttendanceByName(employee.name);

  if (syncStatus.isOnline()) {
    try {
      const firestoreDb = getDb();
      await deleteDoc(doc(firestoreDb, "employees", employee.id));
      
      const q = query(collection(firestoreDb, "attendance"), where("name", "==", employee.name));
      const snap = await getDocs(q);
      if (!snap.empty) {
        const batch = writeBatch(firestoreDb);
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

  const interval = setInterval(async () => {
    callback(await localGetEmployees());
  }, 2000);

  const offOnline = syncStatus.onChange(async () => {
    callback(await localGetEmployees());
  });

  return () => {
    clearInterval(interval);
    offOnline();
  };
}

export async function saveAttendance(entry) {
  if (!entry.timeMs) {
    entry.timeMs = toMs(entry.time) || Date.now();
  }

  await localPutAttendance(entry);

  if (syncStatus.isOnline()) {
    try {
      const firestoreDb = getDb();
      await setDoc(doc(firestoreDb, "attendance", entry.id), entry);
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
  localGetAttendance().then(callback);

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

export { tempId, toMs };