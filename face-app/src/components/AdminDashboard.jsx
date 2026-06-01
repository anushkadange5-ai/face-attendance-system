import { useState, useRef, useEffect } from "react";

import Webcam from "react-webcam";
import * as faceapi from "face-api.js";

import MonthlyReport from "./MonthlyReport";
import EmployeeTable from "./EmployeeTable";

import { faceService } from "../faceService";
import { db } from "../db";
import { toJsDate } from "../utils/time";

import { exportPDF }
from "../utils/exportPDF";

import { exportExcel }
from "../utils/exportExcel";

function AdminDashboard() {

  // AUTH

  const [isAuthenticated, setIsAuthenticated] =
    useState(false);

  // STATES

  const [employeeName, setEmployeeName] =
    useState("");

  const [enrolling, setEnrolling] = useState(false);

  const [employees, setEmployees] =
    useState([]);

  const [attendance, setAttendance] =
    useState([]);

  const webcamRef = useRef(null);

  // LOAD DATABASE — real-time subscriptions instead of 2-sec polling

  useEffect(() => {

    if (!isAuthenticated) return;

    const unsubEmp = db.subscribeEmployees(setEmployees);
    const unsubAtt = db.subscribeAttendance(setAttendance);

    return () => {
      unsubEmp && unsubEmp();
      unsubAtt && unsubAtt();
    };

  }, [isAuthenticated]);

  // helper to manually refresh after enroll (subscription handles it,
  // but kept for explicit calls)
  const loadData = async () => {
    const employeeData = await db.getEmployees();
    const attendanceData = await db.getAttendance();
    setEmployees(employeeData);
    setAttendance(attendanceData);
  };

  // LOGIN SCREEN

  if (!isAuthenticated) {

    return (

      <div className="min-h-screen bg-black flex items-center justify-center">

        <div className="bg-[#111] p-10 rounded-3xl border border-green-500/20 w-[400px]">

          <h1 className="text-4xl text-green-400 font-bold mb-8 text-center">

            ADMIN LOGIN

          </h1>

          <input
            type="password"
            placeholder="Enter Password"
            id="adminPass"
            className="w-full bg-black border border-green-500 rounded-2xl p-5 text-white text-xl mb-6"
          />

          <button
            onClick={() => {

              const pass =
                document.getElementById("adminPass").value;

              if (pass === "admin123") {

                setIsAuthenticated(true);

              } else {

                alert("Wrong Password");

              }

            }}
            className="w-full bg-green-500 hover:bg-green-600 p-5 rounded-2xl text-2xl font-bold"
          >

            LOGIN

          </button>

        </div>

      </div>

    );

  }

  // LIVENESS HELPER — samples 2 frames ~1s apart and checks if the
  // nose tip moved or eyes blinked. A static phone/printed photo
  // produces near-zero change and is rejected.

  const eyeAspect = (eye) => {
    const vert =
      (Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y) +
       Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y)) / 2;
    const horiz = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
    return horiz === 0 ? 0 : vert / horiz;
  };

  const sampleFace = async (video) => {
    const det = await faceapi
      .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks();
    if (!det) return null;

    const jaw = det.landmarks.getJawOutline();
    const faceWidth = jaw[16].x - jaw[0].x;
    if (faceWidth < 100) return { tooSmall: true };

    const noseTip = det.landmarks.getNose()[3];
    const ear =
      (eyeAspect(det.landmarks.getLeftEye()) +
       eyeAspect(det.landmarks.getRightEye())) / 2;

    return {
      noseX: noseTip.x / faceWidth,
      noseY: noseTip.y / faceWidth,
      ear,
      faceWidth,
    };
  };

  const checkLiveness = async (video) => {
    const s1 = await sampleFace(video);
    if (!s1) return { ok: false, reason: "Face not detected" };
    if (s1.tooSmall)
      return { ok: false, reason: "Face too small — move closer" };

    // wait ~1 second and take a second sample
    await new Promise((r) => setTimeout(r, 1000));

    const s2 = await sampleFace(video);
    if (!s2 || s2.tooSmall)
      return { ok: false, reason: "Face not stable — try again" };

    const dx  = Math.abs(s1.noseX - s2.noseX);
    const dy  = Math.abs(s1.noseY - s2.noseY);
    const dEar = Math.abs(s1.ear - s2.ear);

    const moved   = dx > 0.003 || dy > 0.003;
    const blinked = dEar > 0.03;

    console.log("Enroll liveness:", {
      dx: dx.toFixed(4), dy: dy.toFixed(4), dEar: dEar.toFixed(4),
      moved, blinked,
    });

    if (!moved && !blinked) {
      return {
        ok: false,
        reason:
          "📵 Mobile / Fake face detected!\n\n" +
          "Live person required. Please blink or move slightly and try again.",
      };
    }

    return { ok: true };
  };

  // ENROLL EMPLOYEE

  const handleEnroll = async () => {

    if (!employeeName) {

      alert("Enter Employee Name");

      return;

    }

    const video =
      webcamRef.current?.video;

    if (!video) {

      alert("Camera not ready");

      return;

    }

    // LIVENESS CHECK  (blocks phone/printed photos)

    setEnrolling(true);

    const liveness = await checkLiveness(video);
    if (!liveness.ok) {
      setEnrolling(false);
      alert("❌ Enrollment blocked\n\n" + liveness.reason);
      return;
    }

    // FACE DETECT

    const descriptor =
      await faceService.getFaceDescriptor(
        video
      );

    if (!descriptor) {
      setEnrolling(false);
      alert("Face not detected");
      return;
    }

    // DUPLICATE FACE CHECK

    const existingEmployees =
      await db.getEmployees();

    // duplicate name check (case-insensitive)
    const nameClash = existingEmployees.find(
      (e) =>
        (e.name || "").trim().toLowerCase() ===
        employeeName.trim().toLowerCase()
    );

    if (nameClash) {
      setEnrolling(false);
      alert(`Employee name "${employeeName}" already exists`);
      return;
    }

    const matched =
      faceService.matchFace(
        descriptor,
        existingEmployees
      );

    if (matched) {
      setEnrolling(false);
      alert(`This face is already enrolled as ${matched}`);
      return;
    }

    // SAVE PHOTO

    const photo =
      webcamRef.current.getScreenshot();

    // SAVE EMPLOYEE

    await db.saveEmployee({

      name: employeeName,

      descriptor:
        Array.from(descriptor),

      enrolledAt:
        new Date(),

      photo,

    });

    setEnrolling(false);

    alert(
      `${employeeName} enrolled successfully`
    );

    setEmployeeName("");

    loadData();

  };

  // TODAY DATE

  const today = new Date().toLocaleDateString();

  // TODAY ATTENDANCE (safe Firestore Timestamp handling)

  const todayAttendance = attendance
    .map((a) => ({ ...a, _t: toJsDate(a.time) }))
    .filter((a) => a._t && a._t.toLocaleDateString() === today);

  // PRESENT EMPLOYEES

  const presentEmployees =
employees.filter((emp) => {

  const logs =
    todayAttendance.filter(
      (a) => a.name === emp.name
    );

  return logs.length > 0;

});

  // LATE EMPLOYEES

  const lateEmployees = todayAttendance.filter((a) => {
    const time = a._t;
    return (
      a.type === "LOGIN" &&
      (
        time.getHours() > 9 ||
        (time.getHours() === 9 && time.getMinutes() > 0)
      )
    );
  });

  // HALF DAY

  const halfDayEmployees = employees.filter((emp) => {

    const logs = todayAttendance
      .filter((a) => a.name === emp.name)
      .sort((a, b) => a._t - b._t);

    const login = logs.find((a) => a.type === "LOGIN");
    const logout = [...logs].reverse().find((a) => a.type === "LOGOUT");

    if (!login || !logout) return false;

    const hours = (logout._t - login._t) / (1000 * 60 * 60);

    return hours < 4;

  });

  // ABSENT EMPLOYEES

 const absentEmployees =
employees.filter((emp) => {

  return !presentEmployees.some(
    (p) => p.name === emp.name
  );

});

  return (

    <div className="min-h-screen bg-black text-white p-8">

      {/* TOP */}

      <div className="flex justify-between items-center mb-10">

        <div>

          <h1 className="text-6xl font-bold text-green-400">
            ADMIN PANEL
          </h1>

          <p className="text-gray-400 mt-2 text-xl">
            Face Attendance Management
          </p>

        </div>

        <div className="text-right">

          <p className="text-gray-400">
            System Status
          </p>

          <p className="text-green-400 text-2xl font-bold">
            ● ONLINE
          </p>

        </div>

      </div>

      {/* STATS */}

      <div className="grid md:grid-cols-5 gap-6 mb-10">

        <div className="bg-[#111] rounded-3xl p-6 border border-green-500/20">

          <p className="text-gray-400">
            Total Employees
          </p>

          <h1 className="text-5xl font-bold text-green-400 mt-4">
            {employees.length}
          </h1>

        </div>

        <div className="bg-[#111] rounded-3xl p-6 border border-green-500/20">

          <p className="text-gray-400">
            Present
          </p>

          <h1 className="text-5xl font-bold text-green-400 mt-4">
            {presentEmployees.length}
          </h1>

        </div>

        <div className="bg-[#111] rounded-3xl p-6 border border-yellow-500/20">

          <p className="text-gray-400">
            Late Employees
          </p>

          <h1 className="text-5xl font-bold text-yellow-400 mt-4">
            {lateEmployees.length}
          </h1>

        </div>

        <div className="bg-[#111] rounded-3xl p-6 border border-blue-500/20">

          <p className="text-gray-400">
            Half Day
          </p>

          <h1 className="text-5xl font-bold text-blue-400 mt-4">
            {halfDayEmployees.length}
          </h1>

        </div>

        <div className="bg-[#111] rounded-3xl p-6 border border-red-500/20">

          <p className="text-gray-400">
            Absent Employees
          </p>

          <h1 className="text-5xl font-bold text-red-400 mt-4">
            {absentEmployees.length}
          </h1>

        </div>

      </div>

      {/* EXPORT */}

      <div className="flex gap-4 mb-8">

        <button
          onClick={() =>
            exportPDF(attendance)
          }
          className="bg-red-500 hover:bg-red-600 px-6 py-4 rounded-2xl text-xl font-bold"
        >

          Export PDF

        </button>

        <button
          onClick={() =>
            exportExcel(attendance)
          }
          className="bg-green-500 hover:bg-green-600 px-6 py-4 rounded-2xl text-xl font-bold"
        >

          Export Excel

        </button>

      </div>

      {/* ENROLL */}

      <div className="bg-[#111] rounded-3xl p-8 border border-green-500/20 mb-10">

        <h1 className="text-4xl font-bold text-green-400 mb-8">
          Enroll Employee
        </h1>

        <Webcam
  ref={webcamRef}
  audio={false}
  mirrored={true}
  screenshotFormat="image/jpeg"

  videoConstraints={{
    width: 350,
    height: 350,
    facingMode: "user",
  }}

  className="
    w-[350px]
    h-[350px]
    rounded-full
    border-4
    border-green-500
    object-cover
    mx-auto
    mb-6
  "
/>

        <div className="flex gap-4">

          <input
            type="text"
            placeholder="Employee Name"
            value={employeeName}
            onChange={(e) =>
              setEmployeeName(e.target.value)
            }
            className="flex-1 bg-black border border-white rounded-2xl p-5 text-xl"
          />

          <button
            onClick={handleEnroll}
            disabled={enrolling}
            className={`px-10 rounded-2xl text-2xl font-bold ${
              enrolling
                ? "bg-gray-600 cursor-not-allowed"
                : "bg-green-500 hover:bg-green-600"
            }`}
          >

            {enrolling ? "🔎 Verifying..." : "Enroll"}

          </button>

        </div>

      </div>

      {/* MONTHLY REPORT */}

      <MonthlyReport />

      {/* EMPLOYEE TABLE */}

      <EmployeeTable />

    </div>

  );

}

export default AdminDashboard;