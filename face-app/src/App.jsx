import { useEffect, useState, useCallback } from "react";
import Camera from "./components/Camera";
import AdminDashboard from "./components/AdminDashboard";
import AdminLogin from "./components/AdminLogin";
import { faceService } from "./faceService";
import { authService } from "./authService";
import { startSync, syncStatus, outboxCount } from "./syncService";
import { loadSettings } from "./utils/settings";

function App() {
  const [view, setView] = useState("employee");
  const [adminUser, setAdminUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [online, setOnline] = useState(syncStatus.isOnline());
  const [pending, setPending] = useState(0);
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [sessionWarning, setSessionWarning] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);

  useEffect(() => {
    faceService.loadModels().then((ok) => {
      if (ok) setModelsReady(true);
      else console.error("❌ Models failed to load");
    });
    startSync();
  }, []);

  useEffect(() => {
    const unsub = authService.subscribe((user) => {
      setAdminUser(user);
      setAuthChecked(true);
      if (user) setLastActivity(Date.now());
    });
    return () => unsub && unsub();
  }, []);

  useEffect(() => {
    const offOnline = syncStatus.onChange(setOnline);
    const tick = async () => {
      try { setPending(await outboxCount()); } catch (_) {}
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => { offOnline(); clearInterval(id); };
  }, []);

  const resetActivity = useCallback(() => {
    setLastActivity(Date.now());
    setSessionWarning(false);
  }, []);

  useEffect(() => {
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, resetActivity, { passive: true }));
    const checkSession = setInterval(() => {
      const settings = loadSettings();
      if (!settings.sessionTimeoutEnabled || !adminUser) return;
      const timeoutMs = (settings.autoLogoutMinutes || 30) * 60_000;
      const elapsed = Date.now() - lastActivity;
      if (elapsed > timeoutMs - 120000 && elapsed < timeoutMs) setSessionWarning(true);
      if (elapsed > timeoutMs) { authService.logout().catch(console.warn); setSessionWarning(false); }
    }, 10000);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetActivity));
      clearInterval(checkSession);
    };
  }, [adminUser, lastActivity, resetActivity]);

  const renderAdminArea = () => {
    if (!authChecked) return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        <div className="text-center"><div className="animate-spin text-4xl mb-4">⏳</div><p>Loading...</p></div>
      </div>
    );
    if (!adminUser) return <AdminLogin />;
    return <AdminDashboard adminUser={adminUser} />;
  };

  const showStatusBadge = loadSettings().showStatusBadge !== false;

  return (
    <div className="bg-purple-50 min-h-screen text-gray-800 relative">

      {sessionWarning && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] bg-white text-gray-800 px-8 py-6 rounded-2xl border-2 border-yellow-400 shadow-2xl text-center">
          <p className="text-2xl font-bold mb-4">⚠️ Session Expiring Soon</p>
          <p className="mb-4">Your session will expire in 2 minutes.</p>
          <button onClick={resetActivity} className="bg-purple-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-purple-700 transition">
            Stay Logged In
          </button>
        </div>
      )}

      {showStatusBadge && (
        <div className={`fixed top-3 left-3 z-50 text-xs font-bold px-3 py-2 rounded-xl border ${
          online ? "bg-green-100 text-green-700 border-green-300" : "bg-yellow-100 text-yellow-700 border-yellow-300"
        }`}>
          {online ? "🟢 Online" : "🔴 Offline"}
          {pending > 0 && <span className="ml-2 text-yellow-600">⏳ {pending} pending</span>}
        </div>
      )}

      <button
        onClick={() => { setView(view === "employee" ? "admin" : "employee"); resetActivity(); }}
        className="fixed top-3 right-3 z-50 font-bold px-4 py-2 rounded-xl border transition bg-purple-100 hover:bg-purple-600 hover:text-white text-purple-700 border-purple-300"
      >
        {view === "employee" ? "🔑 Admin" : "🎥 Scanner"}
      </button>

      {view === "employee" ? <Camera modelsReady={modelsReady} /> : renderAdminArea()}
    </div>
  );
}

export default App;
