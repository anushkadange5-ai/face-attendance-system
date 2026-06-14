import { useEffect, useState } from "react";
import EmployeeDetails from "./EmployeeDetails";
import { db } from "../db";
import { toJsDate } from "../utils/time";
import {
  DEFAULT_SHIFT_ID,
  getShift,
  isLateLogin,
} from "../utils/shifts";
import { loadSettings } from "../utils/settings";

function EmployeeTable() {

  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [searchName, setSearchName] = useState("");
  const [sortBy, setSortBy] = useState("name"); // name | department | enrolledAt

  // DELETE EMPLOYEE
  const handleDelete = async (employee, e) => {
    e.stopPropagation();
    const ok = window.confirm(
      `Delete employee "${employee.name}"?\n\n` +
      `This will permanently remove the employee AND all of their ` +
      `attendance history. This cannot be undone.`
    );
    if (!ok) return;

    try {
      setDeletingId(employee.id);
      const { removedAttendance } = await db.deleteEmployee(employee);
      alert(
        `✅ "${employee.name}" deleted.\n` +
        `Removed ${removedAttendance} attendance record(s).`
      );
    } catch (err) {
      console.error("Delete failed:", err);
      alert("❌ Delete failed: " + (err?.message || err));
    } finally {
      setDeletingId(null);
    }
  };

  // LOAD DATA + LIVE SUBSCRIBE
  useEffect(() => {
    const unsubEmp = db.subscribeEmployees(setEmployees);
    const unsubAtt = db.subscribeAttendance(setAttendance);
    return () => {
      unsubEmp && unsubEmp();
      unsubAtt && unsubAtt();
    };
  }, []);

  // TOTAL HOURS
  const getTotalHours = (name) => {
    const records = attendance
      .filter((a) => a.name === name)
      .map((a) => ({ ...a, _t: toJsDate(a.time) }))
      .filter((a) => a._t)
      .sort((a, b) => a._t - b._t);

    let total = 0;
    for (let i = 0; i < records.length - 1; i++) {
      const login = records[i];
      const logout = records[i + 1];
      if (login.type === "LOGIN" && logout.type === "LOGOUT") {
        total += (logout._t - login._t) / 1000 / 60 / 60;
        i++;
      }
    }
    return total.toFixed(1);
  };

  // LATE COUNT
  const getLateCount = (name, shiftId) => {
    return attendance.filter((a) => {
      if (a.name !== name || a.type !== "LOGIN") return false;
      const time = toJsDate(a.time);
      if (!time) return false;
      return isLateLogin(time, shiftId);
    }).length;
  };

  // Get unique departments
  const departments = [...new Set(employees.map(e => e.department || "Other"))].sort();

  // Filter and sort employees
  const filteredEmployees = employees
    .filter(emp => {
      if (filterDepartment !== "all" && emp.department !== filterDepartment) return false;
      if (searchName && !emp.name.toLowerCase().includes(searchName.toLowerCase()) &&
          !emp.employeeId?.toLowerCase().includes(searchName.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "department") return (a.department || "").localeCompare(b.department || "");
      if (sortBy === "enrolledAt") {
        const aTime = toJsDate(a.enrolledAt)?.getTime() || 0;
        const bTime = toJsDate(b.enrolledAt)?.getTime() || 0;
        return bTime - aTime;
      }
      return 0;
    });

  // Role icons
  const roleIcons = {
    admin: "🔐",
    manager: "👔",
    employee: "👤"
  };

  return (
    <>
      <div className="bg-[#111] rounded-3xl p-6 border border-green-500/20 mt-8">

        {/* TOP */}
        <div className="flex flex-wrap justify-between items-center gap-4 mb-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-green-400">
              Employees ({filteredEmployees.length})
            </h1>
            <p className="text-gray-400 text-sm">
              Click a card to see full history
            </p>
          </div>
        </div>

        {/* FILTERS */}
        <div className="flex flex-wrap gap-3 mb-5">
          <input
            type="text"
            placeholder="🔍 Search by name or ID..."
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            className="bg-black border border-green-500/30 rounded-xl px-4 py-2 text-white flex-1 min-w-[200px]"
          />

          <select
            value={filterDepartment}
            onChange={(e) => setFilterDepartment(e.target.value)}
            className="bg-black border border-green-500/30 rounded-xl px-4 py-2 text-white"
          >
            <option value="all">All Departments</option>
            {departments.map(dept => (
              <option key={dept} value={dept}>{dept}</option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-black border border-green-500/30 rounded-xl px-4 py-2 text-white"
          >
            <option value="name">Sort by Name</option>
            <option value="department">Sort by Department</option>
            <option value="enrolledAt">Sort by Date</option>
          </select>
        </div>

        {/* GRID */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">

          {filteredEmployees.map((employee, index) => {
            const shift = getShift(employee.shift || DEFAULT_SHIFT_ID);
            
            return (
              <div
                key={employee.id || index}
                onClick={() => setSelectedEmployee(employee)}
                className="relative bg-black border border-green-500/20 rounded-2xl p-4 cursor-pointer hover:border-green-400 transition"
              >
                {/* Delete button */}
                <button
                  onClick={(e) => handleDelete(employee, e)}
                  disabled={deletingId === employee.id}
                  title="Delete employee + all attendance"
                  className={`absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center rounded-lg text-sm transition ${
                    deletingId === employee.id
                      ? "bg-gray-600 cursor-not-allowed"
                      : "bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white"
                  }`}
                >
                  {deletingId === employee.id ? "…" : "🗑"}
                </button>

                {/* Header - photo + info */}
                <div className="flex items-start gap-3 mb-3 pr-10">
                  <img
                    src={employee.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(employee.name)}&background=22c55e&color=fff`}
                    alt={employee.name}
                    className="w-14 h-14 rounded-full object-cover border-2 border-green-500 shrink-0"
                  />

                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-bold truncate">{employee.name}</h2>
                    <p className="text-green-400 text-xs font-mono">{employee.employeeId || "No ID"}</p>
                  </div>
                </div>

                {/* Department + Role badges */}
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-2 py-1 text-xs text-blue-400">
                    📁 {employee.department || "Other"}
                  </span>
                  <span className="bg-purple-500/10 border border-purple-500/30 rounded-lg px-2 py-1 text-xs text-purple-400">
                    {roleIcons[employee.role] || "👤"} {employee.role || "employee"}
                  </span>
                </div>

                {/* Shift badge */}
                <div className="mb-3 bg-green-500/10 border border-green-500/30 rounded-xl px-3 py-2 text-xs">
                  <span className="font-bold text-green-400">
                    {shift.emoji} {shift.label}
                  </span>
                  <span className="text-gray-400 ml-2">
                    {shift.loginAt} – {shift.logoutAt}
                  </span>
                </div>

                {/* Stats row */}
                <div className="flex gap-2 text-center">
                  <div className="flex-1 bg-[#0a0a0a] rounded-xl py-2 border border-green-500/10">
                    <p className="text-gray-500 text-[10px] uppercase tracking-wide">Late</p>
                    <p className="text-yellow-400 text-lg font-bold leading-tight">
                      {getLateCount(employee.name, employee.shift || DEFAULT_SHIFT_ID)}
                    </p>
                  </div>

                  <div className="flex-1 bg-[#0a0a0a] rounded-xl py-2 border border-green-500/10">
                    <p className="text-gray-500 text-[10px] uppercase tracking-wide">Hours</p>
                    <p className="text-green-400 text-lg font-bold leading-tight">
                      {getTotalHours(employee.name)}h
                    </p>
                  </div>

                  <div className="flex-1 bg-[#0a0a0a] rounded-xl py-2 border border-green-500/10">
                    <p className="text-gray-400 text-[10px] text-xs truncate">Enrolled</p>
                    <p className="text-gray-300 text-sm font-bold leading-tight">
                      {toJsDate(employee.enrolledAt)
                        ? toJsDate(employee.enrolledAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
                        : "N/A"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredEmployees.length === 0 && employees.length === 0 && (
            <p className="text-gray-400 col-span-full text-center py-8">
              No employees yet. Enroll one above to get started.
            </p>
          )}

          {filteredEmployees.length === 0 && employees.length > 0 && (
            <p className="text-gray-400 col-span-full text-center py-8">
              No employees match your filter.
            </p>
          )}
        </div>
      </div>

      {/* DETAILS POPUP */}
      {selectedEmployee && (
        <EmployeeDetails
          employee={selectedEmployee}
          attendance={attendance}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </>
  );
}

export default EmployeeTable;