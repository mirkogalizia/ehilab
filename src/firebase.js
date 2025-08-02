// src/firebase.js
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage"; // Storage OK

const firebaseConfig = {
  apiKey: "AIzaSyDHkexQNuc09zuisYnkPjht3TLy1rfLO_M",
  authDomain: "ehilab.firebaseapp.com",
  projectId: "ehilab",
  storageBucket: "ehilab.appspot.com",   // ⚠️ CORRETTO! (deve essere ...appspot.com)
  messagingSenderId: "787841555610",
  appId: "1:787841555610:web:45a261d9412cbe7212d323",
  measurementId: "G-PFJHQ1XMG1"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);  // Storage pronto!