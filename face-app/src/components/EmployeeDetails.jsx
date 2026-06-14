import { useState, useMemo } from "react";
import { toJsDate } from "../utils/time";
import { exportPDF } from "../utils/exportPDF";
import { exportExcel } from "../utils/exportExcel";
import {
  DEFAULT_SHIFT_ID,
  getShift,
  isLateLogin,
  isEarlyLogout,
} from "../utils/shifts";

function EmployeeDetails({
  employee,
  attendance,
  onClose,
}) {

  const [month, setMonth] = useState("all");

  // Build employee records
  const allRecords = useMemo(() => {
    return attendance
      .filter((a) => a.name === employee.name)
      .map((a) => ({ ...a, _t: toJsDate(a.time) }))
      .filter((a) => a._t)
      .sort((a, b) => a._t - b._t);
  }, [attendance, employee.name]);

  // Distinct months
  const monthOptions = useMemo(() => {
    const set = new Set();
    allRecords.forEach((r) => {
      const y = r._t.getFullYear();
      const m = String(r._t.getMonth() + 1).padStart(2, "0");
      set.add(`${y}-${m}`);
    });
    return [...set].sort().reverse();
  }, [allRecords]);

  // Filtered records
  const records = useMemo(() => {
    if (month === "all") return allRecords;
    return allRecords.filter((r) => {
      const y = r._t.getFullYear();
      const m = String(r._t.getMonth() + 1).padStart(2, "0");
      return `${y}-${m}` === month;
    });
  }, [allRecords, month]);

  // Stats
  const shiftId = employee.shift || DEFAULT_SHIFT_ID;
  const shift = getShift(shiftId);

  const stats = useMemo(() => {
    const byDate = {};
    records.forEach((r) => {
      const key = r._t.toLocaleDateString();
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(r);
    });

    let presentDays = 0;
    let lateCount = 0;
    let halfDays = 0;
    let totalHours = 0;

    Object.values(byDate).forEach((day) => {
      presentDays++;
      day.sort((a, b) => a._t - b._t);

      const login = day.find((d) => d.type === "LOGIN");
      const logout = [...day].reverse().find((d) => d.type === "LOGOUT");

      if (login && isLateLogin(login._t, shiftId)) lateCount++;
      if (login && logout && isEarlyLogout(login._t, logout._t, shiftId)) halfDays++;
      if (login && logout && logout._t > login._t) {
        totalHours += (logout._t - login._t) / (1000 * 60 * 60);
      }
    });

    return { presentDays, lateCount, halfDays, totalHours: totalHours.toFixed(1) };
  }, [records, shiftId]);

  // Export handlers
  const safeName = employee.name.replace(/\s+/g, "_");
  const suffix = month === "all" ? "all-time" : month;
  const fileBase = `${safeName}-attendance-${suffix}`;

  const handlePDF = () => {
    if (records.length === 0) {
      alert("No records to export.");
      return;
    }
    exportPDF(records, {
      title: `Attendance Report — ${employee.name} (${suffix})`,
      filename: fileBase,
    });
  };

  const handleExcel = () => {
    if (records.length === 0) {
      alert("No records to export.");
      return;
    }
    exportExcel(records, { filename: fileBase, sheetName: employee.name.slice(0, 28) });
  };

  // Role icons
  const roleIcons = {
    admin: "🔐",
    manager: "👔",
    employee: "👤"
  };

  return (
    <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4">
      <div className="bg-[#111] w-full max-w-5xl rounded-3xl p-6 md:p-8 border border-green-500/20 max-h-[95vh] overflow-y-auto">

        {/* TOP */}
        <div className="flex flex-wrap justify-between items-start mb-6 gap-4">

          <div className="flex items-start gap-4">
            <img
              src={employee.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(employee.name)}&background=22c55e&color=fff&size=128`}
              alt={employee.name}
              className="w-20 h-20 rounded-full object-cover border-2 border-green-500"
            />
            
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-green-400">
                {employee.name}
              </h1>
              
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="bg-green-500/20 border border-green-500/40 rounded-lg px-3 py-1 text-sm">
                  🏷️ {employee.employeeId || "No ID"}
                </span>
                <span className="bg-blue-500/20 border border-blue-500/40 rounded-lg px-3 py-1 text-sm">
                  📁 {employee.department || "Other"}
                </span>
                <span className="bg-purple-500/20 border border-purple-500/40 rounded-lg px-3 py-1 text-sm">
                  {roleIcons[employee.role] || "👤"} {employee.role || "employee"}
                </span>
              </div>

              <div className="mt-2 inline-block bg-green-500/10 border border-green-500/30 rounded-xl px-3 py-1 text-sm">
                <span className="font-bold text-green-400">
                  {shift.emoji} {shift.label}
                </span>
                <span className="text-gray-400 ml-2">
                  {shift.loginAt} – {shift.logoutAt}
                </span>
              </div>

              <p className="text-gray-500 text-sm mt-2">
                Enrolled: {toJsDate(employee.enrolledAt)?.toLocaleDateString() || "Unknown"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="bg-red-500 hover:bg-red-600 px-5 py-3 rounded-xl text-lg font-bold transition"
          >
            ✕ Close
          </button>
        </div>

        {/* CONTROLS */}
        <div className="flex flex-wrap gap-3 items-center mb-6">
          <label className="text-gray-400">Filter:</label>

          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-black border border-green-500 rounded-xl px-4 py-2 text-white"
          >
            <option value="all">All time</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {new Date(`${m}-01`).toLocaleString(undefined, { month: "long", year: "numeric" })}
              </option>
            ))}
          </select>

          <div className="flex-1" />

          <button
            onClick={handlePDF}
            className="bg-red-500 hover:bg-red-600 px-5 py-2 rounded-xl text-lg font-bold transition"
          >
            📄 PDF
          </button>

          <button
            onClick={handleExcel}
            className="bg-green-500 hover:bg-green-600 px-5 py-2 rounded-xl text-lg font-bold transition"
          >
            📊 Excel
          </button>
        </div>

        {/* SUMMARY STATS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Stat label="Present Days" value={stats.presentDays} color="text-green-400" />
          <Stat label="Late Count" value={stats.lateCount} color="text-yellow-400" />
          <Stat label="Half Days" value={stats.halfDays} color="text-blue-400" />
          <Stat label="Working Hours" value={`${stats.totalHours}h`} color="text-purple-400" />
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-black">
                <th className="p-4 text-left text-green-400">Date</th>
                <th className="p-4 text-left text-green-400">Login Time</th>
                <th className="p-4 text-left text-green-400">Logout Time</th>
                <th className="p-4 text-left text-green-400">Working Hours</th>
                <th className="p-4 text-left text-green-400">Status</th>
              </tr>
            </thead>

            <tbody>
              {records.map((record, index) => {
                if (record.type !== "LOGIN") return null;

                const logoutRecord = records[index + 1];
                let logoutTime = "--";
                let workingHours = "--";
                let status = "Present";

                if (logoutRecord && logoutRecord.type === "LOGOUT") {
                  logoutTime = logoutRecord._t.toLocaleTimeString();
                  const diff = (logoutRecord._t - record._t) / 1000 / 60 / 60;
                  workingHours = diff.toFixed(2) + " hrs";
                  
                  // Check status
                  const loginHour = record._t.getHours();
                  const logoutHour = logoutRecord._t.getHours();
                  
                  if (isLateLogin(record._t, shiftId)) {
                    status = "Late";
                  } else if (logoutHour < parseInt(shift.logoutAt.split(":")[0])) {
                    status = "Half Day";
                  }
                }

                return (
                  <tr key={index} className="border-b border-green-500/10">
                    <td className="p-4">{record._t.toLocaleDateString()}</td>
                    <td className="p-4">{record._t.toLocaleTimeString()}</td>
                    <td className="p-4">{logoutTime}</td>
                    <td className="p-4 text-green-400 font-bold">{workingHours}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 rounded-lg text-xs font-bold ${
                        status === "Late" ? "bg-yellow-500/20 text-yellow-400" :
                        status === "Half Day" ? "bg-blue-500/20 text-blue-400" :
                        "bg-green-500/20 text-green-400"
                      }`}>
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })}

              {records.length === 0 && (
                <tr>
                  <td colSpan="5" className="p-6 text-center text-gray-400">
                    No attendance records for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="bg-black rounded-2xl p-4 border border-green-500/10">
      <p className="text-gray-400 text-sm">{label}</p>
      <h2 className={`text-2xl md:text-3xl font-bold mt-1 ${color}`}>{value}</h2>
    </div>
  );
}

export default EmployeeDetails;