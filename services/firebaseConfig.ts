
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// Your web app's Firebase configuration
// For Phase 1 MVP, you will replace these with your actual project keys
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "mock-key",
  authDomain: "lingland-mvp.firebaseapp.com",
  projectId: "lingland-mvp",
  storageBucket: "lingland-mvp.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef",
  measurementId: "G-XYZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Exports for use in the app
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

// Optional: Analytics
// const analytics = getAnalytics(app);
