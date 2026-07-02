import { useState, useMemo } from "react";
import { toJsDate } from "../utils/time";
import { exportPDF } from "../utils/exportPDF";
import { exportExcel } from "../utils/exportExcel";
import { DEFAULT_SHIFT_ID, getShift, isLateLogin, isEarlyLogout } from "../utils/shifts";

function EmployeeDetails({ employee, attendance, onClose }) {
  const shiftId = employee.shift || DEFAULT_SHIFT_ID;
  const shift = getShift(shiftId);
  const today = new Date();

  const [calYear, setCalYear]     = useState(today.getFullYear());
  const [calMonth, setCalMonth]   = useState(today.getMonth());
  const [tooltip, setTooltip]     = useState(null);
  const [manualEntry, setManualEntry] = useState(null);
  const [manualLogin, setManualLogin]   = useState("");
  const [manualLogout, setManualLogout] = useState("");
  const [manualNote, setManualNote]     = useState("");
  const [saving, setSaving] = useState(false);

  const allRecords = useMemo(() =>
    attendance.filter(a => a.name === employee.name)
      .map(a => ({ ...a, _t: toJsDate(a.time) }))
      .filter(a => a._t)
      .sort((a, b) => a._t - b._t),
  [attendance, employee.name]);

  const dayMap = useMemo(() => {
    const map = {}, byDate = {};
    allRecords.forEach(r => {
      const key = `${r._t.getFullYear()}-${r._t.getMonth()}-${r._t.getDate()}`;
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(r);
    });
    Object.entries(byDate).forEach(([key, recs]) => {
      recs.sort((a, b) => a._t - b._t);
      const login  = recs.find(r => r.type === "LOGIN");
      const logout = [...recs].reverse().find(r => r.type === "LOGOUT");
      let status = "present";
      if (login && isLateLogin(login._t, shiftId) && logout && isEarlyLogout(login._t, logout._t, shiftId)) status = "late-half";
      else if (login && isLateLogin(login._t, shiftId)) status = "late";
      else if (login && logout && isEarlyLogout(login._t, logout._t, shiftId)) status = "half";
      else if (login && !logout) status = "no-logout";
      map[key] = { login, logout, status };
    });
    return map;
  }, [allRecords, shiftId]);

  const calDays = useMemo(() => ({
    first: new Date(calYear, calMonth, 1).getDay(),
    total: new Date(calYear, calMonth + 1, 0).getDate(),
  }), [calYear, calMonth]);

  const records = useMemo(() =>
    allRecords.filter(r => r._t.getFullYear() === calYear && r._t.getMonth() === calMonth),
  [allRecords, calYear, calMonth]);

  const stats = useMemo(() => {
    const byDate = {};
    records.forEach(r => { const k = r._t.toLocaleDateString(); if (!byDate[k]) byDate[k] = []; byDate[k].push(r); });
    let presentDays=0, lateCount=0, halfDays=0, totalHours=0;
    Object.values(byDate).forEach(day => {
      presentDays++;
      day.sort((a,b) => a._t - b._t);
      const login = day.find(d => d.type==="LOGIN");
      const logout = [...day].reverse().find(d => d.type==="LOGOUT");
      if (login && isLateLogin(login._t, shiftId)) lateCount++;
      if (login && logout && isEarlyLogout(login._t, logout._t, shiftId)) halfDays++;
      if (login && logout && logout._t > login._t) totalHours += (logout._t - login._t) / 3600000;
    });
    return { presentDays, lateCount, halfDays, totalHours: totalHours.toFixed(1) };
  }, [records, shiftId]);

  const safeName = employee.name.replace(/\s+/g, "_");
  const suffix = `${calYear}-${String(calMonth+1).padStart(2,"0")}`;
  const fileBase = `${safeName}-attendance-${suffix}`;
  const handlePDF   = () => { if (!records.length) { alert("No records."); return; } exportPDF(records, { title: `Attendance — ${employee.name}`, filename: fileBase }); };
  const handleExcel = () => { if (!records.length) { alert("No records."); return; } exportExcel(records, { filename: fileBase, sheetName: employee.name.slice(0,28) }); };

  const monthName = new Date(calYear, calMonth, 1).toLocaleString(undefined, { month: "long", year: "numeric" });

  const STATUS_STYLE = {
    present:    { bg: "bg-green-500",   text: "Present",        dot: "🟢", textColor: "text-white" },
    late:       { bg: "bg-yellow-400",  text: "Late",           dot: "🟡", textColor: "text-black" },
    half:       { bg: "bg-blue-400",    text: "Half Day",       dot: "🔵", textColor: "text-white" },
    "late-half":{ bg: "bg-orange-400",  text: "Late+Half",      dot: "🟠", textColor: "text-white" },
    "no-logout":{ bg: "bg-purple-400",  text: "No Logout",      dot: "🟣", textColor: "text-white" },
    absent:     { bg: "bg-red-500",     text: "Absent",         dot: "🔴", textColor: "text-white" },
  };

  const roleIcons = { admin: "🔐", manager: "👔", employee: "👤" };
  const inp = "w-full bg-purple-50 border border-purple-200 rounded-xl px-3 py-2 text-gray-800 text-sm focus:outline-none focus:border-purple-500";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white w-full max-w-4xl rounded-3xl border border-purple-200 shadow-2xl max-h-[95vh] overflow-y-auto">

        {/* HEADER */}
        <div className="flex flex-wrap justify-between items-start p-5 border-b border-purple-100 gap-3">
          <div className="flex items-center gap-4">
            <img src={employee.photo || `https://ui-avatars.com/api/?name=${encodeURIComponent(employee.name)}&background=7c3aed&color=fff&size=128`}
              alt={employee.name} className="w-16 h-16 rounded-full object-cover border-2 border-purple-400"/>
            <div>
              <h1 className="text-2xl font-bold text-purple-700">{employee.name}</h1>
              <div className="flex flex-wrap gap-2 mt-1">
                <span className="bg-purple-100 text-purple-700 rounded-lg px-2 py-0.5 text-xs font-bold">🏷️ {employee.employeeId||"No ID"}</span>
                <span className="bg-blue-100 text-blue-700 rounded-lg px-2 py-0.5 text-xs">📁 {employee.department||"Other"}</span>
                <span className="bg-gray-100 text-gray-600 rounded-lg px-2 py-0.5 text-xs">{roleIcons[employee.role]||"👤"} {employee.role}</span>
              </div>
              <div className="mt-1 inline-block bg-purple-50 border border-purple-200 rounded-lg px-2 py-0.5 text-xs">
                <span className="font-bold text-purple-600">{shift.emoji} {shift.label}</span>
                <span className="text-gray-400 ml-1">{shift.loginAt}–{shift.logoutAt}</span>
              </div>
              <p className="text-gray-400 text-xs mt-1">Enrolled: {toJsDate(employee.enrolledAt)?.toLocaleDateString()||"Unknown"}</p>
            </div>
          </div>
          <button onClick={onClose} className="bg-red-100 hover:bg-red-500 hover:text-white text-red-600 border border-red-200 px-4 py-2 rounded-xl font-bold transition text-sm">✕ Close</button>
        </div>

        <div className="p-5">
          {/* MONTH NAV + EXPORT */}
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => { const d=new Date(calYear,calMonth-1,1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
              className="bg-purple-100 hover:bg-purple-600 hover:text-white text-purple-700 border border-purple-200 px-3 py-1.5 rounded-xl transition text-sm font-bold">◀</button>
            <span className="text-lg font-bold text-purple-700">{monthName}</span>
            <button onClick={() => { const d=new Date(calYear,calMonth+1,1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); }}
              className="bg-purple-100 hover:bg-purple-600 hover:text-white text-purple-700 border border-purple-200 px-3 py-1.5 rounded-xl transition text-sm font-bold">▶</button>
          </div>

          <div className="flex gap-2 justify-end mb-4">
            <button onClick={handlePDF}   className="bg-red-100 hover:bg-red-500 hover:text-white text-red-600 border border-red-200 px-4 py-1.5 rounded-xl font-bold text-sm transition">📄 PDF</button>
            <button onClick={handleExcel} className="bg-green-100 hover:bg-green-500 hover:text-white text-green-700 border border-green-200 px-4 py-1.5 rounded-xl font-bold text-sm transition">📊 Excel</button>
          </div>

          {/* STATS */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            {[
              { label:"Present", value:stats.presentDays, color:"text-green-600", bg:"bg-green-50 border-green-200" },
              { label:"Late",    value:stats.lateCount,   color:"text-yellow-500", bg:"bg-yellow-50 border-yellow-200" },
              { label:"Half Day",value:stats.halfDays,    color:"text-blue-500",  bg:"bg-blue-50 border-blue-200" },
              { label:"Hours",   value:`${stats.totalHours}h`, color:"text-purple-600", bg:"bg-purple-50 border-purple-200" },
            ].map(s => (
              <div key={s.label} className={`rounded-xl p-3 border ${s.bg} text-center`}>
                <p className="text-gray-400 text-xs">{s.label}</p>
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* CALENDAR */}
          <div className="grid grid-cols-7 mb-1">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => (
              <div key={d} className="text-center text-xs font-bold text-gray-400 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: calDays.first }).map((_,i) => <div key={`e${i}`}/>)}
            {Array.from({ length: calDays.total }).map((_,i) => {
              const day = i+1;
              const key = `${calYear}-${calMonth}-${day}`;
              const data = dayMap[key];
              const isToday = day===today.getDate() && calMonth===today.getMonth() && calYear===today.getFullYear();
              const isFuture = new Date(calYear, calMonth, day) > today;
              const statusKey = data ? data.status : (isFuture ? null : "absent");
              const style = statusKey ? STATUS_STYLE[statusKey] : null;
              return (
                <div key={day}
                  className={`rounded-xl p-1 min-h-[56px] flex flex-col items-center justify-start cursor-pointer transition hover:scale-105 border-2 ${
                    isToday ? "border-purple-600" : "border-transparent"
                  } ${style ? style.bg+" "+style.textColor : "bg-gray-50 text-gray-400"}`}
                  onClick={() => { setTooltip(tooltip?.key===key ? null : {key,day,data,statusKey}); setManualEntry(null); }}>
                  <span className="text-xs font-bold mt-1">{day}</span>
                  {data && <span className="text-[9px] mt-0.5 font-semibold">{data.login?._t.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span>}
                  {!data && !isFuture && <span className="text-[9px] mt-0.5 opacity-70">Absent</span>}
                </div>
              );
            })}
          </div>

          {/* TOOLTIP */}
          {tooltip && (
            <div className="mt-3 bg-purple-50 border border-purple-200 rounded-2xl p-4 text-sm">
              <p className="font-bold text-purple-700 mb-2">
                {STATUS_STYLE[tooltip.statusKey]?.dot} {new Date(calYear,calMonth,tooltip.day).toDateString()} — {STATUS_STYLE[tooltip.statusKey]?.text}
              </p>
              {tooltip.data ? (
                <div className="space-y-1 text-gray-700">
                  <p>🕐 Login: <span className="font-bold">{tooltip.data.login?._t.toLocaleTimeString()??"-"}</span></p>
                  <p>🕔 Logout: <span className="font-bold">{tooltip.data.logout?._t.toLocaleTimeString()??"-"}</span></p>
                  {tooltip.data.login && tooltip.data.logout && (
                    <p>⏱ Hours: <span className="font-bold">{((tooltip.data.logout._t-tooltip.data.login._t)/3600000).toFixed(2)} hrs</span></p>
                  )}
                </div>
              ) : <p className="text-gray-400">No attendance recorded.</p>}
              <div className="flex gap-2 mt-3">
                <button onClick={() => setTooltip(null)} className="text-xs text-gray-400 underline">close</button>
                <button onClick={() => {
                  const d=new Date(calYear,calMonth,tooltip.day);
                  const pad=(n)=>String(n).padStart(2,"0");
                  const dateStr=`${d.getFullYear()}-${pad(calMonth+1)}-${pad(tooltip.day)}`;
                  setManualLogin(tooltip.data?.login ? `${dateStr}T${tooltip.data.login._t.toTimeString().slice(0,5)}` : `${dateStr}T${shift.loginAt}`);
                  setManualLogout(tooltip.data?.logout ? `${dateStr}T${tooltip.data.logout._t.toTimeString().slice(0,5)}` : `${dateStr}T${shift.logoutAt}`);
                  setManualNote(""); setManualEntry({day:tooltip.day}); setTooltip(null);
                }} className="text-xs bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded-lg font-bold">✏️ Manual Entry</button>
              </div>
            </div>
          )}

          {/* MANUAL ENTRY */}
          {manualEntry && (
            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-2xl p-4">
              <h3 className="text-blue-700 font-bold mb-3 text-sm">✏️ Manual Attendance — {new Date(calYear,calMonth,manualEntry.day).toDateString()}</h3>
              <div className="grid md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="text-gray-500 text-xs block mb-1">Login Date & Time</label>
                  <input type="datetime-local" value={manualLogin} onChange={e=>setManualLogin(e.target.value)} className={inp}/>
                </div>
                <div>
                  <label className="text-gray-500 text-xs block mb-1">Logout Date & Time</label>
                  <input type="datetime-local" value={manualLogout} onChange={e=>setManualLogout(e.target.value)} className={inp}/>
                </div>
              </div>
              <div className="mb-3">
                <label className="text-gray-500 text-xs block mb-1">Note (optional)</label>
                <input type="text" placeholder="e.g. On-site visit..." value={manualNote} onChange={e=>setManualNote(e.target.value)} className={inp}/>
              </div>
              <div className="flex gap-2">
                <button disabled={saving} onClick={async () => {
                  if (!manualLogin) { alert("Login time required"); return; }
                  setSaving(true);
                  try {
                    const { db, tempId } = await import("../db");
                    await db.saveAttendance({ id: tempId("att"), name: employee.name, type: "LOGIN",  time: new Date(manualLogin),  note: manualNote||"Manual entry" });
                    if (manualLogout) await db.saveAttendance({ id: tempId("att"), name: employee.name, type: "LOGOUT", time: new Date(manualLogout), note: manualNote||"Manual entry" });
                    setManualEntry(null); alert("✅ Saved!");
                  } catch(err) { alert("❌ "+err?.message); }
                  finally { setSaving(false); }
                }} className={`px-5 py-2 rounded-xl font-bold text-sm transition ${saving?"bg-gray-300 text-gray-500 cursor-not-allowed":"bg-purple-600 hover:bg-purple-700 text-white"}`}>
                  {saving?"⏳ Saving...":"💾 Save"}
                </button>
                <button onClick={()=>setManualEntry(null)} className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-5 py-2 rounded-xl font-bold text-sm transition">Cancel</button>
              </div>
            </div>
          )}

          {/* LEGEND */}
          <div className="flex flex-wrap gap-2 mt-4">
            {Object.entries(STATUS_STYLE).map(([k,v]) => (
              <span key={k} className={`${v.bg} ${v.textColor} px-2 py-1 rounded-lg text-xs font-bold`}>{v.dot} {v.text}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default EmployeeDetails;
