// File: src/app/chatboost/register/page.jsx

'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { GoogleMap, LoadScript, Autocomplete } from '@react-google-maps/api';
import { auth, db } from '@/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, setDoc } from 'firebase/firestore';

const schema = z.object({
  firstName: z.string().min(1, 'Il nome è obbligatorio'),
  lastName: z.string().min(1, 'Il cognome è obbligatorio'),
  email: z.string().email('Email non valida'),
  password: z.string().min(6, 'Minimo 6 caratteri'),
  personalPhone: z.string().min(7, 'Numero di telefono obbligatorio'),
  whatsappNumber: z.string().min(7, 'Numero da associare a Chat Boost obbligatorio'),
  company: z.string().optional(),
  address: z.string().optional(),
  vat: z.string().optional(),
  taxCode: z.string().optional(),
});

export default function RegisterPage() {
  const [autoComplete, setAutoComplete] = useState(null);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data) => {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, data.email, data.password);
      const user = userCredential.user;

      await setDoc(doc(db, 'users', user.uid), {
        ...data,
        uid: user.uid,
        createdAt: new Date(),
      });

      router.push('/chatboost/dashboard');
    } catch (error) {
      alert('Errore durante la registrazione.');
      console.error(error);
    }
  };

  const onPlaceChanged = () => {
    if (autoComplete) {
      const place = autoComplete.getPlace();
      if (place.formatted_address) {
        setValue('address', place.formatted_address);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="max-w-2xl w-full shadow-xl border border-gray-300">
        <CardContent className="p-8">
          <h2 className="text-2xl font-bold mb-4">Registrati a Chat Boost</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Nome*</Label>
                <Input {...register('firstName')} />
                {errors.firstName && <p className="text-red-500 text-sm">{errors.firstName.message}</p>}
              </div>
              <div>
                <Label>Cognome*</Label>
                <Input {...register('lastName')} />
                {errors.lastName && <p className="text-red-500 text-sm">{errors.lastName.message}</p>}
              </div>
            </div>
            <div>
              <Label>Email*</Label>
              <Input type="email" {...register('email')} />
              {errors.email && <p className="text-red-500 text-sm">{errors.email.message}</p>}
            </div>
            <div>
              <Label>Password*</Label>
              <Input type="password" {...register('password')} />
              {errors.password && <p className="text-red-500 text-sm">{errors.password.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Telefono personale*</Label>
                <Input placeholder="+39 320 1234567" {...register('personalPhone')} />
                {errors.personalPhone && <p className="text-red-500 text-sm">{errors.personalPhone.message}</p>}
              </div>
              <div>
                <Label>Numero WhatsApp da associare*</Label>
                <Input placeholder="+1 650 555 1111" {...register('whatsappNumber')} />
                {errors.whatsappNumber && <p className="text-red-500 text-sm">{errors.whatsappNumber.message}</p>}
              </div>
            </div>
            <div>
              <Label>Azienda (opzionale)</Label>
              <Input {...register('company')} />
            </div>
            <div>
              <Label>Indirizzo completo (opzionale)</Label>
              <LoadScript googleMapsApiKey="AIzaSyANjsj5ydZ-4o-r9mlCPIkimvDkHO5TfOM" libraries={["places"]}>
                <Autocomplete onLoad={setAutoComplete} onPlaceChanged={onPlaceChanged}>
                  <Input {...register('address')} placeholder="Via Roma 10, Milano..." />
                </Autocomplete>
              </LoadScript>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Partita IVA (opzionale)</Label>
                <Input {...register('vat')} />
              </div>
              <div>
                <Label>Codice Fiscale (opzionale)</Label>
                <Input {...register('taxCode')} />
              </div>
            </div>
            <Button type="submit" className="w-full mt-4">Registrati</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
