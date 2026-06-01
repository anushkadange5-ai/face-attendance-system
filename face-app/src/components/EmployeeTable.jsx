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

      <div className="bg-[#111] rounded-3xl p-8 border border-green-500/20 mt-10">

        {/* TOP */}

        <div className="flex justify-between items-center mb-8">

          <div>

            <h1 className="text-5xl font-bold text-green-400">

              Employees

            </h1>

            <p className="text-gray-400 mt-2 text-xl">

              Click employee to view details

            </p>

          </div>

        </div>

        {/* GRID */}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">

          {employees.map((employee, index) => (

            <div
              key={employee.id || index}
              onClick={() =>
                setSelectedEmployee(
                  employee
                )
              }
              className="relative bg-black border border-green-500/20 rounded-3xl p-6 cursor-pointer hover:border-green-400 hover:scale-[1.02] transition"
            >

              {/* DELETE BUTTON */}
              <button
                onClick={(e) => handleDelete(employee, e)}
                disabled={deletingId === employee.id}
                title="Delete employee + all attendance"
                className={`absolute top-3 right-3 z-10 px-3 py-2 rounded-xl text-sm font-bold transition ${
                  deletingId === employee.id
                    ? "bg-gray-600 cursor-not-allowed"
                    : "bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white"
                }`}
              >
                {deletingId === employee.id ? "Deleting..." : "🗑 Delete"}
              </button>

              {/* REAL PHOTO */}

              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-green-500 mx-auto mb-5">

                <img
                  src={
                    employee.photo
                      ? employee.photo
                      : `https://ui-avatars.com/api/?name=${employee.name}`
                  }
                  alt={employee.name}
                  className="w-full h-full object-cover"
                />

              </div>

              {/* LATE COUNT */}

              <h1 className="text-center text-yellow-400 text-2xl font-bold">

                Late Count:
                {" "}
                {getLateCount(
                  employee.name
                )}

              </h1>

              {/* NAME */}

              <h1 className="text-4xl font-bold text-center mt-3">

                {employee.name}

              </h1>

              {/* ENROLL DATE */}

              <p className="text-gray-400 text-center mt-3 text-lg">

                Enrolled:
                {" "}

                {
                  toJsDate(employee.enrolledAt)
                    ? toJsDate(employee.enrolledAt).toLocaleDateString()
                    : "N/A"
                }

              </p>

              {/* HOURS */}

              <div className="mt-5 bg-[#111] rounded-2xl p-5 border border-green-500/10">

                <p className="text-gray-400 text-lg">

                  Total Working Hours

                </p>

                <h1 className="text-4xl font-bold text-green-400 mt-2">

                  {getTotalHours(
                    employee.name
                  )}
                  h

                </h1>

              </div>

            </div>

          ))}

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