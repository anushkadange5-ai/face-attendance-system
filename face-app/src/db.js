// Backwards-compatible facade. Every component in the app talks to
// `db` — we just route those calls into the offline-first
// syncService.js so the UI keeps working without internet, and the
// outbox handles the eventual push to Firestore.

import {
  saveEmployee  as syncSaveEmployee,
  saveAttendance as syncSaveAttendance,
  deleteEmployee as syncDeleteEmployee,
  subscribeEmployees,
  subscribeAttendance,
} from "./syncService";

import {
  localGetEmployees,
  localGetAttendance,
} from "./localDb";

export const db = {

  // ---- EMPLOYEES --------------------------------------------------

  async saveEmployee(employee) {
    return syncSaveEmployee(employee);
  },

  async getEmployees() {
    return localGetEmployees();
  },

  async deleteEmployee(employee) {
    return syncDeleteEmployee(employee);
  },

  subscribeEmployees(callback) {
    return subscribeEmployees(callback);
  },

  // ---- ATTENDANCE -------------------------------------------------

  async saveAttendance(entry) {
    return syncSaveAttendance(entry);
  },

  async getAttendance() {
    return localGetAttendance();
  },

  subscribeAttendance(callback) {
    return subscribeAttendance(callback);
  },

};
