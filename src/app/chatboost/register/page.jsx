'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: '',
    surname: '',
    company: '',
    address: '',
    piva: '',
    cf: '',
    phone: '',
    whatsapp: '',
    email: '',
    password: '',
  });

  const router = useRouter();

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Qui andrebbe aggiunta la logica Firebase
    console.log('Submitting:', form);
    router.push('/chatboost/dashboard');
  };

  return (
    <main className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
      <Card className="max-w-xl w-full shadow-lg border border-gray-200">
        <CardContent className="p-8">
          <h1 className="text-2xl font-bold mb-6 text-center">Crea il tuo account ChatBoost</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome *</Label>
                <Input name="name" value={form.name} onChange={handleChange} required />
              </div>
              <div>
                <Label>Cognome *</Label>
                <Input name="surname" value={form.surname} onChange={handleChange} required />
              </div>
              <div>
                <Label>Azienda</Label>
                <Input name="company" value={form.company} onChange={handleChange} />
              </div>
              <div>
                <Label>Indirizzo</Label>
                <Input name="address" value={form.address} onChange={handleChange} />
              </div>
              <div>
                <Label>Partita IVA</Label>
                <Input name="piva" value={form.piva} onChange={handleChange} />
              </div>
              <div>
                <Label>Codice Fiscale</Label>
                <Input name="cf" value={form.cf} onChange={handleChange} />
              </div>
              <div>
                <Label>Cellulare personale *</Label>
                <Input name="phone" value={form.phone} onChange={handleChange} required />
              </div>
              <div>
                <Label>Numero da associare a ChatBoost *</Label>
                <Input name="whatsapp" value={form.whatsapp} onChange={handleChange} required />
              </div>
            </div>
            <div>
              <Label>Email *</Label>
              <Input name="email" type="email" value={form.email} onChange={handleChange} required />
            </div>
            <div>
              <Label>Password *</Label>
              <Input name="password" type="password" value={form.password} onChange={handleChange} required />
            </div>
            <p className="text-xs text-gray-500 italic mt-1">
              I campi contrassegnati con * sono obbligatori.
            </p>
            <Button type="submit" className="w-full mt-4 text-base py-6 rounded-xl">
              Crea account
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
