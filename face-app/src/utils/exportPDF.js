import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toJsDate } from "./time";

/**
 * Export attendance rows to a PDF.
 * @param {Array} attendance - attendance documents
 * @param {Object} opts
 * @param {string} opts.title    - heading shown in the PDF
 * @param {string} opts.filename - output filename (without .pdf)
 */
export const exportPDF = (attendance, opts = {}) => {

  const title    = opts.title    || "Attendance Report";
  const filename = opts.filename || "attendance-report";

  const doc = new jsPDF();

  doc.setFontSize(22);
  doc.text(title, 14, 20);

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

  doc.save(`${filename}.pdf`);

};
