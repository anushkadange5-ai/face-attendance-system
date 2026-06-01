import { useEffect, useState } from "react";

import EmployeeDetails from "./EmployeeDetails";

import { db } from "../db";
import { toJsDate } from "../utils/time";

function EmployeeTable() {

  const [employees, setEmployees] =
    useState([]);

  const [attendance, setAttendance] =
    useState([]);

  const [selectedEmployee, setSelectedEmployee] =
    useState(null);

  // tracks which employee row is currently being deleted (by id)
  const [deletingId, setDeletingId] = useState(null);

  // DELETE EMPLOYEE  (with confirm + cascade attendance delete)

  const handleDelete = async (employee, e) => {

    // important: stop the click from bubbling up to the card,
    // which would open the details popup at the same time.
    e.stopPropagation();

    const ok = window.confirm(
      `Delete employee "${employee.name}"?\n\n` +
      `This will permanently remove the employee AND all of their ` +
      `attendance history from the database. This cannot be undone.`
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

  // TOTAL HOURS  (safe Timestamp handling)

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

      if (
        login.type === "LOGIN" &&
        logout.type === "LOGOUT"
      ) {

        total += (logout._t - login._t) / 1000 / 60 / 60;
        i++; // skip the logout we just consumed

      }

    }

    return total.toFixed(1);

  };

  // LATE COUNT

  const getLateCount = (name) => {

    return attendance.filter((a) => {

      const time = toJsDate(a.time);
      if (!time) return false;

      return (
        a.name === name &&
        a.type === "LOGIN" &&
        (
          time.getHours() > 9 ||
          (
            time.getHours() === 9 &&
            time.getMinutes() > 30
          )
        )
      );

    }).length;

  };

  return (

    <>

      <div className="bg-[#111] rounded-3xl p-6 border border-green-500/20 mt-10">

        {/* TOP */}

        <div className="flex justify-between items-center mb-5">

          <div>
            <h1 className="text-3xl font-bold text-green-400">
              Employees ({employees.length})
            </h1>
            <p className="text-gray-400 text-sm">
              Click a card to see full history
            </p>
          </div>

        </div>

        {/* GRID — compact cards */}

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">

          {employees.map((employee, index) => (

            <div
              key={employee.id || index}
              onClick={() => setSelectedEmployee(employee)}
              className="relative bg-black border border-green-500/20 rounded-2xl p-4 cursor-pointer hover:border-green-400 transition"
            >

              {/* DELETE BUTTON — small, top-right */}
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

              {/* HEADER ROW — photo + name + enrolled date */}
              <div className="flex items-center gap-3 mb-3 pr-8">

                <img
                  src={
                    employee.photo
                      ? employee.photo
                      : `https://ui-avatars.com/api/?name=${employee.name}`
                  }
                  alt={employee.name}
                  className="w-14 h-14 rounded-full object-cover border-2 border-green-500 shrink-0"
                />

                <div className="min-w-0">
                  <h2 className="text-xl font-bold truncate">
                    {employee.name}
                  </h2>
                  <p className="text-gray-500 text-xs">
                    {toJsDate(employee.enrolledAt)
                      ? `Enrolled ${toJsDate(employee.enrolledAt).toLocaleDateString()}`
                      : "Enrolled N/A"}
                  </p>
                </div>

              </div>

              {/* STATS ROW — late count + working hours, side by side */}
              <div className="flex gap-2 text-center">

                <div className="flex-1 bg-[#0a0a0a] rounded-xl py-2 border border-green-500/10">
                  <p className="text-gray-500 text-[10px] uppercase tracking-wide">Late</p>
                  <p className="text-yellow-400 text-lg font-bold leading-tight">
                    {getLateCount(employee.name)}
                  </p>
                </div>

                <div className="flex-1 bg-[#0a0a0a] rounded-xl py-2 border border-green-500/10">
                  <p className="text-gray-500 text-[10px] uppercase tracking-wide">Hours</p>
                  <p className="text-green-400 text-lg font-bold leading-tight">
                    {getTotalHours(employee.name)}h
                  </p>
                </div>

              </div>

            </div>

          ))}

          {employees.length === 0 && (
            <p className="text-gray-400 col-span-full text-center py-8">
              No employees yet. Enroll one above to get started.
            </p>
          )}

        </div>

      </div>

      {/* DETAILS POPUP */}

      {selectedEmployee && (

        <EmployeeDetails

          employee={selectedEmployee}

          attendance={attendance}

          onClose={() =>
            setSelectedEmployee(
              null
            )
          }

        />

      )}

    </>

  );

}

export default EmployeeTable;