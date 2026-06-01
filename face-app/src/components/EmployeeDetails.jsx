import { useState, useMemo } from "react";
import { toJsDate } from "../utils/time";
import { exportPDF }   from "../utils/exportPDF";
import { exportExcel } from "../utils/exportExcel";

function EmployeeDetails({
  employee,
  attendance,
  onClose,
}) {

  // -----------------------------------------------------------------
  // MONTH PICKER  (defaults to "all" so user sees everything first)
  // -----------------------------------------------------------------

  const [month, setMonth] = useState("all");  // "all"  OR  "YYYY-MM"

  // -----------------------------------------------------------------
  // Build this employee's records once, normalised + sorted oldest-first
  // -----------------------------------------------------------------

  const allRecords = useMemo(() => {
    return attendance
      .filter((a) => a.name === employee.name)
      .map((a) => ({ ...a, _t: toJsDate(a.time) }))
      .filter((a) => a._t)
      .sort((a, b) => a._t - b._t);
  }, [attendance, employee.name]);

  // Distinct months present in the data (for the dropdown)
  const monthOptions = useMemo(() => {
    const set = new Set();
    allRecords.forEach((r) => {
      const y = r._t.getFullYear();
      const m = String(r._t.getMonth() + 1).padStart(2, "0");
      set.add(`${y}-${m}`);
    });
    return [...set].sort().reverse();   // newest first
  }, [allRecords]);

  // Records filtered to the chosen month
  const records = useMemo(() => {
    if (month === "all") return allRecords;
    return allRecords.filter((r) => {
      const y = r._t.getFullYear();
      const m = String(r._t.getMonth() + 1).padStart(2, "0");
      return `${y}-${m}` === month;
    });
  }, [allRecords, month]);

  // -----------------------------------------------------------------
  // SUMMARY STATS  (computed from `records`)
  // -----------------------------------------------------------------

  const stats = useMemo(() => {

    // group by local date
    const byDate = {};
    records.forEach((r) => {
      const key = r._t.toLocaleDateString();
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(r);
    });

    let presentDays = 0;
    let lateCount   = 0;
    let halfDays    = 0;
    let totalHours  = 0;

    Object.values(byDate).forEach((day) => {
      presentDays++;
      day.sort((a, b) => a._t - b._t);

      const login  = day.find((d) => d.type === "LOGIN");
      const logout = [...day].reverse().find((d) => d.type === "LOGOUT");

      if (login && login._t.getHours() >= 9) {
        if (login._t.getHours() > 9 || login._t.getMinutes() > 0) {
          lateCount++;
        }
      }

      if (logout && logout._t.getHours() < 13) {
        halfDays++;
      }

      if (login && logout && logout._t > login._t) {
        totalHours += (logout._t - login._t) / (1000 * 60 * 60);
      }
    });

    return {
      presentDays,
      lateCount,
      halfDays,
      totalHours: totalHours.toFixed(1),
    };

  }, [records]);

  // -----------------------------------------------------------------
  // EXPORT HANDLERS — pass only this employee's records
  // -----------------------------------------------------------------

  const safeName = employee.name.replace(/\s+/g, "_");
  const suffix   = month === "all" ? "all-time" : month;
  const fileBase = `${safeName}-attendance-${suffix}`;

  const handlePDF = () => {
    if (records.length === 0) {
      alert("No records to export for this period.");
      return;
    }
    exportPDF(records, {
      title:    `Attendance Report — ${employee.name} (${suffix})`,
      filename: fileBase,
    });
  };

  const handleExcel = () => {
    if (records.length === 0) {
      alert("No records to export for this period.");
      return;
    }
    exportExcel(records, {
      filename:  fileBase,
      sheetName: employee.name.slice(0, 28) || "Attendance", // 31-char limit
    });
  };

  // -----------------------------------------------------------------
  // UI
  // -----------------------------------------------------------------

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">

      <div className="bg-[#111] w-[95%] max-w-6xl rounded-3xl p-8 border border-green-500/20 max-h-[90vh] overflow-y-auto">

        {/* TOP */}

        <div className="flex justify-between items-start mb-6 gap-4 flex-wrap">

          <div>
            <h1 className="text-5xl font-bold text-green-400">
              {employee.name}
            </h1>
            <p className="text-gray-400 mt-2 text-xl">
              Attendance History
            </p>
          </div>

          <button
            onClick={onClose}
            className="bg-red-500 hover:bg-red-600 px-6 py-3 rounded-2xl text-xl font-bold"
          >
            Close
          </button>

        </div>

        {/* CONTROLS — month filter + export buttons */}

        <div className="flex flex-wrap gap-3 items-center mb-6">

          <label className="text-gray-400 text-lg mr-2">Filter:</label>

          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-black border border-green-500 rounded-xl px-4 py-2 text-white text-lg"
          >
            <option value="all">All time</option>
            {monthOptions.map((m) => (
              <option key={m} value={m}>
                {new Date(`${m}-01`).toLocaleString(undefined, {
                  month: "long",
                  year: "numeric",
                })}
              </option>
            ))}
          </select>

          <div className="flex-1" />

          <button
            onClick={handlePDF}
            className="bg-red-500 hover:bg-red-600 px-5 py-2 rounded-xl text-lg font-bold"
          >
            📄 Export PDF
          </button>

          <button
            onClick={handleExcel}
            className="bg-green-500 hover:bg-green-600 px-5 py-2 rounded-xl text-lg font-bold"
          >
            📊 Export Excel
          </button>

        </div>

        {/* SUMMARY STATS */}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Stat label="Present Days"   value={stats.presentDays} color="text-green-400" />
          <Stat label="Late Count"     value={stats.lateCount}   color="text-yellow-400" />
          <Stat label="Half Days"      value={stats.halfDays}    color="text-blue-400" />
          <Stat label="Working Hours"  value={`${stats.totalHours}h`} color="text-purple-400" />
        </div>

        {/* TABLE */}

        <div className="overflow-x-auto">

          <table className="w-full">

            <thead>
              <tr className="bg-black">
                <th className="p-5 text-left text-green-400 text-xl">Date</th>
                <th className="p-5 text-left text-green-400 text-xl">Login Time</th>
                <th className="p-5 text-left text-green-400 text-xl">Logout Time</th>
                <th className="p-5 text-left text-green-400 text-xl">Working Hours</th>
              </tr>
            </thead>

            <tbody>

              {records.map((record, index) => {

                if (record.type !== "LOGIN") return null;

                const logoutRecord = records[index + 1];

                let logoutTime   = "--";
                let workingHours = "--";

                if (logoutRecord && logoutRecord.type === "LOGOUT") {
                  logoutTime = logoutRecord._t.toLocaleTimeString();
                  const diff =
                    (logoutRecord._t - record._t) / 1000 / 60 / 60;
                  workingHours = diff.toFixed(2) + " hrs";
                }

                return (
                  <tr
                    key={index}
                    className="border-b border-green-500/10"
                  >
                    <td className="p-5 text-lg">
                      {record._t.toLocaleDateString()}
                    </td>
                    <td className="p-5 text-lg">
                      {record._t.toLocaleTimeString()}
                    </td>
                    <td className="p-5 text-lg">{logoutTime}</td>
                    <td className="p-5 text-lg text-green-400 font-bold">
                      {workingHours}
                    </td>
                  </tr>
                );

              })}

              {records.length === 0 && (
                <tr>
                  <td colSpan="4" className="p-5 text-center text-gray-400 text-lg">
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

// Small stat card used in the summary grid
function Stat({ label, value, color }) {
  return (
    <div className="bg-black rounded-2xl p-4 border border-green-500/10">
      <p className="text-gray-400 text-sm">{label}</p>
      <h2 className={`text-3xl font-bold mt-1 ${color}`}>{value}</h2>
    </div>
  );
}

export default EmployeeDetails;
