// Database facade
import {
  saveEmployee,
  getEmployees,
  deleteEmployee,
  subscribeEmployees,
  saveAttendance,
  getAttendance,
  subscribeAttendance,
  tempId,
  toMs,
} from "./syncService";

// Export as a db object for convenience
export const db = {
  saveEmployee,
  getEmployees,
  deleteEmployee,
  subscribeEmployees,
  saveAttendance,
  getAttendance,
  subscribeAttendance,
};

// Re-export helpers
export { tempId, toMs };