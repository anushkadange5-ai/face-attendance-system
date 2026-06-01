import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBjhqij7zlfj2hnDEwp0w8WnSeT5TJAFbU",
  authDomain: "faceattendancesystem-75a39.firebaseapp.com",
  projectId: "faceattendancesystem-75a39",
  storageBucket: "faceattendancesystem-75a39.firebasestorage.app",
  messagingSenderId: "823910435683",
  appId: "1:823910435683:web:d49d80c5b92fff0ca4a156",
  measurementId: "G-YV7EF36223"
};

const app = initializeApp(firebaseConfig);

export const firestore = getFirestore(app);