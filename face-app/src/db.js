// Database facade — re-exports syncService methods under the original
// names so no existing component has to change.
//
// For new code that needs fine-grained control, import directly from
// localDb.js or syncService.js.

export {
  // Employees
  saveEmployee,
  getEmployees,
  deleteEmployee,
  subscribeEmployees,

  // Attendance
  saveAttendance,
  getAttendance,
  subscribeAttendance,
} from "./syncService";

// Re-export helpers for convenience
export { tempId, toMs } from "./localDb";