import { useEffect, useState } from "react";
import { db } from "../db";
import { toJsDate } from "../utils/time";

function MonthlyReport() {

  const [attendance, setAttendance] = useState([]);

  // Selected month (YYYY-MM)  default = current month
  const now = new Date();
  const defaultMonth =
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [month, setMonth] = useState(defaultMonth);

  useEffect(() => {

    const unsub = db.subscribeAttendance(setAttendance);
    return () => unsub && unsub();

  }, []);

  // --- HELPERS ----------------------------------------------------

  // total days in selected month
  const getDaysInMonth = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    return new Date(y, m, 0).getDate();
  };

  // working days in month (exclude Sundays  treat Sunday as holiday)
  const getWorkingDaysInMonth = (ym) => {
    const [y, m] = ym.split("-").map(Number);
    const total = getDaysInMonth(ym);
    let working = 0;
    for (let d = 1; d <= total; d++) {
      const day = new Date(y, m - 1, d).getDay();
      if (day !== 0) working++; // skip Sundays
    }
    return working;
  };

  // filter attendance only for selected month
  const monthLogs = attendance.filter((log) => {
    const d = toJsDate(log.time);
    if (!d) return false;
    const ym =
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return ym === month;
  });

  // UNIQUE EMPLOYEES (from this month  fallback to all)
  const employees = [...new Set(
    (monthLogs.length ? monthLogs : attendance).map((a) => a.name)
  )];

  // REPORT CALCULATION (per employee, for selected month)
  const getEmployeeReport = (name) => {

    const logs = monthLogs.filter((a) => a.name === name);

    let presentDays = 0;
    let lateCount = 0;
    let halfDays = 0;
    let totalHours = 0;

    const groupedByDate = {};

    logs.forEach((log) => {
      const d = toJsDate(log.time);
      if (!d) return;
      const dateKey = d.toLocaleDateString();
      if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
      groupedByDate[dateKey].push({ ...log, _t: d });
    });

    Object.values(groupedByDate).forEach((dayLogs) => {

      presentDays++;

      // sort by time so first LOGIN / last LOGOUT is correct
      dayLogs.sort((a, b) => a._t - b._t);

      const login = dayLogs.find((l) => l.type === "LOGIN");
      const logout = [...dayLogs].reverse().find((l) => l.type === "LOGOUT");

      // LATE  after 9:00 AM
      if (login && login._t.getHours() >= 9) {
        if (login._t.getHours() > 9 || login._t.getMinutes() > 0) {
          lateCount++;
        }
      }

      // HALF DAY  logout before 1 PM
      if (logout && logout._t.getHours() < 13) {
        halfDays++;
      }

      // WORKING HOURS
      if (login && logout && logout._t > login._t) {
        totalHours += (logout._t - login._t) / (1000 * 60 * 60);
      }

    });

    // Holidays = working days in month minus present days (never negative)
    const workingDays = getWorkingDaysInMonth(month);
    const holidays = Math.max(0, workingDays - presentDays);

    return {
      presentDays,
      lateCount,
      halfDays,
      holidays,
      totalHours: totalHours.toFixed(1),
    };

  };

  // --- UI ---------------------------------------------------------

  return (

    <div className="mt-10 bg-[#111] rounded-3xl p-8 border border-green-500/20">

      <div className="flex flex-wrap justify-between items-center mb-10 gap-4">

        <h1 className="text-5xl font-bold text-green-400">
          Monthly Report
        </h1>

        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="bg-black border border-green-500 rounded-2xl px-5 py-3 text-xl text-white"
        />

      </div>

      {employees.length === 0 && (
        <p className="text-gray-400 text-xl">
          No attendance records for this month.
        </p>
      )}

      <div className="space-y-6">

        {employees.map((employee, index) => {

          const report = getEmployeeReport(employee);

          return (

            <div
              key={index}
              className="bg-black rounded-3xl p-6 border border-green-500/20"
            >

              <div className="flex justify-between items-center mb-6">

                <h1 className="text-4xl font-bold">{employee}</h1>

                <div className="bg-green-500/20 text-green-400 px-5 py-2 rounded-2xl text-xl font-bold">
                  ACTIVE
                </div>

              </div>

              <div className="grid md:grid-cols-5 gap-4">

                <div className="bg-[#111] rounded-2xl p-4">
                  <p className="text-gray-400">Present Days</p>
                  <h1 className="text-3xl font-bold text-green-400 mt-2">
                    {report.presentDays}
                  </h1>
                </div>

                <div className="bg-[#111] rounded-2xl p-4">
                  <p className="text-gray-400">Holidays</p>
                  <h1 className="text-3xl font-bold text-yellow-400 mt-2">
                    {report.holidays}
                  </h1>
                </div>

                <div className="bg-[#111] rounded-2xl p-4">
                  <p className="text-gray-400">Late Count</p>
                  <h1 className="text-3xl font-bold text-red-400 mt-2">
                    {report.lateCount}
                  </h1>
                </div>

                <div className="bg-[#111] rounded-2xl p-4">
                  <p className="text-gray-400">Half Days</p>
                  <h1 className="text-3xl font-bold text-blue-400 mt-2">
                    {report.halfDays}
                  </h1>
                </div>

                <div className="bg-[#111] rounded-2xl p-4">
                  <p className="text-gray-400">Working Hours</p>
                  <h1 className="text-3xl font-bold text-purple-400 mt-2">
                    {report.totalHours}h
                  </h1>
                </div>

              </div>

            </div>

          );

        })}

      </div>

    </div>

  );

}

export default MonthlyReport;
