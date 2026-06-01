import { toJsDate } from "../utils/time";

function EmployeeDetails({
  employee,
  attendance,
  onClose,
}) {

  const records = attendance
    .filter((a) => a.name === employee.name)
    .map((a) => ({ ...a, _t: toJsDate(a.time) }))
    .filter((a) => a._t)
    .sort((a, b) => a._t - b._t);

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">

      <div className="bg-[#111] w-[95%] max-w-6xl rounded-3xl p-8 border border-green-500/20 max-h-[90vh] overflow-y-auto">

        {/* TOP */}

        <div className="flex justify-between items-center mb-8">

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

                let logoutTime = "--";
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
                    No attendance records yet.
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

export default EmployeeDetails;
