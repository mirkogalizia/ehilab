'use client';

import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";

// Puoi customizzare questi nomi e path come preferisci!

export default function AutomazioniPage() {
  const { user } = useAuth();
  const [merchantId, setMerchantId] = useState(null);
  const [loading, setLoading] = useState(true);

  // Stato automazione
  const [enabled, setEnabled] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [saving, setSaving] = useState(false);

  // Templates WhatsApp
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  // Carica merchantId
  useEffect(() => {
    // Sostituisci con la logica reale: puoi prendere da user, o da Firestore (es: user.merchantId)
    if (user?.uid) {
      (async () => {
        // Esempio: merchant associato a user.uid
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const merchant = userDoc.data()?.merchantId;
        setMerchantId(merchant);
      })();
    }
  }, [user]);

  // Carica impostazioni automazione
  useEffect(() => {
    if (!merchantId) return;
    setLoading(true);
    (async () => {
      const merchantDoc = await getDoc(doc(db, "shopify_merchants", merchantId));
      const automation = merchantDoc.data()?.automation?.order_fulfilled || {};
      setEnabled(!!automation.enabled);
      setSelectedTemplate(automation.template_id || "");
      setLoading(false);
    })();
  }, [merchantId]);

  // Carica templates WhatsApp approvati del numero collegato
  useEffect(() => {
    if (!merchantId) return;
    setTemplatesLoading(true);
    (async () => {
      // Prendi il phone_number_id dal merchant
      const merchantDoc = await getDoc(doc(db, "shopify_merchants", merchantId));
      const phone_number_id = merchantDoc.data()?.phone_number_id;
      // Chiedi al backend i template associati a questo numero
      const res = await fetch("/api/list-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number_id }),
      });
      const data = await res.json();
      setTemplates(Array.isArray(data) ? data.filter(t => t.status === "APPROVED") : []);
      setTemplatesLoading(false);
    })();
  }, [merchantId]);

  // Salva impostazioni
  const saveAutomation = async () => {
    if (!merchantId) return;
    setSaving(true);
    await setDoc(doc(db, "shopify_merchants", merchantId), {
      automation: {
        order_fulfilled: {
          enabled,
          template_id: selectedTemplate,
        }
      }
    }, { merge: true });
    setSaving(false);
  };

  // Template di preview (mock di variabili)
  const previewOrder = {
    nome: "Mario",
    ordine: "1234",
    tracking: "XYZ123",
    tracking_url: "https://tracking.com/track?id=XYZ123"
  };
  const selectedTemplateObj = templates.find(t => t.name === selectedTemplate);

  function renderPreviewBody(body) {
    // Sostituzione base delle variabili {{nome}}, ecc.
    return body
      .replace(/{{nome}}/g, previewOrder.nome)
      .replace(/{{ordine}}/g, previewOrder.ordine)
      .replace(/{{tracking}}/g, previewOrder.tracking)
      .replace(/{{tracking_url}}/g, previewOrder.tracking_url);
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold mb-8">Automazioni</h1>
      {loading ? (
        <div className="flex items-center gap-2 text-gray-600"><Loader2 className="animate-spin" /> Caricamento...</div>
      ) : (
        <div className="bg-white rounded-xl shadow p-6 mb-8 border">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="font-semibold text-lg">WhatsApp ordine evaso</div>
              <div className="text-gray-500 text-sm">Invia automaticamente un messaggio WhatsApp quando l’ordine viene spedito.</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {enabled && (
            <div className="space-y-6">
              <div>
                <label className="block text-gray-700 font-medium mb-2">Template WhatsApp da inviare:</label>
                {templatesLoading ? (
                  <div className="flex items-center gap-2 text-gray-500"><Loader2 className="animate-spin" />Caricamento template...</div>
                ) : (
                  <select
                    className="w-full border border-gray-300 rounded px-4 py-2 focus:outline-none focus:ring"
                    value={selectedTemplate}
                    onChange={e => setSelectedTemplate(e.target.value)}
                  >
                    <option value="">Seleziona un template...</option>
                    {templates.map(t => (
                      <option value={t.name} key={t.name}>{t.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Anteprima messaggio */}
              {selectedTemplateObj && (
                <div className="bg-gray-50 border rounded p-4 mt-2">
                  <div className="font-bold mb-1">Anteprima messaggio:</div>
                  <div className="whitespace-pre-line text-gray-800">
                    {renderPreviewBody(selectedTemplateObj.body_text || selectedTemplateObj.body || "")}
                  </div>
                </div>
              )}

              <Button className="mt-4" onClick={saveAutomation} disabled={saving || !selectedTemplate}>
                {saving ? <Loader2 className="animate-spin inline-block mr-1" /> : null}
                Salva impostazioni
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}