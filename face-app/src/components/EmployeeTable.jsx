import { useEffect, useState } from "react";
import EmployeeDetails from "./EmployeeDetails";
import { db } from "../db";
import { toJsDate } from "../utils/time";
import { DEFAULT_SHIFT_ID, getShift, isLateLogin } from "../utils/shifts";

function EmployeeTable() {
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [searchName, setSearchName] = useState("");
  const [sortBy, setSortBy] = useState("name");

  useEffect(() => {
    const unsubEmp = db.subscribeEmployees(setEmployees);
    const unsubAtt = db.subscribeAttendance(setAttendance);
    return () => { unsubEmp?.(); unsubAtt?.(); };
  }, []);

  const handleDelete = async (employee, e) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${employee.name}"? This will remove all their attendance history.`)) return;
    try {
      setDeletingId(employee.id);
      const { removedAttendance } = await db.deleteEmployee(employee);
      alert(`✅ "${employee.name}" deleted. Removed ${removedAttendance} attendance record(s).`);
    } catch (err) {
      alert("❌ Delete failed: " + (err?.message || err));
    } finally {
      setDeletingId(null);
    }
  };

  const getTotalHours = (name) => {
    const records = attendance.filter(a => a.name === name).map(a => ({ ...a, _t: toJsDate(a.time) })).filter(a => a._t).sort((a,b) => a._t - b._t);
    let total = 0;
    for (let i = 0; i < records.length - 1; i++) {
      if (records[i].type === "LOGIN" && records[i+1].type === "LOGOUT") { total += (records[i+1]._t - records[i]._t) / 3600000; i++; }
    }
    return total.toFixed(1);
  };

  const getLateCount = (name, shiftId) =>
    attendance.filter(a => { if (a.name !== name || a.type !== "LOGIN") return false; const t = toJsDate(a.time); return t && isLateLogin(t, shiftId); }).length;

  const departments = [...new Set(employees.map(e => e.department || "Other"))].sort();

  const filteredEmployees = employees
    .filter(emp => {
      if (filterDepartment !== "all" && emp.department !== filterDepartment) return false;
      if (searchName && !emp.name.toLowerCase().includes(searchName.toLowerCase()) && !emp.employeeId?.toLowerCase().includes(searchName.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "department") return (a.department||"").localeCompare(b.department||"");
      if (sortBy === "enrolledAt") return (toJsDate(b.enrolledAt)?.getTime()||0) - (toJsDate(a.enrolledAt)?.getTime()||0);
      return 0;
    });

  const roleIcons = { admin: "🔐", manager: "👔", employee: "👤" };
  const selectCls = "bg-white border border-purple-200 rounded-xl px-3 py-2 text-gray-700 text-sm focus:outline-none focus:border-purple-500";

  return (
    <>
      <div className="bg-white rounded-2xl p-5 border border-purple-100 shadow-sm mt-5">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-purple-700">👥 Employees ({filteredEmployees.length})</h2>
            <p className="text-gray-400 text-xs">Click a card to see full history</p>
          </div>
        </div>

        {/* FILTERS */}
        <div className="flex flex-wrap gap-2 mb-4">
          <input type="text" placeholder="🔍 Search by name or ID..." value={searchName} onChange={e => setSearchName(e.target.value)}
            className="bg-purple-50 border border-purple-200 rounded-xl px-3 py-2 text-gray-700 text-sm flex-1 min-w-[180px] focus:outline-none focus:border-purple-500" />
          <select value={filterDepartment} onChange={e => setFilterDepartment(e.target.value)} className={selectCls}>
            <option value="all">All Departments</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)} className={selectCls}>
            <option value="name">Sort by Name</option>
            <option value="department">Sort by Department</option>
            <option value="enrolledAt">Sort by Date</option>
          </select>
        </div>

        {/* GRID */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredEmployees.map((employee, index) => {
            const shift = getShift(employee.shift || DEFAULT_SHIFT_ID);
            return (
              <div key={employee.id || index} onClick={() => setSelectedEmployee(employee)}
                className="relative bg-purple-50 border border-purple-100 rounded-2xl p-4 cursor-pointer hover:border-purple-400 hover:shadow-md transition">

                <button onClick={e => handleDelete(employee, e)} disabled={deletingId === employee.id}
                  className={`absolute top-2 right-2 z-10 w-7 h-7 flex items-center justify-center rounded-lg text-xs transition ${
                    deletingId === employee.id ? "bg-gray-200 cursor-not-allowed" : "bg-red-100 text-red-500 hover:bg-red-500 hover:text-white"
                  }`}>
                  {deletingId === employee.id ? "…" : "🗑"}
                </button>

                <div className="flex items-start gap-3 mb-3 pr-8">
                  <img src={employee.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(employee.name)}&background=7c3aed&color=fff`}
                    alt={employee.name} className="w-12 h-12 rounded-full object-cover border-2 border-purple-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-bold text-gray-800 truncate">{employee.name}</h2>
                    <p className="text-purple-600 text-xs font-mono">{employee.employeeId || "No ID"}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 mb-2">
                  <span className="bg-blue-100 text-blue-600 rounded-lg px-2 py-0.5 text-xs">📁 {employee.department || "Other"}</span>
                  <span className="bg-purple-100 text-purple-600 rounded-lg px-2 py-0.5 text-xs">{roleIcons[employee.role]||"👤"} {employee.role||"employee"}</span>
                </div>

                <div className="mb-3 bg-white border border-purple-100 rounded-xl px-3 py-1.5 text-xs">
                  <span className="font-bold text-purple-600">{shift.emoji} {shift.label}</span>
                  <span className="text-gray-400 ml-2">{shift.loginAt} – {shift.logoutAt}</span>
                </div>

                <div className="flex gap-2 text-center">
                  <div className="flex-1 bg-white rounded-xl py-1.5 border border-purple-100">
                    <p className="text-gray-400 text-[10px]">Late</p>
                    <p className="text-yellow-500 text-base font-bold">{getLateCount(employee.name, employee.shift || DEFAULT_SHIFT_ID)}</p>
                  </div>
                  <div className="flex-1 bg-white rounded-xl py-1.5 border border-purple-100">
                    <p className="text-gray-400 text-[10px]">Hours</p>
                    <p className="text-green-600 text-base font-bold">{getTotalHours(employee.name)}h</p>
                  </div>
                  <div className="flex-1 bg-white rounded-xl py-1.5 border border-purple-100">
                    <p className="text-gray-400 text-[10px]">Enrolled</p>
                    <p className="text-gray-600 text-xs font-bold">
                      {toJsDate(employee.enrolledAt)?.toLocaleDateString(undefined, { month: "short", day: "numeric" }) || "N/A"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredEmployees.length === 0 && (
            <p className="text-gray-400 col-span-full text-center py-8 text-sm">
              {employees.length === 0 ? "No employees yet. Enroll one above." : "No employees match your filter."}
            </p>
          )}
        </div>
      </div>

      {selectedEmployee && (
        <EmployeeDetails employee={selectedEmployee} attendance={attendance} onClose={() => setSelectedEmployee(null)} />
      )}
    </>
  );
}

export default EmployeeTable;
