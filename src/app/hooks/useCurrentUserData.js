import { useEffect, useState } from "react";
import { auth, db } from "@/firebase/config";
import { doc, getDoc } from "firebase/firestore";

export const useCurrentUserData = () => {
  const [data, setData] = useState(null);

  useEffect(() => {
    const fetch = async () => {
      const user = auth.currentUser;
      if (!user) return;
      const docSnap = await getDoc(doc(db, "users", user.uid));
      if (docSnap.exists()) {
        setData(docSnap.data());
      }
    };

    fetch();
  }, []);

  return data;
};
