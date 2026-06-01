import { useEffect } from "react";

import Camera from "./components/Camera";
import AdminDashboard from "./components/AdminDashboard";

import { faceService } from "./faceService";

function App() {

  useEffect(() => {

    faceService.loadModels();

  }, []);

  return (

    <div className="bg-black min-h-screen">

      <Camera />

      <AdminDashboard />

    </div>

  );

}

export default App;