"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/firebase";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebase";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const docRef = doc(db, "utenti", currentUser.uid); // 🔁 collezione "utenti"
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const extraData = docSnap.data();
          setUser({
            uid: currentUser.uid,
            email: currentUser.email,
            ...extraData, // 🔥 phone_number_id, numeroWhatsapp, ecc.
          });
        } else {
          setUser({
            uid: currentUser.uid,
            email: currentUser.email,
          });
        }
      } else {
        setUser(null);
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

