import { useEffect, useState } from "react";

import Camera from "./components/Camera";
import AdminDashboard from "./components/AdminDashboard";

import { faceService } from "./faceService";

function App() {

  // 'employee'  = just the face scanner (kiosk mode)
  // 'admin'     = full admin dashboard (still password-gated inside)
  const [view, setView] = useState("employee");

  useEffect(() => {

    faceService.loadModels();

  }, []);

  return (

    <div className="bg-black min-h-screen text-white relative">

      {/* tiny floating toggle, top-right of the page */}
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

      {view === "employee" ? <Camera /> : <AdminDashboard />}

    </div>

  );

}

export default App;
