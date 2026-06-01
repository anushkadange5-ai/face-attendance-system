import jsPDF from "jspdf";

import autoTable from "jspdf-autotable";

export const exportPDF = (
  attendance
) => {

  const doc = new jsPDF();

  doc.setFontSize(22);

  doc.text(
    "Attendance Report",
    14,
    20
  );

  const tableData =
    attendance.map((a) => [

      a.name,

      a.type,

      new Date(
        a.time
      ).toLocaleDateString(),

      new Date(
        a.time
      ).toLocaleTimeString(),

    ]);

  autoTable(doc, {

    head: [[
      "Employee",
      "Type",
      "Date",
      "Time",
    ]],

    body: tableData,

    startY: 30,

  });

  doc.save(
    "attendance-report.pdf"
  );

};