'use client';

import { useEffect, useState } from "react";
import { db } from '@/lib/firebase';
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/useAuth";

export default function AutomazioniPage() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [templateList, setTemplateList] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [loading, setLoading] = useState(false);

  // Carica impostazioni automazione dal merchant
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    (async () => {
      // 1. Prendi impostazioni automazione
      const merchantRef = doc(db, "shopify_merchants", user.uid);
      const snap = await getDoc(merchantRef);
      const data = snap.data();
      const automation = data?.automation?.order_fulfilled || {};
      setEnabled(!!automation.enabled);
      setSelectedTemplate(automation.template_id || '');

      // 2. Carica lista template via API (solo APPROVED)
      const res = await fetch('/api/list-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_uid: user.uid }),
      });
      const dataTpl = await res.json();
      if (Array.isArray(dataTpl)) {
        setTemplateList(dataTpl.filter(t => t.status === 'APPROVED'));
      } else {
        setTemplateList([]);
      }
      setLoading(false);
    })();
  }, [user]);

  // Salva modifiche automazione
  async function saveAutomazione() {
    setLoading(true);
    const merchantRef = doc(db, "shopify_merchants", user.uid);

    // Salva solo il NAME del template selezionato
    await updateDoc(merchantRef, {
      "automation.order_fulfilled": {
        enabled,
        template_id: selectedTemplate // <-- è il name, non l'id numerico
      }
    });
    setLoading(false);
    alert("Automazione aggiornata!");
  }

  return (
    <div className="max-w-2xl mx-auto p-8 font-[Montserrat]">
      <h1 className="font-bold text-2xl mb-2">Automazioni WhatsApp</h1>
      <p className="text-gray-500 mb-6">
        Gestisci le automazioni. Attiva/disattiva e scegli il template da inviare quando l’ordine viene evaso.
      </p>
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
            <option key={t.name} value={t.name}>
              {t.components?.[0]?.text
                ? t.components[0].text.slice(0, 60) + (t.components[0].text.length > 60 ? '...' : '')
                : t.name}
            </option>
          ))}
        </select>
      </div>
      <Button disabled={loading} onClick={saveAutomazione}>Salva</Button>
    </div>
  );
}