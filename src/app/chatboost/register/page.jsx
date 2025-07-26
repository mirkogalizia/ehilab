// src/app/chatboost/register/page.jsx
"use client";

import { useState } from "react";

export default function RegisterPage() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    company: "",
    address: "",
    piva: "",
    cf: "",
    personalPhone: "",
    whatsappNumber: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log("Dati inviati:", form);
    // TODO: invia a Firebase
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-xl space-y-4"
      >
        <h1 className="text-2xl font-bold text-center">Registrati a ChatBoost</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input
            type="text"
            name="firstName"
            placeholder="Nome*"
            className="input"
            onChange={handleChange}
            required
          />
          <input
            type="text"
            name="lastName"
            placeholder="Cognome*"
            className="input"
            onChange={handleChange}
            required
          />
        </div>

        <input
          type="text"
          name="company"
          placeholder="Azienda (opzionale)"
          className="input"
          onChange={handleChange}
        />

        <input
          type="text"
          name="address"
          placeholder="Indirizzo sede legale"
          className="input"
          onChange={handleChange}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input
            type="text"
            name="piva"
            placeholder="P.IVA (opzionale)"
            className="input"
            onChange={handleChange}
          />
          <input
            type="text"
            name="cf"
            placeholder="Codice Fiscale (opzionale)"
            className="input"
            onChange={handleChange}
          />
        </div>

        <input
          type="tel"
          name="personalPhone"
          placeholder="Cellulare personale*"
          className="input"
          onChange={handleChange}
          required
        />

        <input
          type="tel"
          name="whatsappNumber"
          placeholder="Numero da associare a ChatBoost*"
          className="input"
          onChange={handleChange}
          required
        />

        <input
          type="email"
          name="email"
          placeholder="Email*"
          className="input"
          onChange={handleChange}
          required
        />

        <input
          type="password"
          name="password"
          placeholder="Password*"
          className="input"
          onChange={handleChange}
          required
        />

        <p className="text-sm text-gray-500 italic">
          ⚠️ Il numero associato a ChatBoost non potrà essere utilizzato su WhatsApp telefono.
        </p>

        <button
          type="submit"
          className="w-full bg-black text-white py-3 rounded-xl hover:opacity-90 transition"
        >
          Crea account
        </button>
      </form>
    </div>
  );
}