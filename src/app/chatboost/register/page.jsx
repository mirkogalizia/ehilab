"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/firebase";
import { collection, addDoc, Timestamp } from "firebase/firestore";

export default function RegisterPage() {
  const [form, setForm] = useState({
    nome: "",
    cognome: "",
    email: "",
    password: "",
    telefono: "",
    numeroWhatsapp: "",
    azienda: "",
    indirizzo: "",
    cap: "",
    citta: "",
    provincia: "",
    paese: "",
    piva: "",
    cf: "",
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const requiredFields = ["nome", "cognome", "email", "password", "numeroWhatsapp"];

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async () => {
    const missing = requiredFields.filter((f) => !form[f]);
    if (missing.length > 0) {
      alert("Compila tutti i campi obbligatori.");
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, "users"), {
        ...form,
        createdAt: Timestamp.now(),
      });
      setSuccess(true);
    } catch (error) {
      alert("Errore durante la registrazione.");
      console.error(error);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-2xl shadow-2xl rounded-2xl p-6">
        <CardContent>
          <h2 className="text-2xl font-bold mb-6 text-center">Registrazione Chat Boost</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              ["Nome*", "nome"],
              ["Cognome*", "cognome"],
              ["Email*", "email"],
              ["Password*", "password"],
              ["Telefono personale", "telefono"],
              ["Numero WhatsApp da associare*", "numeroWhatsapp"],
              ["Azienda", "azienda"],
              ["Indirizzo", "indirizzo"],
              ["CAP", "cap"],
              ["Città", "citta"],
              ["Provincia", "provincia"],
              ["Paese", "paese"],
              ["P.IVA", "piva"],
              ["Codice Fiscale", "cf"],
            ].map(([labelText, name]) => (
              <div key={name} className="flex flex-col">
                <Label htmlFor={name}>{labelText}</Label>
                <Input
                  type={name === "password" ? "password" : "text"}
                  name={name}
                  value={form[name]}
                  onChange={handleChange}
                  placeholder={labelText.replace("*", "")}
                  className="rounded-md border border-gray-300"
                />
              </div>
            ))}
          </div>

          <Button
            onClick={handleSubmit}
            className="mt-6 w-full bg-black text-white hover:bg-gray-800"
            disabled={loading}
          >
            {loading ? "Registrazione in corso..." : "Registrati"}
          </Button>

          {success && (
            <p className="mt-4 text-green-600 text-center font-semibold">
              ✅ Registrazione completata con successo!
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
