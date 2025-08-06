'use client';

import { useEffect, useState } from "react";
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Switch } from "@/components/ui/switch"; // SHADCN!
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/useAuth";

export default function AutomazioniPage() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [templateList, setTemplateList] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [loading, setLoading] = useState(false);

  // 1. Carica impostazioni automazione dal merchant
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    (async () => {
      const merchantRef = doc(db, "shopify_merchants", user.uid);
      const snap = await getDoc(merchantRef);
      const data = snap.data();
      const automation = data?.automation?.order_fulfilled || {};
      setEnabled(!!automation.enabled);
      setSelectedTemplate(automation.template_id || '');

      // Simuliamo fetch template WhatsApp (da collection)
      const templatesSnap = await getDoc(doc(db, "wa_templates", user.uid));
      let templates = [];
      if (templatesSnap.exists()) {
        // Aggiungi la tua logica per popolare la lista, qui dummy:
        templates = Object.values(templatesSnap.data()).filter(t => t.status === 'APPROVED');
      }
      setTemplateList(templates);
      setLoading(false);
    })();
  }, [user]);

  // 2. Salva modifiche
  async function saveAutomazione() {
    setLoading(true);
    const merchantRef = doc(db, "shopify_merchants", user.uid);
    await updateDoc(merchantRef, {
      "automation.order_fulfilled": {
        enabled,
        template_id: selectedTemplate
      }
    });
    setLoading(false);
    alert("Automazione aggiornata!");
  }

  return (
    <div className="max-w-2xl mx-auto p-8">
      <h1 className="font-bold text-2xl mb-2">Automazioni WhatsApp</h1>
      <p className="text-gray-500 mb-6">Gestisci le automazioni. Attiva/disattiva e scegli il template da inviare quando l’ordine viene evaso.</p>
      <div className="flex items-center gap-4 mb-8">
        <Switch checked={enabled} onCheckedChange={setEnabled} id="auto-switch" />
        <label htmlFor="auto-switch" className="text-lg font-semibold cursor-pointer">
          Invia messaggio quando l’ordine è evaso
        </label>
      </div>
      <div className="mb-8">
        <label className="block mb-2 text-base font-medium">Template messaggio:</label>
        <select
          className="border rounded-lg px-4 py-2 w-full"
          value={selectedTemplate}
          onChange={e => setSelectedTemplate(e.target.value)}
          disabled={!enabled || loading}
        >
          <option value="">Seleziona un template</option>
          {templateList.map(t => (
            <option key={t.id} value={t.id}>{t.body || t.name}</option>
          ))}
        </select>
      </div>
      <Button disabled={loading} onClick={saveAutomazione}>Salva</Button>
    </div>
  );
}