import {
  collection,
  addDoc,
  getDocs,
  onSnapshot
} from "firebase/firestore";

import { firestore } from "./firebase";

export const db = {

  // EMPLOYEES

  async saveEmployee(employee) {

    await addDoc(
      collection(
        firestore,
        "employees"
      ),
      employee
    );

  },

  async getEmployees() {

    const snapshot =
      await getDocs(
        collection(
          firestore,
          "employees"
        )
      );

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

  },

  // ATTENDANCE

  async saveAttendance(entry) {

    await addDoc(
      collection(
        firestore,
        "attendance"
      ),
      entry
    );

  },

  async getAttendance() {

    const snapshot =
      await getDocs(
        collection(
          firestore,
          "attendance"
        )
      );

    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

  },

  // REALTIME ATTENDANCE

  subscribeAttendance(callback) {

    return onSnapshot(
      collection(
        firestore,
        "attendance"
      ),
      (snapshot) => {

        const data =
          snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));

        callback(data);

      }
    );

  },

  // REALTIME EMPLOYEES

  subscribeEmployees(callback) {

    return onSnapshot(
      collection(
        firestore,
        "employees"
      ),
      (snapshot) => {

        const data =
          snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));

        callback(data);

      }
    );

  }

};