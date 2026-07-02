import { useState } from "react";
import { authService } from "../authService";

function AdminLogin() {

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

    try {
      setLoading(true);
      await authService.login(email, password);
      // The auth-state listener in App.jsx will swap the view
      // to <AdminDashboard /> automatically — nothing more to do.
    } catch (err) {
      console.error("Admin login failed:", err);
      setError(authService.describeError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-white flex items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="bg-white p-10 rounded-3xl border border-purple-200 shadow-2xl w-full max-w-md">
        <h1 className="text-4xl text-purple-700 font-bold mb-2 text-center">ADMIN LOGIN</h1>
        <p className="text-gray-400 text-sm text-center mb-8">Sign in with your admin account</p>

        <label className="block text-gray-500 text-sm mb-2">Email</label>
        <input type="email" placeholder="admin@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
          autoComplete="username" disabled={loading}
          className="w-full bg-purple-50 border border-purple-300 rounded-2xl p-4 text-gray-800 text-lg mb-4 outline-none focus:border-purple-500 disabled:opacity-60" />

        <label className="block text-gray-500 text-sm mb-2">Password</label>
        <input type="password" placeholder="Enter password" value={password} onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password" disabled={loading}
          className="w-full bg-purple-50 border border-purple-300 rounded-2xl p-4 text-gray-800 text-lg mb-6 outline-none focus:border-purple-500 disabled:opacity-60" />

        {error && (
          <div role="alert" className="mb-5 px-4 py-3 rounded-xl bg-red-50 border border-red-300 text-red-500 text-sm">{error}</div>
        )}

        <button type="submit" disabled={loading}
          className={`w-full p-4 rounded-2xl text-xl font-bold transition ${
            loading ? "bg-gray-300 cursor-not-allowed text-gray-500" : "bg-purple-600 hover:bg-purple-700 text-white"
          }`}>
          {loading ? "Signing in..." : "LOGIN"}
        </button>
      </form>
    </div>
  );
}

export default AdminLogin;
