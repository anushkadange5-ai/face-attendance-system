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

    <div className="min-h-screen bg-black flex items-center justify-center p-6">

      <form
        onSubmit={handleSubmit}
        className="bg-[#111] p-10 rounded-3xl border border-green-500/20 w-full max-w-md"
      >

        <h1 className="text-4xl text-green-400 font-bold mb-2 text-center">
          ADMIN LOGIN
        </h1>
        <p className="text-gray-400 text-sm text-center mb-8">
          Sign in with your admin account
        </p>

        <label className="block text-gray-400 text-sm mb-2">Email</label>
        <input
          type="email"
          placeholder="admin@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          disabled={loading}
          className="w-full bg-black border border-green-500 rounded-2xl p-4 text-white text-lg mb-4 outline-none focus:border-green-400 disabled:opacity-60"
        />

        <label className="block text-gray-400 text-sm mb-2">Password</label>
        <input
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          disabled={loading}
          className="w-full bg-black border border-green-500 rounded-2xl p-4 text-white text-lg mb-6 outline-none focus:border-green-400 disabled:opacity-60"
        />

        {error && (
          <div
            role="alert"
            className="mb-5 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/40 text-red-400 text-sm"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`w-full p-4 rounded-2xl text-xl font-bold transition ${
            loading
              ? "bg-gray-600 cursor-not-allowed"
              : "bg-green-500 hover:bg-green-600"
          }`}
        >
          {loading ? "Signing in..." : "LOGIN"}
        </button>

      </form>

    </div>

  );
}

export default AdminLogin;
