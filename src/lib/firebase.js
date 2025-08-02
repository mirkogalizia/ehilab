import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage'; // <--- AGGIUNGI QUESTA RIGA

const firebaseConfig = {
  apiKey: 'AIzaSyDHkexQNuc09zuisYnkPjht3TLy1rfLO_M',
  authDomain: 'ehilab.firebaseapp.com',
  projectId: 'ehilab',
  storageBucket: 'ehilab.appspot.com', // ⚠️ CORRETTO (.appspot.com)
  messagingSenderId: '787841555610',
  appId: '1:787841555610:web:45a261d9412cbe7212d323',
  measurementId: 'G-PFJHQ1XMG1',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);  // <--- AGGIUNGI QUESTA RIGA

export { db, auth, storage };