import * as XLSX from "xlsx";

import { saveAs } from "file-saver";

export const exportExcel = (
  attendance
) => {

  const data =
    attendance.map((a) => ({

      Employee:
        a.name,

      Type:
        a.type,

      Date:
        new Date(
          a.time
        ).toLocaleDateString(),

      Time:
        new Date(
          a.time
        ).toLocaleTimeString(),

    }));

  const worksheet =
    XLSX.utils.json_to_sheet(
      data
    );

  const workbook =
    XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "Attendance"
  );

  const excelBuffer =
    XLSX.write(workbook, {

      bookType: "xlsx",

      type: "array",

    });

  const fileData =
    new Blob(
      [excelBuffer],
      {
        type:
          "application/octet-stream",
      }
    );

  saveAs(
    fileData,
    "attendance-report.xlsx"
  );

};