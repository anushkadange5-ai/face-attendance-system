import { useEffect, useState } from "react";

import EmployeeDetails from "./EmployeeDetails";

import { db } from "../db";

function EmployeeTable() {

  const [employees, setEmployees] =
    useState([]);

  const [attendance, setAttendance] =
    useState([]);

  const [selectedEmployee, setSelectedEmployee] =
    useState(null);

  // LOAD DATA

  useEffect(() => {

    loadData();

  }, []);

  const loadData = async () => {

    const employeeData =
      await db.getEmployees();

    const attendanceData =
      await db.getAttendance();

    setEmployees(employeeData);

    setAttendance(attendanceData);

  };

  // TOTAL HOURS

  const getTotalHours = (name) => {

    const records =
    attendance
      .filter(
        (a) => a.name === name
      )
      .sort(
        (a, b) =>
          a.time.toDate() -
          new Date(b.time)
      );

    let total = 0;

    for (
      let i = 0;
      i < records.length;
      i += 2
    ) {

      const login =
        records[i];

      const logout =
        records[i + 1];

      if (
        login &&
        logout &&
        login.type === "LOGIN" &&
        logout.type === "LOGOUT"
      ) {

        total +=
          (
            logout.time.toDate() -
            login.time.toDate()
          ) /
          1000 /
          60 /
          60;

      }

    }

    return total.toFixed(1);

  };

  // LATE COUNT

  const getLateCount = (name) => {

    return attendance.filter((a) => {

      const time =
        new Date(a.time);

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
              key={index}
              onClick={() =>
                setSelectedEmployee(
                  employee
                )
              }
              className="bg-black border border-green-500/20 rounded-3xl p-6 cursor-pointer hover:border-green-400 hover:scale-[1.02] transition"
            >

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
                  employee.enrolledAt
                    ? employee.enrolledAt.toDate().toLocaleDateString()
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