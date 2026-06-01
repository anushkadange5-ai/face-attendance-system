import { useEffect, useState } from "react";

import Camera          from "./components/Camera";
import AdminDashboard  from "./components/AdminDashboard";
import AdminLogin      from "./components/AdminLogin";

import { faceService } from "./faceService";
import { authService } from "./authService";

function App() {

  // 'employee'  = just the face scanner (kiosk mode, public)
  // 'admin'     = admin area: shows <AdminLogin /> until the user
  //               signs in with Firebase Auth, then <AdminDashboard />
  const [view, setView] = useState("employee");

  // Firebase Auth state (null until the very first onAuthStateChanged
  // callback fires, so we can show a tiny loader instead of a flicker).
  const [adminUser,   setAdminUser]   = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Load face-api models once
  useEffect(() => {
    faceService.loadModels();
  }, []);

  // Subscribe to Firebase Auth — single source of truth for who's
  // signed in. Used both as the protected-route gate and as the
  // signal to redirect after login / logout.
  useEffect(() => {
    const unsub = authService.subscribe((user) => {
      setAdminUser(user);
      setAuthChecked(true);
    });
    return () => unsub && unsub();
  }, []);

  // -----------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------

  // What to show in the admin tab
  const renderAdminArea = () => {
    if (!authChecked) {
      return (
        <div className="min-h-screen flex items-center justify-center text-gray-400">
          Loading...
        </div>
      );
    }
    if (!adminUser) {
      // Not signed in → protected-route redirect to the login screen
      return <AdminLogin />;
    }
    return <AdminDashboard adminUser={adminUser} />;
  };

  return (

    <div className="bg-black min-h-screen text-white relative">

      {/* Tiny floating toggle, top-right of the page.
          Switches between the employee kiosk and the admin area.
          The admin area itself is still gated by Firebase Auth. */}
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
