'use client';

import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  setDoc,
  writeBatch,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import {
  Plus, Users, Send, X, Loader2
} from 'lucide-react';
import { useAuth } from '@/lib/useAuth';

export default function ContactsPage() {
  const { user } = useAuth();

  // Stati base
  const [categories, setCategories] = useState([]);
  const [currentCat, setCurrentCat] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(new Set());

  // Nuova categoria
  const [newCat, setNewCat] = useState('');
  // Nuovo contatto manuale
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');

  // Modal gestione invio massivo
  const [modalOpen, setModalOpen] = useState(false);
  const [templateToSend, setTemplateToSend] = useState(null);

  // Stato invio massivo
  const [sending, setSending] = useState(false);
  const [sendLog, setSendLog] = useState('');

  // Templates WhatsApp
  const [templates, setTemplates] = useState([]);
  // Dati API utente
  const [userData, setUserData] = useState(null);

  // Carica categorie realtime
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'categories'), snap => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // Carica contatti realtime filtrati per categoria
  useEffect(() => {
    if (!currentCat) {
      setContacts([]);
      setSelected(new Set());
      return;
    }
    const unsub = onSnapshot(collection(db, 'contacts'), snap => {
      const arr = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(c => Array.isArray(c.categories) && c.categories.includes(currentCat));
      setContacts(arr);
      setSelected(new Set());
    });
    return () => unsub();
  }, [currentCat]);

  // Carica templates (approvati)
  useEffect(() => {
    if (!user?.email) return;
    (async () => {
      const res = await fetch('/api/list-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data.filter(t => t.status === 'APPROVED') : []);
    })();
  }, [user]);

  // Carica dati utente (phone_number_id ecc)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const usersRef = collection(db, 'users');
      const snap = await getDocs(usersRef);
      const me = snap.docs.map(d => ({ id: d.id, ...d.data() })).find(u => u.email === user.email);
      if (me) setUserData(me);
    })();
  }, [user]);

  // Crea categoria
  const createCategory = async () => {
    const name = newCat.trim();
    if (!name) return;
    await setDoc(doc(db, 'categories', name), { name, createdBy: user.uid });
    setNewCat('');
  };

  // Import Excel/CSV
  const importFile = async f => {
    const data = await f.arrayBuffer();
    const wb = XLSX.read(data, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    const batch = writeBatch(db);
    rows.forEach(r => {
      const phone = r.phone?.toString();
      const name = r.name;
      if (phone && name) {
        const ref = doc(db, 'contacts', phone);
        batch.set(ref, { name, categories: [currentCat] }, { merge: true });
      }
    });
    await batch.commit();
  };

  // Nuovo contatto manuale
  const addNewContact = async () => {
    const phone = newContactPhone.trim();
    const name = newContactName.trim();
    if (!phone || !name || !currentCat) return alert('Compila nome, telefono e seleziona una categoria.');
    const ref = doc(db, 'contacts', phone);
    await setDoc(ref, { name, categories: [currentCat] }, { merge: true });
    setNewContactName('');
    setNewContactPhone('');
  };

  // Toggle selezione contatto
  const toggleSelect = id => {
    const s = new Set(selected);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };

  // INVIO TEMPLATE SINGOLO come ChatPage
  const sendTemplateToContact = async (phone, templateName) => {
    if (!userData) throw new Error('Dati utente non disponibili');
    const payload = {
      messaging_product: 'whatsapp',
      to: phone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'it' },
      },
    };
    const res = await fetch(
      `https://graph.facebook.com/v17.0/${userData.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_WA_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );
    const data = await res.json();
    if (!data.messages) {
      throw new Error(data.error?.message || 'Errore invio template');
    }
  };

  // Invio massivo template a tutti i contatti della categoria
  const sendTemplateMassive = async () => {
    if (!templateToSend || !currentCat) return alert('Seleziona un template.');
    setSending(true);
    setSendLog('');
    let successCount = 0, failCount = 0, failDetails = [];
    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      try {
        await sendTemplateToContact(c.id, templateToSend.name);
        successCount++;
      } catch (err) {
        failCount++;
        failDetails.push(`${c.name} (${c.id}): ${err.message}`);
      }
      // Se vuoi evitare il rate limit abbassa questo numero
      await new Promise(r => setTimeout(r, 200));
    }
    let report = `Invio terminato!\nTotale: ${contacts.length}\nInviati: ${successCount}\nErrori: ${failCount}`;
    if (failCount) report += `\nErrori:\n${failDetails.join('\n')}`;
    setSendLog(report);
    setSending(false);
    setModalOpen(false);
    setTimeout(()=>setSendLog(''), 10000); // Log visibile per 10 secondi
  };

  // ----- RENDER -----
  return (
    <div className="h-screen flex flex-col md:flex-row">
      {/* Sidebar categorie */}
      <aside className="w-full md:w-1/4 bg-white border-r p-4 overflow-y-auto">
        <h2 className="text-xl font-semibold mb-2 flex items-center gap-1">
          <Users /> Categorie
        </h2>
        <ul className="space-y-1 mb-4">
          {Array.isArray(categories) && categories.map(cat => (
            <li
              key={cat.id}
              className={`flex justify-between items-center p-2 rounded cursor-pointer hover:bg-gray-200 ${
                currentCat === cat.id ? 'bg-gray-200' : ''
              }`}
            >
              <span onClick={() => setCurrentCat(cat.id)}>{cat.name}</span>
              <button
                title={`Invia template a tutta la categoria ${cat.name}`}
                onClick={() => { setCurrentCat(cat.id); setModalOpen(true); }}
                className="text-blue-600 hover:text-blue-800"
              >
                <Send size={18} />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input
            placeholder="Nuova categoria"
            value={newCat}
            onChange={e => setNewCat(e.target.value)}
          />
          <Button onClick={createCategory} className="flex items-center gap-1">
            <Plus /> Crea
          </Button>
        </div>
      </aside>

      {/* Contatti e azioni */}
      <main className="flex-1 p-4 overflow-y-auto flex flex-col">
        {!currentCat ? (
          <div className="text-gray-500">Seleziona una categoria</div>
        ) : (
          <>
            {/* Import e nuovo contatto */}
            <div className="mb-4 flex flex-wrap gap-4 items-center">
              <label className="inline-block bg-blue-600 text-white px-3 py-1 rounded cursor-pointer hover:bg-blue-700">
                Importa Excel/CSV
                <input
                  type="file"
                  accept=".xls,.xlsx,.csv"
                  className="hidden"
                  onChange={e => e.target.files[0] && importFile(e.target.files[0])}
                />
              </label>

              <div className="flex gap-2 items-center">
                <Input
                  placeholder="Nome nuovo contatto"
                  value={newContactName}
                  onChange={e => setNewContactName(e.target.value)}
                  className="w-48"
                />
                <Input
                  placeholder="Telefono"
                  value={newContactPhone}
                  onChange={e => setNewContactPhone(e.target.value)}
                  className="w-40"
                />
                <Button
                  onClick={addNewContact}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  Aggiungi
                </Button>
              </div>
            </div>

            {/* Tabella contatti */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-2">
                      <input
                        type="checkbox"
                        onChange={e =>
                          e.target.checked
                            ? setSelected(new Set(contacts.map(c => c.id)))
                            : setSelected(new Set())
                        }
                        checked={selected.size === contacts.length && contacts.length > 0}
                      />
                    </th>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">Telefono</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(contacts) && contacts.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          checked={selected.has(c.id)}
                          onChange={() => toggleSelect(c.id)}
                        />
                      </td>
                      <td className="p-2">{c.name}</td>
                      <td className="p-2">{c.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>

      {/* Modal invio massivo */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6 relative">
            <button
              onClick={() => setModalOpen(false)}
              className="absolute top-3 right-3 text-gray-600 hover:text-gray-900"
              title="Chiudi"
            >
              <X size={20} />
            </button>

            <h3 className="text-lg font-semibold mb-4">
              Invia template a tutta la categoria{' '}
              {categories.find(c => c.id === currentCat)?.name}
            </h3>

            <div className="mb-4">
              <label className="block mb-1 font-medium">Seleziona template:</label>
              <select
                value={templateToSend?.name || ''}
                onChange={e => {
                  const tpl = (templates||[]).find(t => t.name === e.target.value);
                  setTemplateToSend(tpl || null);
                }}
                className="w-full border border-gray-300 rounded px-3 py-2"
              >
                <option value="">-- Scegli un template --</option>
                {(templates||[]).map(tpl => (
                  <option key={tpl.name} value={tpl.name}>
                    {tpl.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <Button
                onClick={sendTemplateMassive}
                disabled={sending || !templateToSend}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
              >
                {sending && <Loader2 className="animate-spin" size={18} />}
                Invia a tutti
              </Button>
              <Button onClick={() => setModalOpen(false)} variant="outline">
                Annulla
              </Button>
            </div>

            {sendLog && (
              <pre className="mt-4 max-h-40 overflow-y-auto bg-gray-100 p-2 rounded text-xs whitespace-pre-wrap">
                {sendLog}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

