// src/firebase.js
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDHkexQNuc09zuisYnkPjht3TLy1rfLO_M",
  authDomain: "ehilab.firebaseapp.com",
  projectId: "ehilab",
  storageBucket: "ehilab.firebasestorage.app",
  messagingSenderId: "787841555610",
  appId: "1:787841555610:web:45a261d9412cbe7212d323"
  // ❌ NON serve measurementId o databaseURL per Firestore
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const db = getFirestore(app);
