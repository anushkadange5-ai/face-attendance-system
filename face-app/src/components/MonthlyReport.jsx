import { useEffect, useState } from "react";
import { db } from "../db";

function MonthlyReport() {

  const [attendance, setAttendance] =
    useState([]);

  useEffect(() => {

    loadAttendance();

  }, []);

  const loadAttendance = async () => {

    const logs =
      await db.getAttendance();

    setAttendance(logs);

  };

  // UNIQUE EMPLOYEES
  const employees =
    [...new Set(
      attendance.map((a) => a.name)
    )];

  // REPORT CALCULATION
  const getEmployeeReport = (name) => {

    const logs =
      attendance.filter(
        (a) => a.name === name
      );

    let presentDays = 0;

    let lateCount = 0;

    let halfDays = 0;

    let holidays = 0;

    let totalHours = 0;

    const groupedByDate = {};

    logs.forEach((log) => {

      const date =
        new Date(log.time)
          .toLocaleDateString();

      if (!groupedByDate[date]) {

        groupedByDate[date] = [];

      }

      groupedByDate[date].push(log);

    });

    Object.values(groupedByDate)
      .forEach((dayLogs) => {

        presentDays++;

        const login =
          dayLogs.find(
            (l) => l.type === "LOGIN"
          );

        const logout =
          dayLogs.find(
            (l) => l.type === "LOGOUT"
          );

        // LATE
        if (
          login &&
          new Date(login.time).getHours() >= 9
        ) {

          lateCount++;

        }

        // HALF DAY
        if (
          logout &&
          new Date(logout.time).getHours() < 13
        ) {

          halfDays++;

        }

        // WORKING HOURS
        if (login && logout) {

          const hours =
            (
              new Date(logout.time) -
              new Date(login.time)
            ) / (1000 * 60 * 60);

          totalHours += hours;

        }

      });

    // HOLIDAYS
    holidays =
      30 - presentDays;

    return {

      presentDays,

      lateCount,

      halfDays,

      holidays,

      totalHours:
        totalHours.toFixed(1),

    };

  };

  return (

    <div className="mt-10 bg-[#111] rounded-3xl p-8 border border-green-500/20">

      <h1 className="text-5xl font-bold text-green-400 mb-10">

        Monthly Report

      </h1>

      <div className="space-y-6">

        {employees.map((employee, index) => {

          const report =
            getEmployeeReport(employee);

          return (

            <div
              key={index}
              className="bg-black rounded-3xl p-6 border border-green-500/20"
            >

              <div className="flex justify-between items-center mb-6">

                <h1 className="text-4xl font-bold">

                  {employee}

                </h1>

                <div className="bg-green-500/20 text-green-400 px-5 py-2 rounded-2xl text-xl font-bold">

                  ACTIVE

                </div>

              </div>

              <div className="grid md:grid-cols-5 gap-4">

                <div className="bg-[#111] rounded-2xl p-4">

                  <p className="text-gray-400">
                    Present Days
                  </p>

                  <h1 className="text-3xl font-bold text-green-400 mt-2">

                    {report.presentDays}

                  </h1>

                </div>

                <div className="bg-[#111] rounded-2xl p-4">

                  <p className="text-gray-400">
                    Holidays
                  </p>

                  <h1 className="text-3xl font-bold text-yellow-400 mt-2">

                    {report.holidays}

                  </h1>

                </div>

                <div className="bg-[#111] rounded-2xl p-4">

                  <p className="text-gray-400">
                    Late Count
                  </p>

                  <h1 className="text-3xl font-bold text-red-400 mt-2">

                    {report.lateCount}

                  </h1>

                </div>

                <div className="bg-[#111] rounded-2xl p-4">

                  <p className="text-gray-400">
                    Half Days
                  </p>

                  <h1 className="text-3xl font-bold text-blue-400 mt-2">

                    {report.halfDays}

                  </h1>

                </div>

                <div className="bg-[#111] rounded-2xl p-4">

                  <p className="text-gray-400">
                    Working Hours
                  </p>

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