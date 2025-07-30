import { writeBatch, doc, collection } from "firebase/firestore";
// ...altri import

useEffect(() => {
  if (!selectedPhone || !user?.uid || allMessages.length === 0) return;
  // Trova i messaggi non letti da questo numero
  const unreadMsgIds = allMessages
    .filter(m => m.from === selectedPhone && m.read === false)
    .map(m => m.id);
  if (unreadMsgIds.length > 0) {
    // Aggiorna in batch
    const batch = writeBatch(db);
    unreadMsgIds.forEach(id => {
      const ref = doc(collection(db, 'messages'), id);
      batch.update(ref, { read: true });
    });
    batch.commit();
  }
}, [selectedPhone, allMessages, user]);

