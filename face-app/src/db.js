import {
  collection,
  addDoc,
  getDocs,
  onSnapshot,
  doc,
  deleteDoc,
  query,
  where,
  writeBatch,
} from "firebase/firestore";

import { firestore } from "./firebase";

export const db = {

  // EMPLOYEES

  async saveEmployee(employee) {

    await addDoc(
      collection(firestore, "employees"),
      employee
    );

  },

  async getEmployees() {

    const snapshot =
      await getDocs(collection(firestore, "employees"));

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

  },

  // DELETE EMPLOYEE  +  cascade delete their attendance logs
  // employee  -> { id, name, ... }
  // Returns the number of attendance docs that were removed.

  async deleteEmployee(employee) {

    if (!employee || !employee.id) {
      throw new Error("deleteEmployee: employee.id is required");
    }

    // 1) Remove the employee document
    await deleteDoc(doc(firestore, "employees", employee.id));

    // 2) Remove all attendance rows that belong to this person
    //    (matched by name — that's what attendance docs store today)
    let removedAttendance = 0;
    if (employee.name) {
      const q = query(
        collection(firestore, "attendance"),
        where("name", "==", employee.name)
      );
      const snap = await getDocs(q);

      // Use a batch for efficiency (single round trip up to 500 docs)
      if (!snap.empty) {
        const batch = writeBatch(firestore);
        snap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
        removedAttendance = snap.size;
      }
    }

    return { removedAttendance };

  },

  // ATTENDANCE

  async saveAttendance(entry) {

    await addDoc(
      collection(firestore, "attendance"),
      entry
    );

  },

  async getAttendance() {

    const snapshot =
      await getDocs(collection(firestore, "attendance"));

    return snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

  },

  // REALTIME ATTENDANCE

  subscribeAttendance(callback) {

    return onSnapshot(
      collection(firestore, "attendance"),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        callback(data);
      }
    );

  },

  // REALTIME EMPLOYEES

  subscribeEmployees(callback) {

    return onSnapshot(
      collection(firestore, "employees"),
      (snapshot) => {
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        callback(data);
      }
    );

  },

};
