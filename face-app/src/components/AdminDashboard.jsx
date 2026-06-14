import { useState, useRef, useEffect } from "react";
import Webcam from "react-webcam";
import * as faceapi from "face-api.js";
import EmployeeTable from "./EmployeeTable";
import SettingsPanel from "./SettingsPanel";
import { faceService } from "../faceService";
import { authService } from "../authService";
import { db, tempId } from "../db";
import { toJsDate } from "../utils/time";
import {
  SHIFT_LIST,
  DEFAULT_SHIFT_ID,
  getShift,
  isLateLogin,
  isEarlyLogout,
} from "../utils/shifts";
import { exportPDF } from "../utils/exportPDF";
import { exportExcel } from "../utils/exportExcel";
import { loadSettings } from "../utils/settings";
import { encryptDescriptor } from "../utils/encryption";

// Departments
const DEPARTMENTS = [
  "HR",
  "Engineering",
  "Sales",
  "Marketing",
  "Finance",
  "Operations",
  "IT",
  "Administration",
  "Customer Support",
  "Research & Development",
];

// Roles
const ROLES = [
  { id: "employee", label: "Employee", icon: "👤" },
  { id: "manager", label: "Manager", icon: "👔" },
  { id: "admin", label: "Admin", icon: "🔐" },
];

function AdminDashboard({ adminUser }) {

  // STATES
  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeDepartment, setEmployeeDepartment] = useState(DEPARTMENTS[0]);
  const [employeeRole, setEmployeeRole] = useState("employee");
  const [employeeShift, setEmployeeShift] = useState(DEFAULT_SHIFT_ID);
  
  const [enrolling, setEnrolling] = useState(false);
  const [enrollStep, setEnrollStep] = useState(0); // 0: name form, 1: front, 2: left, 3: right, 4: save
  const [capturedDescriptors, setCapturedDescriptors] = useState([]);
  
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [showSettings, setShowSettings] = useState(false);
  
  const webcamRef = useRef(null);
  const enrollmentStatusRef = useRef("");
  const enrollmentErrorRef = useRef("");

  // LOAD DATABASE — real-time subscriptions
  useEffect(() => {
    const unsubEmp = db.subscribeEmployees(setEmployees);
    const unsubAtt = db.subscribeAttendance(setAttendance);
    return () => {
      unsubEmp && unsubEmp();
      unsubAtt && unsubAtt();
    };
  }, []);

  // helper to manually refresh after enroll
  const loadData = async () => {
    const employeeData = await db.getEmployees();
    const attendanceData = await db.getAttendance();
    setEmployees(employeeData);
    setAttendance(attendanceData);
  };

  // LOGOUT
  const handleLogout = async () => {
    if (!window.confirm("Log out of the admin panel?")) return;
    try {
      await authService.logout();
    } catch (err) {
      console.error("Logout failed:", err);
      alert("Logout failed: " + (err?.message || err));
    }
  };

  // EYE ASPECT RATIO HELPER
  const eyeAspect = (eye) => {
    const vert =
      (Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y) +
       Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y)) / 2;
    const horiz = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
    return horiz === 0 ? 0 : vert / horiz;
  };

  // LIVENESS CHECK
  const checkLiveness = async (video) => {
    const settings = loadSettings();
    
    const sampleFace = async () => {
      const det = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();
      if (!det) return null;

      const jaw = det.landmarks.getJawOutline();
      const faceWidth = jaw[16].x - jaw[0].x;
      
      if (faceWidth < settings.minFaceSize) return { tooSmall: true };

      const noseTip = det.landmarks.getNose()[3];
      const ear = (eyeAspect(det.landmarks.getLeftEye()) + eyeAspect(det.landmarks.getRightEye())) / 2;

      return {
        noseX: noseTip.x / faceWidth,
        noseY: noseTip.y / faceWidth,
        ear,
        faceWidth,
      };
    };

    const s1 = await sampleFace();
    if (!s1) return { ok: false, reason: "Face not detected" };
    if (s1.tooSmall) return { ok: false, reason: `Face too small — move closer (min ${settings.minFaceSize}px)` };

    // wait ~1 second and take a second sample
    await new Promise((r) => setTimeout(r, 1000));

    const s2 = await sampleFace();
    if (!s2 || s2.tooSmall) return { ok: false, reason: "Face not stable — try again" };

    const dx = Math.abs(s1.noseX - s2.noseX);
    const dy = Math.abs(s1.noseY - s2.noseY);
    const dEar = Math.abs(s1.ear - s2.ear);

    const moved = dx > settings.noseMovementThreshold || dy > settings.noseMovementThreshold;
    const blinked = dEar > settings.blinkThreshold;

    if (!moved && !blinked) {
      return {
        ok: false,
        reason: "📵 Fake face detected! Please blink or move slightly.",
      };
    }

    return { ok: true };
  };

  // CAPTURE FACE FOR ENROLLMENT
  const captureForEnrollment = async () => {
    const video = webcamRef.current?.video;
    if (!video) {
      enrollmentErrorRef.current = "Camera not ready";
      return;
    }

    if (video.readyState !== 4) {
      enrollmentErrorRef.current = "Camera still loading...";
      return;
    }

    // Check liveness
    if (loadSettings().requireLivenessCheck) {
      enrollmentStatusRef.current = "🔎 Verifying you're real...";
      const liveness = await checkLiveness(video);
      if (!liveness.ok) {
        enrollmentErrorRef.current = liveness.reason;
        enrollmentStatusRef.current = "";
        return;
      }
    }

    // Get face descriptor
    enrollmentStatusRef.current = "📸 Capturing face...";
    const descriptor = await faceService.getFaceDescriptor(video);
    
    if (!descriptor) {
      enrollmentErrorRef.current = "Could not detect face clearly. Please try again.";
      enrollmentStatusRef.current = "";
      return;
    }

    enrollmentStatusRef.current = "";
    enrollmentErrorRef.current = "";

    // Add to captured descriptors
    setCapturedDescriptors(prev => [...prev, Array.from(descriptor)]);
    
    // Move to next step
    if (enrollStep < 3) {
      setEnrollStep(enrollStep + 1);
    } else {
      setEnrollStep(4); // Ready to save
    }
  };

  // START ENROLLMENT PROCESS
  const startEnrollment = () => {
    if (!employeeName.trim()) {
      alert("Please enter employee name");
      return;
    }
    if (!employeeId.trim()) {
      alert("Please enter employee ID");
      return;
    }
    setEnrollStep(1);
    setCapturedDescriptors([]);
    enrollmentErrorRef.current = "";
    enrollmentStatusRef.current = "";
  };

  // SAVE EMPLOYEE
  const saveEmployee = async () => {
    const settings = loadSettings();
    
    if (capturedDescriptors.length === 0) {
      alert("Please capture at least one face image");
      return;
    }

    // Average all captured descriptors for better accuracy
    const avgDescriptor = new Float32Array(128);
    capturedDescriptors.forEach(desc => {
      for (let i = 0; i < 128; i++) {
        avgDescriptor[i] += desc[i] / capturedDescriptors.length;
      }
    });

    setEnrolling(true);

    try {
      // Check for duplicate employee ID
      const existingEmployees = await db.getEmployees();
      const idClash = existingEmployees.find(
        (e) => (e.employeeId || "").trim().toLowerCase() === employeeId.trim().toLowerCase()
      );
      if (idClash) {
        alert(`Employee ID "${employeeId}" already exists`);
        setEnrolling(false);
        return;
      }

      // Check for duplicate name
      const nameClash = existingEmployees.find(
        (e) => (e.name || "").trim().toLowerCase() === employeeName.trim().toLowerCase()
      );
      if (nameClash) {
        alert(`Employee name "${employeeName}" already exists`);
        setEnrolling(false);
        return;
      }

      // Check for duplicate face
      const duplicate = faceService.checkDuplicateFace(avgDescriptor, existingEmployees);
      if (duplicate) {
        alert(`This face is already enrolled as ${duplicate.name}`);
        setEnrolling(false);
        return;
      }

      const id = tempId("emp");
      
      // Prepare employee data
      let employeeData = {
        id,
        name: employeeName.trim(),
        employeeId: employeeId.trim(),
        department: employeeDepartment,
        role: employeeRole,
        shift: employeeShift,
        descriptor: Array.from(avgDescriptor),
        enrolledAt: new Date(),
        photo: webcamRef.current?.getScreenshot() || null,
      };

      // Encrypt descriptor if enabled
      if (settings.enableEncryption) {
        try {
          employeeData.descriptorEncrypted = await encryptDescriptor(avgDescriptor);
          employeeData.descriptor = null; // Don't store plain
        } catch (e) {
          console.warn("Encryption failed, storing plain:", e);
        }
      }

      await db.saveEmployee(employeeData);

      alert(`✅ ${employeeName} enrolled successfully!\n\nEmployee ID: ${employeeId}\nDepartment: ${employeeDepartment}\nRole: ${employeeRole}\nShifts: ${getShift(employeeShift).emoji} ${getShift(employeeShift).label}`);

      // Reset form
      setEmployeeName("");
      setEmployeeId("");
      setEmployeeDepartment(DEPARTMENTS[0]);
      setEmployeeRole("employee");
      setEmployeeShift(DEFAULT_SHIFT_ID);
      setEnrollStep(0);
      setCapturedDescriptors([]);
      
      loadData();
    } catch (err) {
      console.error("Enrollment error:", err);
      alert("❌ Enrollment failed: " + (err?.message || err));
    } finally {
      setEnrolling(false);
    }
  };

  // CANCEL ENROLLMENT
  const cancelEnrollment = () => {
    if (window.confirm("Cancel enrollment? Captured faces will be lost.")) {
      setEnrollStep(0);
      setCapturedDescriptors([]);
      enrollmentErrorRef.current = "";
      enrollmentStatusRef.current = "";
    }
  };

  // TODAY DATE
  const today = new Date().toLocaleDateString();

  // TODAY ATTENDANCE
  const todayAttendance = attendance
    .map((a) => ({ ...a, _t: toJsDate(a.time) }))
    .filter((a) => a._t && a._t.toLocaleDateString() === today);

  // PRESENT EMPLOYEES
  const presentEmployees = employees.filter((emp) => {
    const logs = todayAttendance.filter((a) => a.name === emp.name);
    return logs.length > 0;
  });

  const shiftByName = {};
  employees.forEach((e) => {
    shiftByName[e.name] = e.shift || DEFAULT_SHIFT_ID;
  });

  // LATE EMPLOYEES
  const lateEmployees = todayAttendance.filter((a) => {
    if (a.type !== "LOGIN") return false;
    return isLateLogin(a._t, shiftByName[a.name]);
  });

  // HALF DAY
  const halfDayEmployees = employees.filter((emp) => {
    const logs = todayAttendance
      .filter((a) => a.name === emp.name)
      .sort((a, b) => a._t - b._t);

    const login = logs.find((a) => a.type === "LOGIN");
    const logout = [...logs].reverse().find((a) => a.type === "LOGOUT");

    if (!login || !logout) return false;
    return isEarlyLogout(login._t, logout._t, emp.shift || DEFAULT_SHIFT_ID);
  });

  // ABSENT EMPLOYEES
  const absentEmployees = employees.filter((emp) => {
    return !presentEmployees.some((p) => p.name === emp.name);
  });

  // Enrollment step labels
  const stepLabels = ["", "📷 Front View", "👈 Left Profile", "👉 Right Profile", "💾 Save"];

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      
      {/* Settings Modal */}
      {showSettings && (
        <SettingsPanel
          adminUser={adminUser}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* TOP */}
      <div className="flex flex-wrap justify-between items-center gap-4 mb-8">
        <div>
          <h1 className="text-4xl md:text-5xl font-bold text-green-400">
            ADMIN PANEL
          </h1>
          <p className="text-gray-400 mt-2 text-lg">
            Face Attendance Management System
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(true)}
            className="bg-blue-500/20 hover:bg-blue-500 hover:text-black text-blue-400 border border-blue-500/40 px-4 py-2 rounded-xl font-bold transition"
          >
            ⚙️ Settings
          </button>

          <div className="text-right hidden sm:block">
            <p className="text-gray-400 text-sm">
              Signed in as
            </p>
            <p className="text-green-400 font-bold truncate max-w-[180px]">
              {adminUser?.email || "Admin"}
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="bg-red-500/20 hover:bg-red-500 hover:text-white text-red-400 border border-red-500/40 px-4 py-2 rounded-xl font-bold transition"
          >
            🚪 Logout
          </button>
        </div>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        <div className="bg-[#111] rounded-2xl p-4 border border-green-500/20">
          <p className="text-gray-400 text-sm">Total Employees</p>
          <h1 className="text-4xl font-bold text-green-400 mt-2">
            {employees.length}
          </h1>
        </div>

        <div className="bg-[#111] rounded-2xl p-4 border border-green-500/20">
          <p className="text-gray-400 text-sm">Present</p>
          <h1 className="text-4xl font-bold text-green-400 mt-2">
            {presentEmployees.length}
          </h1>
        </div>

        <div className="bg-[#111] rounded-2xl p-4 border border-yellow-500/20">
          <p className="text-gray-400 text-sm">Late</p>
          <h1 className="text-4xl font-bold text-yellow-400 mt-2">
            {lateEmployees.length}
          </h1>
        </div>

        <div className="bg-[#111] rounded-2xl p-4 border border-blue-500/20">
          <p className="text-gray-400 text-sm">Half Day</p>
          <h1 className="text-4xl font-bold text-blue-400 mt-2">
            {halfDayEmployees.length}
          </h1>
        </div>

        <div className="bg-[#111] rounded-2xl p-4 border border-red-500/20">
          <p className="text-gray-400 text-sm">Absent</p>
          <h1 className="text-4xl font-bold text-red-400 mt-2">
            {absentEmployees.length}
          </h1>
        </div>
      </div>

      {/* EXPORT */}
      <div className="flex flex-wrap gap-3 mb-8">
        <button
          onClick={() => exportPDF(attendance)}
          className="bg-red-500 hover:bg-red-600 px-5 py-3 rounded-xl text-lg font-bold"
        >
          📄 Export PDF
        </button>
        <button
          onClick={() => exportExcel(attendance)}
          className="bg-green-500 hover:bg-green-600 px-5 py-3 rounded-xl text-lg font-bold"
        >
          📊 Export Excel
        </button>
      </div>

      {/* ENROLLMENT SECTION */}
      <div className="bg-[#111] rounded-3xl p-6 md:p-8 border border-green-500/20 mb-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-green-400">
            👤 Enroll Employee
          </h1>
          {enrollStep > 0 && (
            <button
              onClick={cancelEnrollment}
              className="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white px-4 py-2 rounded-xl font-bold transition"
            >
              ✕ Cancel
            </button>
          )}
        </div>

        {/* Enrollment Step Indicator */}
        {enrollStep > 0 && (
          <div className="mb-6 flex items-center gap-2">
            {[1, 2, 3, 4].map((step) => (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                  step <= enrollStep
                    ? "bg-green-500 text-black"
                    : "bg-gray-700 text-gray-400"
                }`}>
                  {step}
                </div>
                {step < 4 && (
                  <div className={`w-8 h-1 ${step < enrollStep ? "bg-green-500" : "bg-gray-700"}`} />
                )}
              </div>
            ))}
            <span className="ml-3 text-green-400 font-bold">
              {stepLabels[enrollStep]}
            </span>
            {capturedDescriptors.length > 0 && (
              <span className="ml-2 text-gray-400 text-sm">
                ({capturedDescriptors.length} captured)
              </span>
            )}
          </div>
        )}

        {/* Step 0: Basic Info Form */}
        {enrollStep === 0 && (
          <div className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Employee ID *</label>
                <input
                  type="text"
                  placeholder="e.g. EMP001"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value.toUpperCase())}
                  className="w-full bg-black border border-green-500/30 rounded-xl p-3 text-white text-lg"
                />
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">Full Name *</label>
                <input
                  type="text"
                  placeholder="Employee Name"
                  value={employeeName}
                  onChange={(e) => setEmployeeName(e.target.value)}
                  className="w-full bg-black border border-green-500/30 rounded-xl p-3 text-white text-lg"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-gray-400 text-sm mb-2">Department</label>
                <select
                  value={employeeDepartment}
                  onChange={(e) => setEmployeeDepartment(e.target.value)}
                  className="w-full bg-black border border-green-500/30 rounded-xl p-3 text-white text-lg"
                >
                  {DEPARTMENTS.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-gray-400 text-sm mb-2">Role</label>
                <select
                  value={employeeRole}
                  onChange={(e) => setEmployeeRole(e.target.value)}
                  className="w-full bg-black border border-green-500/30 rounded-xl p-3 text-white text-lg"
                >
                  {ROLES.map((role) => (
                    <option key={role.id} value={role.id}>{role.icon} {role.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-gray-400 text-sm mb-2">Work Shift</label>
              <select
                value={employeeShift}
                onChange={(e) => setEmployeeShift(e.target.value)}
                className="w-full bg-black border border-green-500/30 rounded-xl p-3 text-white text-lg max-w-md"
              >
                {SHIFT_LIST.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.emoji} {s.label} ({s.loginAt} – {s.logoutAt})
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={startEnrollment}
              className="bg-green-500 hover:bg-green-600 px-8 py-4 rounded-xl text-xl font-bold transition"
            >
              📷 Start Face Capture
            </button>
          </div>
        )}

        {/* Steps 1-3: Face Capture */}
        {enrollStep >= 1 && enrollStep <= 3 && (
          <div className="space-y-4">
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
              className="w-[350px] h-[350px] rounded-full border-4 border-green-500 object-cover mx-auto"
            />

            {enrollmentStatusRef.current && (
              <p className="text-yellow-400 text-center text-lg font-bold">
                {enrollmentStatusRef.current}
              </p>
            )}

            {enrollmentErrorRef.current && (
              <p className="text-red-400 text-center text-lg font-bold">
                {enrollmentErrorRef.current}
              </p>
            )}

            <button
              onClick={captureForEnrollment}
              disabled={enrolling}
              className={`w-full max-w-md mx-auto block px-6 py-4 rounded-xl text-xl font-bold transition ${
                enrolling
                  ? "bg-gray-600 cursor-not-allowed"
                  : "bg-green-500 hover:bg-green-600"
              }`}
            >
              {enrolling ? "⏳ Processing..." : `📸 Capture ${stepLabels[enrollStep]}`}
            </button>

            <p className="text-gray-400 text-center text-sm">
              {enrollStep === 1 && "Look straight at the camera and blink naturally"}
              {enrollStep === 2 && "Turn your head slightly to the LEFT"}
              {enrollStep === 3 && "Turn your head slightly to the RIGHT"}
            </p>
          </div>
        )}

        {/* Step 4: Review and Save */}
        {enrollStep === 4 && (
          <div className="space-y-6">
            <div className="bg-black rounded-2xl p-6 border border-green-500/20">
              <h3 className="text-2xl font-bold text-green-400 mb-4">📋 Employee Details</h3>
              
              <div className="grid md:grid-cols-2 gap-4 text-lg">
                <div>
                  <span className="text-gray-400">Employee ID:</span>
                  <span className="ml-2 text-white font-bold">{employeeId}</span>
                </div>
                <div>
                  <span className="text-gray-400">Name:</span>
                  <span className="ml-2 text-white font-bold">{employeeName}</span>
                </div>
                <div>
                  <span className="text-gray-400">Department:</span>
                  <span className="ml-2 text-white font-bold">{employeeDepartment}</span>
                </div>
                <div>
                  <span className="text-gray-400">Role:</span>
                  <span className="ml-2 text-white font-bold">
                    {ROLES.find(r => r.id === employeeRole)?.icon} {employeeRole}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Shift:</span>
                  <span className="ml-2 text-white font-bold">
                    {getShift(employeeShift).emoji} {getShift(employeeShift).label}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Faces Captured:</span>
                  <span className="ml-2 text-green-400 font-bold">{capturedDescriptors.length}</span>
                </div>
              </div>
            </div>

            {enrollmentErrorRef.current && (
              <p className="text-red-400 text-center text-lg font-bold">
                {enrollmentErrorRef.current}
              </p>
            )}

            <div className="flex gap-4 justify-center">
              <button
                onClick={() => setEnrollStep(1)}
                className="bg-yellow-500 hover:bg-yellow-600 px-6 py-4 rounded-xl text-lg font-bold transition"
              >
                🔄 Recapture Faces
              </button>
              <button
                onClick={saveEmployee}
                disabled={enrolling}
                className={`px-8 py-4 rounded-xl text-xl font-bold transition ${
                  enrolling
                    ? "bg-gray-600 cursor-not-allowed"
                    : "bg-green-500 hover:bg-green-600"
                }`}
              >
                {enrolling ? "⏳ Saving..." : "💾 Save Employee"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TODAY'S ATTENDANCE LOGS */}
      <div className="bg-[#111] rounded-3xl p-6 border border-green-500/20 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl font-bold text-green-400">
            📋 Today's Attendance Logs
          </h1>
          <p className="text-gray-400 text-sm">
            {todayAttendance.length} entries
          </p>
        </div>

        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {[...todayAttendance]
            .sort((a, b) => b._t - a._t)
            .map((log, idx) => (
              <div
                key={log.id || idx}
                className="bg-black border border-green-500/10 rounded-xl px-4 py-3 flex justify-between items-center"
              >
                <p className="font-semibold">{log.name}</p>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-lg text-xs font-bold ${
                    log.type === "LOGIN"
                      ? "bg-green-500/20 text-green-400"
                      : "bg-red-500/20 text-red-400"
                  }`}>
                    {log.type}
                  </span>
                  <span className="text-gray-400 text-sm w-20 text-right">
                    {log._t.toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}

          {todayAttendance.length === 0 && (
            <p className="text-gray-500 text-center py-6 text-sm">
              No attendance marked yet today.
            </p>
          )}
        </div>
      </div>

      {/* EMPLOYEE TABLE */}
      <EmployeeTable />
    </div>
  );
}

export default AdminDashboard;