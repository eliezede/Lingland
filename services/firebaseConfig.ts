
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "AIzaSyCfBa6peqcv6hel5fzvU87KU_9bLyZNrM0",
  authDomain: "lingland-2e52f.firebaseapp.com",
  databaseURL: "https://lingland-2e52f-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "lingland-2e52f",
  storageBucket: "lingland-2e52f.firebasestorage.app",
  messagingSenderId: "405261345311",
  appId: "1:405261345311:web:72fa726b4e89aca42aeb2a",
  measurementId: "G-LRCKH20XYP"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
