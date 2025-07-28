'use client';

import { useEffect, useState } from 'react';
import { 
  collection, doc, setDoc, getDocs, writeBatch, 
  onSnapshot 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import * as XLSX from 'xlsx';
import { Plus, Users, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/useAuth';

export default function ContactsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [categories, setCategories] = useState([]);
  const [newCat, setNewCat] = useState('');
  const [currentCat, setCurrentCat] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [assignCat, setAssignCat] = useState('');

  // Carica categorie
  useEffect(() => {
    const unsub = onSnapshot(collection(db,'categories'),snap=>{
      setCategories(snap.docs.map(d=>({ id:d.id,...d.data() })));
    });
    return ()=>unsub();
  },[]);

  // Carica contatti quando cambia categoria
  useEffect(() => {
    if(!currentCat) { setContacts([]); return; }
    const unsub = onSnapshot(collection(db,'contacts'),snap=>{
      const arr = snap.docs
        .map(d=>({ id:d.id,name:d.data().name,cats:d.data().categories||[] }))
        .filter(c=>c.cats.includes(currentCat));
      setContacts(arr);
    });
    return ()=>unsub();
  },[currentCat]);

  // Crea categoria
  const createCategory = async () => {
    if(!newCat.trim()) return;
    await setDoc(doc(db,'categories',newCat.trim()),{ name:newCat.trim(), createdBy:user.uid });
    setNewCat('');
  };

  // Import Excel/CSV
  const importFile = async f=>{
    const data = await f.arrayBuffer();
    const wb = XLSX.read(data,{type:'array'});
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    const batch = writeBatch(db);
    rows.forEach(r=>{
      const phone = r.phone?.toString();
      const name = r.name;
      if(phone && name){
        const ref = doc(db,'contacts',phone);
        batch.set(ref,{ name, categories:[currentCat] },{ merge:true });
      }
    });
    await batch.commit();
  };

  // Toggle selezione
  const toggle = id => {
    const s = new Set(selected);
    s.has(id)? s.delete(id): s.add(id);
    setSelected(s);
  };

  // Assegna categorie
  const assign = async ()=>{
    const batch = writeBatch(db);
    selected.forEach(id=>{
      const ref = doc(db,'contacts',id);
      batch.update(ref,{ categories: writeBatch.firestore.FieldValue.arrayUnion(assignCat) });
    });
    await batch.commit();
    setSelected(new Set());
    setAssignCat('');
  };

  return (
    <div className="h-screen flex flex-col md:flex-row">
      {/* Sidebar back on mobile */}
      <header className="md:hidden p-4 bg-white border-b flex items-center gap-2">
        <button onClick={()=>router.back()}><ArrowLeft/></button>
        <h1 className="text-lg font-semibold">Rubrica</h1>
      </header>
      {/* Categorie */}
      <aside className="w-full md:w-1/4 bg-white border-r p-4 overflow-y-auto">
        <h2 className="text-xl font-semibold mb-2 flex items-center gap-1"><Users/> Categorie</h2>
        <ul className="space-y-1 mb-4">
          {categories.map(cat=>(
            <li key={cat.id}
              onClick={()=>setCurrentCat(cat.id)}
              className={`p-2 rounded cursor-pointer ${currentCat===cat.id?'bg-gray-200':''}`}>
              {cat.name}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Input
            placeholder="Nuova categoria"
            value={newCat}
            onChange={e=>setNewCat(e.target.value)}
          />
          <Button onClick={createCategory}><Plus/></Button>
        </div>
      </aside>
      {/* Contatti & azioni */}
      <main className="flex-1 p-4 overflow-y-auto flex flex-col">
        {!currentCat
          ? <div className="text-gray-500">Seleziona una categoria</div>
          : <>
            {/* Importazione */}
            <label className="mb-4 inline-block bg-blue-600 text-white px-3 py-1 rounded cursor-pointer hover:bg-blue-700">
              Importa Excel/CSV
              <input type="file" accept=".xls,.xlsx,.csv" className="hidden"
                onChange={e=>e.target.files[0] && importFile(e.target.files[0])}
              />
            </label>
            {/* Tabella contatti */}
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="p-2"><input type="checkbox"
                      onChange={e=>{
                        if(e.target.checked) setSelected(new Set(contacts.map(c=>c.id)));
                        else setSelected(new Set());
                      }} 
                      checked={selected.size===contacts.length}
                    /></th>
                    <th className="p-2 text-left">Nome</th>
                    <th className="p-2 text-left">Telefono</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map(c=>(
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="p-2"><input type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={()=>toggle(c.id)}
                      /></td>
                      <td className="p-2">{c.name}</td>
                      <td className="p-2">{c.id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Azioni batch */}
            {selected.size>0 && (
              <div className="mt-4 flex items-center gap-2">
                <select
                  value={assignCat}
                  onChange={e=>setAssignCat(e.target.value)}
                  className="border px-2 py-1 rounded"
                >
                  <option value="">Assegna a...</option>
                  {categories.filter(c=>c.id!==currentCat).map(c=>(
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <Button onClick={assign} disabled={!assignCat}>
                  Applica a {selected.size} contatti
                </Button>
              </div>
            )}
          </>}
      </main>
    </div>
  );
}
