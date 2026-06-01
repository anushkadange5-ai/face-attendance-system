import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toJsDate } from "./time";

export const exportPDF = (attendance) => {

  const doc = new jsPDF();

  doc.setFontSize(22);
  doc.text("Attendance Report", 14, 20);

  const tableData = attendance
    .map((a) => ({ ...a, _t: toJsDate(a.time) }))
    .filter((a) => a._t)
    .sort((a, b) => b._t - a._t)
    .map((a) => [
      a.name,
      a.type,
      a._t.toLocaleDateString(),
      a._t.toLocaleTimeString(),
    ]);

  autoTable(doc, {
    head: [["Employee", "Type", "Date", "Time"]],
    body: tableData,
    startY: 30,
  });

  doc.save("attendance-report.pdf");

};
