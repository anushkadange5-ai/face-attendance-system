import { openDB } from 'idb';

const DB_NAME = 'FaceAttendanceDB';
const DB_VERSION = 1;

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains('employees')) {
      db.createObjectStore('employees', { keyPath: 'id', autoIncrement: true });
    }
    if (!db.objectStoreNames.contains('attendance')) {
      db.createObjectStore('attendance', { keyPath: 'id', autoIncrement: true });
    }
  },
});

export const db = {
  async saveEmployee(employee) {
    return (await dbPromise).put('employees', employee);
  },
  async getEmployees() {
    return (await dbPromise).getAll('employees');
  },
  async saveAttendance(entry) {
    return (await dbPromise).put('attendance', entry);
  },
  async getAttendance() {
    return (await dbPromise).getAll('attendance');
  },
  // RULE 7: Helper function to get today's records for a specific employee
  async getTodayAttendance(employeeName) {
    const all = await (await dbPromise).getAll('attendance');
    const today = new Date().toDateString();
    return all.filter(entry => 
      entry.employeeName === employeeName && 
      new Date(entry.timestamp).toDateString() === today
    );
  }
};