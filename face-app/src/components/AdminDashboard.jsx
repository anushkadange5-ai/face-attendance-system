import { useState, useRef, useEffect } from "react";
import Webcam from "react-webcam";
import * as faceapi from "face-api.js";
import EmployeeDetails from "./EmployeeDetails";
import { faceService } from "../faceService";
import { authService } from "../authService";
import { db, tempId } from "../db";
import { toJsDate } from "../utils/time";
import { SHIFT_LIST, DEFAULT_SHIFT_ID, getShift, isLateLogin, isEarlyLogout } from "../utils/shifts";
import { loadSettings } from "../utils/settings";
import { encryptDescriptor } from "../utils/encryption";

const DEPARTMENTS = ["HR","Engineering","Sales","Marketing","Finance","Operations","IT","Administration","Customer Support","Research & Development"];
const ROLES = [
  { id: "employee", label: "Employee", icon: "👤" },
  { id: "manager",  label: "Manager",  icon: "👔" },
  { id: "admin",    label: "Admin",    icon: "🔐" },
];

function AdminDashboard({ adminUser }) {
  const [employeeName, setEmployeeName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [employeeDepartment, setEmployeeDepartment] = useState(DEPARTMENTS[0]);
  const [employeeRole, setEmployeeRole] = useState("employee");
  const [employeeShift, setEmployeeShift] = useState(DEFAULT_SHIFT_ID);
  const [enrolling, setEnrolling] = useState(false);
  const [enrollStep, setEnrollStep] = useState(0);
  const [capturedDescriptors, setCapturedDescriptors] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [searchName, setSearchName] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const webcamRef = useRef(null);
  const enrollmentStatusRef = useRef("");
  const enrollmentErrorRef = useRef("");

  useEffect(() => {
    const unsubEmp = db.subscribeEmployees(setEmployees);
    const unsubAtt = db.subscribeAttendance(setAttendance);
    return () => { unsubEmp?.(); unsubAtt?.(); };
  }, []);

  const handleLogout = async () => {
    if (!window.confirm("Log out?")) return;
    try { await authService.logout(); } catch (err) { alert("Logout failed: " + err?.message); }
  };

  const eyeAspect = (eye) => {
    const vert = (Math.hypot(eye[1].x-eye[5].x,eye[1].y-eye[5].y)+Math.hypot(eye[2].x-eye[4].x,eye[2].y-eye[4].y))/2;
    const horiz = Math.hypot(eye[0].x-eye[3].x,eye[0].y-eye[3].y);
    return horiz===0?0:vert/horiz;
  };

  const checkLiveness = async (video) => {
    const s = loadSettings();
    const sample = async () => {
      const det = await faceapi.detectSingleFace(video,new faceapi.TinyFaceDetectorOptions()).withFaceLandmarks();
      if(!det) return null;
      const jaw=det.landmarks.getJawOutline(); const fw=jaw[16].x-jaw[0].x;
      if(fw<s.minFaceSize) return {tooSmall:true};
      const n=det.landmarks.getNose()[3];
      const ear=(eyeAspect(det.landmarks.getLeftEye())+eyeAspect(det.landmarks.getRightEye()))/2;
      return {noseX:n.x/fw,noseY:n.y/fw,ear};
    };
    const s1=await sample(); if(!s1) return {ok:false,reason:"Face not detected"};
    if(s1.tooSmall) return {ok:false,reason:"Face too small — move closer"};
    await new Promise(r=>setTimeout(r,1000));
    const s2=await sample(); if(!s2||s2.tooSmall) return {ok:false,reason:"Face not stable"};
    const moved=Math.abs(s1.noseX-s2.noseX)>s.noseMovementThreshold||Math.abs(s1.noseY-s2.noseY)>s.noseMovementThreshold;
    const blinked=Math.abs(s1.ear-s2.ear)>s.blinkThreshold;
    if(!moved&&!blinked) return {ok:false,reason:"📵 Please blink or move slightly"};
    return {ok:true};
  };

  const captureForEnrollment = async () => {
    const video=webcamRef.current?.video;
    if(!video||video.readyState!==4){enrollmentErrorRef.current="Camera not ready";return;}
    if(loadSettings().requireLivenessCheck){
      enrollmentStatusRef.current="🔎 Verifying...";
      const lv=await checkLiveness(video);
      if(!lv.ok){enrollmentErrorRef.current=lv.reason;enrollmentStatusRef.current="";return;}
    }
    enrollmentStatusRef.current="📸 Capturing...";
    const desc=await faceService.getFaceDescriptor(video);
    if(!desc){enrollmentErrorRef.current="Could not detect face. Try again.";enrollmentStatusRef.current="";return;}
    enrollmentStatusRef.current="";enrollmentErrorRef.current="";
    setCapturedDescriptors(prev=>[...prev,Array.from(desc)]);
    setEnrollStep(enrollStep<3?enrollStep+1:4);
  };

  const startEnrollment = () => {
    if(!employeeName.trim()){alert("Enter employee name");return;}
    if(!employeeId.trim()){alert("Enter employee ID");return;}
    setEnrollStep(1);setCapturedDescriptors([]);
    enrollmentErrorRef.current="";enrollmentStatusRef.current="";
  };

  const saveEmployee = async () => {
    const settings=loadSettings();
    if(capturedDescriptors.length===0){alert("Capture at least one face");return;}
    const avg=new Float32Array(128);
    capturedDescriptors.forEach(d=>{for(let i=0;i<128;i++)avg[i]+=d[i]/capturedDescriptors.length;});
    setEnrolling(true);
    try {
      const existing=await db.getEmployees();
      if(existing.find(e=>(e.employeeId||"").toLowerCase()===employeeId.toLowerCase())){alert(`ID "${employeeId}" exists`);return;}
      if(existing.find(e=>(e.name||"").toLowerCase()===employeeName.toLowerCase())){alert(`Name "${employeeName}" exists`);return;}
      const dup=faceService.checkDuplicateFace(avg,existing);
      if(dup){alert(`Face already enrolled as ${dup.name}`);return;}
      const id=tempId("emp");
      let data={id,name:employeeName.trim(),employeeId:employeeId.trim(),department:employeeDepartment,role:employeeRole,shift:employeeShift,descriptor:Array.from(avg),enrolledAt:new Date(),photo:webcamRef.current?.getScreenshot()||null};
      if(settings.enableEncryption){try{data.descriptorEncrypted=await encryptDescriptor(avg);}catch(e){}}
      await db.saveEmployee(data);
      alert(`✅ ${employeeName} enrolled!`);
      setEmployeeName("");setEmployeeId("");setEmployeeDepartment(DEPARTMENTS[0]);setEmployeeRole("employee");setEmployeeShift(DEFAULT_SHIFT_ID);setEnrollStep(0);setCapturedDescriptors([]);
    } catch(err){alert("❌ "+err?.message);}
    finally{setEnrolling(false);}
  };

  const cancelEnrollment = () => {
    if(window.confirm("Cancel enrollment?")){setEnrollStep(0);setCapturedDescriptors([]);enrollmentErrorRef.current="";enrollmentStatusRef.current="";}
  };

  const handleDelete = async (employee, e) => {
    e.stopPropagation();
    if(!window.confirm(`Delete "${employee.name}"?`)) return;
    try{setDeletingId(employee.id);await db.deleteEmployee(employee);}
    catch(err){alert("❌ "+err?.message);}
    finally{setDeletingId(null);}
  };

  const today=new Date().toLocaleDateString();
  const todayAtt=attendance.map(a=>({...a,_t:toJsDate(a.time)})).filter(a=>a._t&&a._t.toLocaleDateString()===today);
  const presentEmps=employees.filter(emp=>todayAtt.some(a=>a.name===emp.name));
  const shiftByName=Object.fromEntries(employees.map(e=>[e.name,e.shift||DEFAULT_SHIFT_ID]));
  const lateEmps=todayAtt.filter(a=>a.type==="LOGIN"&&isLateLogin(a._t,shiftByName[a.name]));
  const halfEmps=employees.filter(emp=>{
    const logs=todayAtt.filter(a=>a.name===emp.name).sort((a,b)=>a._t-b._t);
    const login=logs.find(a=>a.type==="LOGIN"),logout=[...logs].reverse().find(a=>a.type==="LOGOUT");
    return login&&logout&&isEarlyLogout(login._t,logout._t,emp.shift||DEFAULT_SHIFT_ID);
  });
  const absentEmps=employees.filter(emp=>!presentEmps.some(p=>p.name===emp.name));

  const stepLabels=["","📷 Front","👈 Left","👉 Right","💾 Save"];
  const inp="w-full bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-gray-800 text-sm focus:outline-none focus:border-purple-500";

  const filteredEmps=employees.filter(e=>!searchName||e.name.toLowerCase().includes(searchName.toLowerCase())||e.employeeId?.toLowerCase().includes(searchName.toLowerCase()));
  const roleIcons={admin:"🔐",manager:"👔",employee:"👤"};

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-purple-50 to-white overflow-hidden">

      {/* TOP BAR */}
      <div className="flex items-center justify-between px-5 py-3 bg-white border-b border-purple-100 shadow-sm shrink-0">
        <div>
          <h1 className="text-xl font-bold text-purple-700">🏢 Admin Panel</h1>
          <p className="text-gray-400 text-xs">Face Attendance Management</p>
        </div>

        {/* STATS inline */}
        <div className="hidden md:flex gap-3">
          {[
            {label:"Total",value:employees.length,color:"text-purple-700"},
            {label:"Present",value:presentEmps.length,color:"text-green-600"},
            {label:"Late",value:lateEmps.length,color:"text-yellow-500"},
            {label:"Half Day",value:halfEmps.length,color:"text-blue-500"},
            {label:"Absent",value:absentEmps.length,color:"text-red-500"},
          ].map(s=>(
            <div key={s.label} className="text-center bg-purple-50 rounded-xl px-4 py-1.5 border border-purple-100">
              <p className="text-gray-400 text-[10px]">{s.label}</p>
              <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <p className="text-purple-600 text-xs font-semibold hidden sm:block truncate max-w-[140px]">{adminUser?.email}</p>
          <button onClick={handleLogout} className="bg-red-100 hover:bg-red-500 hover:text-white text-red-600 border border-red-200 px-3 py-1.5 rounded-xl font-bold transition text-xs mr-24">
            🚪 Logout
          </button>
        </div>
      </div>

      {/* MAIN BODY — 2 columns */}
      <div className="flex flex-1 gap-4 p-4 overflow-hidden">

        {/* LEFT PANEL — fixed, no scroll */}
        <div className="w-80 shrink-0 flex flex-col gap-3 overflow-hidden">

          {/* ENROLL CARD */}
          <div className="bg-white rounded-2xl border border-purple-100 shadow-sm p-4 flex-shrink-0">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-bold text-purple-700">👤 Enroll Employee</h2>
              {enrollStep>0&&<button onClick={cancelEnrollment} className="text-red-500 text-xs hover:underline">✕ Cancel</button>}
            </div>

            {/* Step indicator */}
            {enrollStep>0&&(
              <div className="flex items-center gap-1 mb-3">
                {[1,2,3,4].map(s=>(
                  <div key={s} className="flex items-center">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${s<=enrollStep?"bg-purple-600 text-white":"bg-gray-200 text-gray-400"}`}>{s}</div>
                    {s<4&&<div className={`w-4 h-0.5 ${s<enrollStep?"bg-purple-600":"bg-gray-200"}`}/>}
                  </div>
                ))}
                <span className="ml-1 text-purple-600 text-xs font-bold">{stepLabels[enrollStep]}</span>
              </div>
            )}

            {enrollStep===0&&(
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-gray-400 text-[10px] block mb-1">Employee ID *</label>
                    <input type="text" placeholder="EMP001" value={employeeId} onChange={e=>setEmployeeId(e.target.value.toUpperCase())} className={inp}/>
                  </div>
                  <div>
                    <label className="text-gray-400 text-[10px] block mb-1">Full Name *</label>
                    <input type="text" placeholder="Name" value={employeeName} onChange={e=>setEmployeeName(e.target.value)} className={inp}/>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-gray-400 text-[10px] block mb-1">Department</label>
                    <select value={employeeDepartment} onChange={e=>setEmployeeDepartment(e.target.value)} className={inp}>
                      {DEPARTMENTS.map(d=><option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-gray-400 text-[10px] block mb-1">Role</label>
                    <select value={employeeRole} onChange={e=>setEmployeeRole(e.target.value)} className={inp}>
                      {ROLES.map(r=><option key={r.id} value={r.id}>{r.icon} {r.label}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-gray-400 text-[10px] block mb-1">Work Shift</label>
                  <select value={employeeShift} onChange={e=>setEmployeeShift(e.target.value)} className={inp}>
                    {SHIFT_LIST.map(s=><option key={s.id} value={s.id}>{s.emoji} {s.label} ({s.loginAt}–{s.logoutAt})</option>)}
                  </select>
                </div>
                <button onClick={startEnrollment} className="w-full bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-xl font-bold text-sm transition">
                  📷 Start Face Capture
                </button>
              </div>
            )}

            {enrollStep>=1&&enrollStep<=3&&(
              <div className="text-center space-y-2">
                <Webcam ref={webcamRef} audio={false} mirrored={true} screenshotFormat="image/jpeg"
                  videoConstraints={{width:200,height:200,facingMode:"user"}}
                  className="w-[200px] h-[200px] rounded-full border-4 border-purple-500 object-cover mx-auto"/>
                {enrollmentStatusRef.current&&<p className="text-yellow-600 text-xs font-bold">{enrollmentStatusRef.current}</p>}
                {enrollmentErrorRef.current&&<p className="text-red-500 text-xs font-bold">{enrollmentErrorRef.current}</p>}
                <button onClick={captureForEnrollment} disabled={enrolling}
                  className={`w-full py-2 rounded-xl font-bold text-sm transition ${enrolling?"bg-gray-300 text-gray-500 cursor-not-allowed":"bg-purple-600 hover:bg-purple-700 text-white"}`}>
                  {enrolling?"⏳ Processing...":`📸 Capture ${stepLabels[enrollStep]}`}
                </button>
                <p className="text-gray-400 text-[10px]">
                  {enrollStep===1&&"Look straight, blink naturally"}
                  {enrollStep===2&&"Turn slightly LEFT"}
                  {enrollStep===3&&"Turn slightly RIGHT"}
                </p>
              </div>
            )}

            {enrollStep===4&&(
              <div className="space-y-2">
                <div className="bg-purple-50 rounded-xl p-3 text-xs space-y-1">
                  {[["ID",employeeId],["Name",employeeName],["Dept",employeeDepartment],["Role",employeeRole],["Shift",`${getShift(employeeShift).emoji} ${getShift(employeeShift).label}`],["Captured",capturedDescriptors.length]].map(([k,v])=>(
                    <div key={k} className="flex justify-between"><span className="text-gray-400">{k}</span><span className="font-bold text-gray-700">{v}</span></div>
                  ))}
                </div>
                {enrollmentErrorRef.current&&<p className="text-red-500 text-xs">{enrollmentErrorRef.current}</p>}
                <div className="flex gap-2">
                  <button onClick={()=>setEnrollStep(1)} className="flex-1 bg-yellow-400 hover:bg-yellow-500 text-white py-2 rounded-xl font-bold text-xs">🔄 Redo</button>
                  <button onClick={saveEmployee} disabled={enrolling}
                    className={`flex-1 py-2 rounded-xl font-bold text-xs transition ${enrolling?"bg-gray-300 text-gray-500":"bg-purple-600 hover:bg-purple-700 text-white"}`}>
                    {enrolling?"⏳ Saving...":"💾 Save"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* TODAY LOGS — scrollable inside fixed height */}
          <div className="bg-white rounded-2xl border border-purple-100 shadow-sm p-4 flex flex-col min-h-0 flex-1">
            <div className="flex justify-between items-center mb-2 shrink-0">
              <h2 className="text-sm font-bold text-purple-700">📋 Today's Attendance</h2>
              <span className="text-gray-400 text-xs">{todayAtt.length} entries</span>
            </div>
            <div className="overflow-y-auto flex-1 space-y-1.5 pr-1">
              {[...todayAtt].sort((a,b)=>b._t-a._t).map((log,idx)=>(
                <div key={log.id||idx} className="bg-purple-50 border border-purple-100 rounded-xl px-3 py-2 flex justify-between items-center">
                  <p className="font-semibold text-xs text-gray-800">{log.name}</p>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${log.type==="LOGIN"?"bg-green-100 text-green-700":"bg-red-100 text-red-600"}`}>{log.type}</span>
                    <span className="text-gray-400 text-[10px]">{log._t.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})}</span>
                  </div>
                </div>
              ))}
              {todayAtt.length===0&&<p className="text-gray-400 text-center py-4 text-xs">No attendance today.</p>}
            </div>
          </div>
        </div>

        {/* RIGHT PANEL — employee grid, only this scrolls */}
        <div className="flex-1 bg-white rounded-2xl border border-purple-100 shadow-sm p-4 flex flex-col min-h-0">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-3 shrink-0">
            <h2 className="text-sm font-bold text-purple-700">👥 Employees ({filteredEmps.length})</h2>
            <input type="text" placeholder="🔍 Search..." value={searchName} onChange={e=>setSearchName(e.target.value)}
              className="bg-purple-50 border border-purple-200 rounded-xl px-3 py-1.5 text-gray-700 text-xs w-48 focus:outline-none focus:border-purple-500"/>
          </div>

          <div className="overflow-y-auto flex-1 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 content-start pr-1">
            {filteredEmps.map((emp,idx)=>{
              const shift=getShift(emp.shift||DEFAULT_SHIFT_ID);
              const lateCount=attendance.filter(a=>{if(a.name!==emp.name||a.type!=="LOGIN")return false;const t=toJsDate(a.time);return t&&isLateLogin(t,emp.shift||DEFAULT_SHIFT_ID);}).length;
              return (
                <div key={emp.id||idx} onClick={()=>setSelectedEmployee(emp)}
                  className="relative bg-purple-50 border border-purple-100 rounded-2xl p-3 cursor-pointer hover:border-purple-400 hover:shadow-md transition">
                  <button onClick={e=>handleDelete(emp,e)} disabled={deletingId===emp.id}
                    className={`absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-lg text-[10px] transition ${deletingId===emp.id?"bg-gray-200":"bg-red-100 text-red-500 hover:bg-red-500 hover:text-white"}`}>
                    {deletingId===emp.id?"…":"🗑"}
                  </button>
                  <div className="flex items-center gap-2 mb-2 pr-7">
                    <img src={emp.photo||`https://ui-avatars.com/api/?name=${encodeURIComponent(emp.name)}&background=7c3aed&color=fff`}
                      alt={emp.name} className="w-10 h-10 rounded-full object-cover border-2 border-purple-400 shrink-0"/>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-gray-800 truncate">{emp.name}</p>
                      <p className="text-purple-500 text-[10px] font-mono">{emp.employeeId||"No ID"}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-2">
                    <span className="bg-blue-100 text-blue-600 rounded px-1.5 py-0.5 text-[10px]">{emp.department||"Other"}</span>
                    <span className="bg-purple-100 text-purple-600 rounded px-1.5 py-0.5 text-[10px]">{roleIcons[emp.role]||"👤"} {emp.role}</span>
                  </div>
                  <div className="bg-white border border-purple-100 rounded-lg px-2 py-1 text-[10px] mb-2">
                    <span className="font-bold text-purple-600">{shift.emoji} {shift.label}</span>
                    <span className="text-gray-400 ml-1">{shift.loginAt}–{shift.logoutAt}</span>
                  </div>
                  <div className="flex gap-1 text-center">
                    <div className="flex-1 bg-white rounded-lg py-1 border border-purple-100">
                      <p className="text-gray-400 text-[9px]">Late</p>
                      <p className="text-yellow-500 text-sm font-bold">{lateCount}</p>
                    </div>
                    <div className="flex-1 bg-white rounded-lg py-1 border border-purple-100">
                      <p className="text-gray-400 text-[9px]">Enrolled</p>
                      <p className="text-gray-600 text-[10px] font-bold">
                        {toJsDate(emp.enrolledAt)?.toLocaleDateString(undefined,{month:"short",day:"numeric"})||"N/A"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredEmps.length===0&&(
              <p className="text-gray-400 col-span-full text-center py-8 text-sm">
                {employees.length===0?"No employees yet. Enroll one.":"No match found."}
              </p>
            )}
          </div>
        </div>
      </div>

      {selectedEmployee&&(
        <EmployeeDetails employee={selectedEmployee} attendance={attendance} onClose={()=>setSelectedEmployee(null)}/>
      )}
    </div>
  );
}

export default AdminDashboard;
