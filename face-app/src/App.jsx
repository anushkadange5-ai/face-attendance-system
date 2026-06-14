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

  // Load face-api models + boot sync engine
  useEffect(() => {
    faceService.loadModels();
    startSync();
  }, []);

  // Subscribe to Firebase Auth
  useEffect(() => {
    const unsub = authService.subscribe((user) => {
      setAdminUser(user);
      setAuthChecked(true);
      if (user) setLastActivity(Date.now());
    });
    return () => unsub && unsub();
  }, []);

  // Online indicator + pending count
  useEffect(() => {
    const offOnline = syncStatus.onChange(setOnline);
    const tick = async () => {
      try { setPending(await outboxCount()); } catch (_) {}
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => { offOnline(); clearInterval(id); };
  }, []);

  // Session timeout handler
  const resetActivity = useCallback(() => {
    setLastActivity(Date.now());
    setSessionWarning(false);
  }, []);

  useEffect(() => {
    // Track user activity
    const events = ["mousedown", "keydown", "touchstart", "scroll"];
    events.forEach((ev) => window.addEventListener(ev, resetActivity, { passive: true }));

    // Check for session timeout
    const checkSession = setInterval(() => {
      const settings = loadSettings();
      if (!settings.sessionTimeoutEnabled || !adminUser) return;

      const timeoutMs = (settings.autoLogoutMinutes || 30) * 60_000;
      const elapsed = Date.now() - lastActivity;

      // Warning at 2 minutes before timeout
      if (elapsed > timeoutMs - 120000 && elapsed < timeoutMs) {
        setSessionWarning(true);
      }

      // Auto logout
      if (elapsed > timeoutMs) {
        console.log("Session timeout - logging out");
        authService.logout().catch(console.warn);
        setSessionWarning(false);
      }
    }, 10000); // Check every 10 seconds

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetActivity));
      clearInterval(checkSession);
    };
  }, [adminUser, lastActivity, resetActivity]);

  // Don't auto-switch to admin view on auth change if currently in employee view
  useEffect(() => {
    if (authChecked && adminUser && view === "employee") {
      // Keep in employee view but allow admin access via button
    }
  }, [authChecked, adminUser, view]);

  const handleViewChange = (newView) => {
    setView(newView);
    resetActivity();
  };

  const renderAdminArea = () => {
    if (!authChecked) {
      return (
        <div className="min-h-screen flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="animate-spin text-4xl mb-4">⏳</div>
            <p>Loading...</p>
          </div>
        </div>
      );
    }
    if (!adminUser) {
      return <AdminLogin />;
    }
    return <AdminDashboard adminUser={adminUser} />;
  };

  const showStatusBadge = loadSettings().showStatusBadge !== false;

  return (
    <div className="bg-black min-h-screen text-white relative">

      {/* Session Warning */}
      {sessionWarning && (
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[100] bg-yellow-500/90 text-black px-8 py-6 rounded-2xl border-2 border-yellow-300 shadow-2xl text-center">
          <p className="text-2xl font-bold mb-4">⚠️ Session Expiring Soon</p>
          <p className="mb-4">Your session will expire in 2 minutes due to inactivity.</p>
          <button
            onClick={resetActivity}
            className="bg-black text-white px-6 py-3 rounded-xl font-bold hover:bg-gray-800 transition"
          >
            Stay Logged In
          </button>
        </div>
      )}

      {/* Online/Offline badge */}
      {showStatusBadge && (
        <div
          className={`fixed top-3 left-3 z-50 text-xs font-bold px-3 py-2 rounded-xl border ${
            online
              ? "bg-green-500/10 text-green-400 border-green-500/40"
              : "bg-yellow-500/10 text-yellow-400 border-yellow-500/40"
          }`}
          title={online ? "Connected — changes sync to cloud" : "Offline — changes saved locally"}
        >
          {online ? "🟢 Online" : "🔴 Offline"}
          {pending > 0 && (
            <span className="ml-2 text-yellow-300">
              ⏳ {pending} pending
            </span>
          )}
        </div>
      )}

      {/* View toggle */}
      <button
        onClick={() => handleViewChange(view === "employee" ? "admin" : "employee")}
        className={`fixed top-3 right-3 z-50 font-bold px-4 py-2 rounded-xl border transition ${
          view === "employee"
            ? "bg-green-500/20 hover:bg-green-500 hover:text-black text-green-400 border-green-500/40"
            : "bg-blue-500/20 hover:bg-blue-500 hover:text-black text-blue-400 border-blue-500/40"
        }`}
        title={view === "employee" ? "Go to admin panel" : "Back to face scanner"}
      >
        {view === "employee" ? "🔑 Admin" : "🎥 Scanner"}
      </button>

      {view === "employee" ? <Camera /> : renderAdminArea()}
    </div>
  );
}

export default App;