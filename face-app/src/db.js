// Database facade — re-exports syncService methods under the original
// names so no existing component has to change.
//
// For new code that needs fine-grained control, import directly from
// localDb.js or syncService.js.

// Import all sync service functions
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

// Re-export helpers for convenience
export { tempId, toMs } from "./syncService";