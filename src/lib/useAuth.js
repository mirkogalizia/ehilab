'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../firebase.js'; // usa src/firebase.js

export function useAuth() {
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser || null);
    });

    return () => unsubscribe();
  }, []);

  return { user };
}

