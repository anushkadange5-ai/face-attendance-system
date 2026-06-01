import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

import { auth } from "./firebase";

export const authService = {

  // Sign in with email + password.
  // Returns the user object on success, throws on failure
  // (caller can read err.code / err.message).
  async login(email, password) {
    const cred = await signInWithEmailAndPassword(
      auth,
      email.trim(),
      password
    );
    return cred.user;
  },

  // Sign out the current admin.
  async logout() {
    await signOut(auth);
  },

  // Subscribe to auth-state changes. Returns the unsubscribe fn.
  // callback receives the user object (or null when signed out).
  subscribe(callback) {
    return onAuthStateChanged(auth, callback);
  },

  // Convenience getter for the currently signed-in user (or null).
  currentUser() {
    return auth.currentUser;
  },

  // Friendly error-message translator for the most common
  // Firebase Auth error codes we hit on the login screen.
  describeError(err) {
    const code = err?.code || "";
    switch (code) {
      case "auth/invalid-email":
        return "Invalid email address.";
      case "auth/missing-password":
        return "Please enter your password.";
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "Incorrect email or password.";
      case "auth/too-many-requests":
        return "Too many attempts. Try again in a few minutes.";
      case "auth/network-request-failed":
        return "Network error. Check your internet connection.";
      default:
        return err?.message || "Login failed. Please try again.";
    }
  },

};
