export const OFFICE_START_HOUR = 9;

export const HALF_DAY_HOUR = 13;

export function checkAttendanceStatus(
  loginTime,
  logoutTime
) {

  const loginHour =
    new Date(loginTime).getHours();

  const logoutHour =
    logoutTime
      ? new Date(logoutTime).getHours()
      : null;

  let status = [];

  // LATE
  if (loginHour >= OFFICE_START_HOUR) {

    status.push("Late");

  }

  // EARLY
  if (loginHour < OFFICE_START_HOUR) {

    status.push("Early");

  }

  // HALF DAY
  if (
    logoutHour !== null &&
    logoutHour < HALF_DAY_HOUR
  ) {

    status.push("Half Day");

  }

  return status;

}