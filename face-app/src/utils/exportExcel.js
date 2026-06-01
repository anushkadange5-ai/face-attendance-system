import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { toJsDate } from "./time";

/**
 * Export attendance rows to an .xlsx file.
 * @param {Array} attendance - attendance documents
 * @param {Object} opts
 * @param {string} opts.filename  - output filename (without .xlsx)
 * @param {string} opts.sheetName - worksheet tab name
 */
export const exportExcel = (attendance, opts = {}) => {

  const filename  = opts.filename  || "attendance-report";
  const sheetName = opts.sheetName || "Attendance";

  const data = attendance
    .map((a) => ({ ...a, _t: toJsDate(a.time) }))
    .filter((a) => a._t)
    .sort((a, b) => b._t - a._t)
    .map((a) => ({
      Employee: a.name,
      Type: a.type,
      Date: a._t.toLocaleDateString(),
      Time: a._t.toLocaleTimeString(),
    }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const excelBuffer = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
  });

  const fileData = new Blob([excelBuffer], {
    type: "application/octet-stream",
  });

  saveAs(fileData, `${filename}.xlsx`);

};
