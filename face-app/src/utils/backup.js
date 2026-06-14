// Data backup and restore utilities
import { saveAs } from "file-saver";
import { toJsDate } from "./time";

const BACKUP_VERSION = "1.0";

// Create comprehensive backup
export async function createBackup(employees, attendance, settings) {
  const backup = {
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    type: "face-attendance-system",
    
    // Sanitize employees (remove large photo data for backup size)
    employees: employees.map(emp => ({
      id: emp.id,
      name: emp.name,
      employeeId: emp.employeeId || "",
      department: emp.department || "",
      role: emp.role || "employee",
      shift: emp.shift || "general",
      descriptor: emp.descriptor ? "[ENCRYPTED_EMBEDDING]" : null,
      enrolledAt: emp.enrolledAt,
      lastActive: emp.lastActive || null,
    })),

    // Attendance records
    attendance: attendance.map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      time: a.time,
      timeMs: a.timeMs,
    })),

    // Settings snapshot
    settings: settings,

    // Stats
    stats: {
      totalEmployees: employees.length,
      totalAttendanceRecords: attendance.length,
    }
  };

  return backup;
}

// Download backup as JSON file
export function downloadBackup(backup) {
  const filename = `face-attendance-backup-${new Date().toISOString().split('T')[0]}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json;charset=utf-8"
  });
  saveAs(blob, filename);
  return filename;
}

// Restore from backup file
export function parseBackupFile(fileContent) {
  try {
    const backup = JSON.parse(fileContent);
    
    // Validate backup structure
    if (!backup.version || !backup.employees || !backup.attendance) {
      throw new Error("Invalid backup file format");
    }

    return {
      success: true,
      data: backup
    };
  } catch (e) {
    return {
      success: false,
      error: e.message
    };
  }
}

// Import backup data
export async function importBackup(backup, options = {}) {
  const {
    mergeStrategy = "skip-existing", // "skip-existing" | "overwrite" | "merge"
    employees = [],
    attendance = []
  } = options;

  const results = {
    employees: { added: 0, skipped: 0, errors: [] },
    attendance: { added: 0, skipped: 0, errors: [] }
  };

  // Import employees
  for (const emp of backup.employees) {
    try {
      const exists = employees.some(e => 
        (e.id === emp.id) || 
        (e.employeeId && e.employeeId === emp.employeeId) ||
        (e.name === emp.name)
      );

      if (exists && mergeStrategy === "skip-existing") {
        results.employees.skipped++;
        continue;
      }

      if (exists && mergeStrategy === "overwrite") {
        // Handle overwrite - could update existing
        results.employees.skipped++; // simplified for now
        continue;
      }

      results.employees.added++;
    } catch (e) {
      results.employees.errors.push(e.message);
    }
  }

  // Import attendance
  for (const att of backup.attendance) {
    try {
      const exists = attendance.some(a => a.id === att.id);
      
      if (exists && mergeStrategy === "skip-existing") {
        results.attendance.skipped++;
        continue;
      }

      results.attendance.added++;
    } catch (e) {
      results.attendance.errors.push(e.message);
    }
  }

  return results;
}

// Export attendance as CSV
export function exportAttendanceCSV(attendance, employees) {
  const headers = [
    "Employee ID",
    "Name",
    "Department",
    "Date",
    "Login Time",
    "Logout Time",
    "Working Hours",
    "Status"
  ];

  // Build employee lookup
  const empLookup = {};
  employees.forEach(emp => {
    empLookup[emp.name] = emp;
  });

  // Group attendance by employee and date
  const grouped = {};
  attendance.forEach(a => {
    const emp = empLookup[a.name] || {};
    const time = toJsDate(a.time);
    if (!time) return;
    
    const dateKey = time.toLocaleDateString();
    const empKey = a.name;
    
    if (!grouped[empKey]) grouped[empKey] = {};
    if (!grouped[empKey][dateKey]) grouped[empKey][dateKey] = [];
    grouped[empKey][dateKey].push({ ...a, _t: time });
  });

  // Generate rows
  const rows = [];
  Object.entries(grouped).forEach(([name, dates]) => {
    const emp = empLookup[name] || {};
    
    Object.entries(dates).forEach(([date, logs]) => {
      logs.sort((a, b) => a._t - b._t);
      
      const loginLog = logs.find(l => l.type === "LOGIN");
      const logoutLog = [...logs].reverse().find(l => l.type === "LOGOUT");
      
      let workingHours = "";
      let status = "Present";
      
      if (loginLog && logoutLog) {
        const diff = (logoutLog._t - loginLog._t) / (1000 * 60 * 60);
        workingHours = diff.toFixed(2);
        
        // Check for late/early
        if (loginLog._t.getHours() > 9) status = "Late";
        if (logoutLog && logoutLog._t.getHours() < 17) status = "Half Day";
      } else if (loginLog && !logoutLog) {
        status = "Incomplete";
      }

      rows.push([
        emp.employeeId || "",
        name,
        emp.department || "",
        date,
        loginLog ? loginLog._t.toLocaleTimeString() : "",
        logoutLog ? logoutLog._t.toLocaleTimeString() : "",
        workingHours,
        status
      ]);
    });
  });

  // Create CSV
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
  const filename = `attendance-report-${new Date().toISOString().split('T')[0]}.csv`;
  saveAs(blob, filename);
  
  return filename;
}