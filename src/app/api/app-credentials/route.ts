await adminDB.doc(`users/${uid}/google/app`).set({
  client_id,
  client_secret,
  redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/google/oauth/callback`, // ⬅️ qui opzionale
  updatedAt: new Date(),
}, { merge: true });