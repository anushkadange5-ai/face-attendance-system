import { useEffect, useState } from "react";

import Camera          from "./components/Camera";
import AdminDashboard  from "./components/AdminDashboard";
import AdminLogin      from "./components/AdminLogin";

import { faceService } from "./faceService";
import { authService } from "./authService";
import { startSync, syncStatus, outboxCount } from "./syncService";

function App() {

  // 'employee'  = just the face scanner (kiosk mode, public)
  // 'admin'     = admin area: shows <AdminLogin /> until the user
  //               signs in with Firebase Auth, then <AdminDashboard />
  const [view, setView] = useState("employee");

  // Firebase Auth state (null until the very first onAuthStateChanged
  // callback fires, so we can show a tiny loader instead of a flicker).
  const [adminUser,   setAdminUser]   = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Online / offline + how many writes are still waiting to sync.
  const [online,  setOnline]  = useState(syncStatus.isOnline());
  const [pending, setPending] = useState(0);

  // Load face-api models + boot the offline-first sync engine once.
  useEffect(() => {
    faceService.loadModels();
    startSync();
  }, []);

  // Subscribe to Firebase Auth — single source of truth for who's
  // signed in.
  useEffect(() => {
    const unsub = authService.subscribe((user) => {
      setAdminUser(user);
      setAuthChecked(true);
    });
    return () => unsub && unsub();
  }, []);

  // Online indicator + pending-write count refresher.
  useEffect(() => {
    const offOnline = syncStatus.onChange(setOnline);
    const tick = async () => {
      try { setPending(await outboxCount()); } catch (_) {}
    };
    tick();
    const id = setInterval(tick, 3000);
    return () => { offOnline(); clearInterval(id); };
  }, []);

  // -----------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------

  const renderAdminArea = () => {
    if (!authChecked) {
      return (
        <div className="min-h-screen flex items-center justify-center text-gray-400">
          Loading...
        </div>
      );
    }
    if (!adminUser) {
      return <AdminLogin />;
    }
    return <AdminDashboard adminUser={adminUser} />;
  };

  return (

    <div className="bg-black min-h-screen text-white relative">

      {/* Online / offline + pending sync badge (top-left) */}
      <div
        className={`fixed top-3 left-3 z-50 text-xs font-bold px-3 py-2 rounded-xl border ${
          online
            ? "bg-green-500/10 text-green-400 border-green-500/40"
            : "bg-yellow-500/10 text-yellow-400 border-yellow-500/40"
        }`}
        title={
          online
            ? "Connected — changes sync to the cloud"
            : "Offline — changes are saved locally and will sync when you reconnect"
        }
      >
        {online ? "🟢 Online" : "🔴 Offline"}
        {pending > 0 && (
          <span className="ml-2 text-yellow-300">
            ⏳ {pending} pending
          </span>
        )}
      </div>

      {/* View toggle — Scanner <-> Admin */}
      <button
        onClick={() =>
          setView((v) => (v === "employee" ? "admin" : "employee"))
        }
        className="fixed top-3 right-3 z-50 bg-green-500/20 hover:bg-green-500 hover:text-black text-green-400 text-sm font-bold px-4 py-2 rounded-xl border border-green-500/40 transition"
        title={
          view === "employee"
            ? "Go to admin panel"
            : "Back to face scanner"
        }
      >
        {view === "employee" ? "🔑 Admin" : "🎥 Scanner"}
      </button>

      {view === "employee" ? <Camera /> : renderAdminArea()}

    </div>

  );

}

export default App;

