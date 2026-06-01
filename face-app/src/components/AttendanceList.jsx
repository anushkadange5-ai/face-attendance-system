import React, { useEffect, useState } from "react";
import { db } from "../db";

const AttendanceList = () => {

  const [logs, setLogs] = useState([]);

  useEffect(() => {

    const unsubscribe =
      db.subscribeAttendance(
        (data) => {

          const today =
            new Date().toLocaleDateString();

          const todayLogs =
            data.filter((log) => {

              if (!log.time) return false;

              return (
                log.time
                  .toDate()
                  .toLocaleDateString() ===
                today
              );

            });

          const sorted =
            todayLogs.sort(
              (a, b) =>
                b.time.toDate() -
                a.time.toDate()
            );

          setLogs(sorted);

        }
      );

    return () => unsubscribe();

  }, []);

  return (

    <div className="w-full max-w-3xl mt-10">

      <div className="flex justify-between items-center mb-6">

        <h2 className="text-4xl font-bold text-green-400">
          Attendance Logs
        </h2>

        <span className="text-gray-400">
          {logs.length} entries today
        </span>

      </div>

      <div className="space-y-4">

        {logs.length === 0 ? (

          <div className="text-center text-gray-500 italic py-10">
            No attendance recorded yet today.
          </div>

        ) : (

          logs.map((log, index) => (

            <div
              key={index}
              className="bg-[#111] border border-green-500/20 rounded-2xl p-5 flex justify-between items-center"
            >

              <div>

                <h3 className="text-xl font-bold text-white">
                  {log.name}
                </h3>

                <p className="text-gray-400 text-sm">
                  {log.time
                    .toDate()
                    .toLocaleDateString()}
                </p>

              </div>

              <div className="flex items-center gap-5">

                <span
                  className={`px-4 py-2 rounded-full text-sm font-bold ${
                    log.type === "LOGIN"
                      ? "bg-green-500 text-black"
                      : "bg-red-500 text-white"
                  }`}
                >
                  {log.type}
                </span>

                <span className="text-lg text-white">
                  {log.time
                    .toDate()
                    .toLocaleTimeString()}
                </span>

              </div>

            </div>

          ))

        )}

      </div>

    </div>

  );

};

export default AttendanceList;