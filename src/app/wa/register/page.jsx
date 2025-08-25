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
import { LoadScript, Autocomplete } from '@react-google-maps/api';
import { auth, db } from '@/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

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

function normalizePhone(raw = '') {
  return raw.trim()
    .replace(/^[+]+/, '')
    .replace(/^00/, '')
    .replace(/[\s\-().]/g, '');
}

export default function RegisterPage() {
  const [autoComplete, setAutoComplete] = useState(null);
  const [success, setSuccess] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data) => {
    setErrMsg('');
    try {
      // 1) Crea utente Auth
      const cred = await createUserWithEmailAndPassword(auth, data.email, data.password);
      const user = cred.user;

      // 2) Prepara payload per Firestore (senza password!)
      const payload = {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email.toLowerCase(),
        personalPhone: normalizePhone(data.personalPhone),
        whatsappNumber: normalizePhone(data.whatsappNumber),
        company: data.company || '',
        address: data.address || '',
        vat: data.vat || '',
        taxCode: data.taxCode || '',
        uid: user.uid,
        createdAt: serverTimestamp(),
      };

      // 3) Scrivi su Firestore (doc id = uid)
      await setDoc(doc(db, 'users', user.uid), payload, { merge: true });

      // 4) Success UI + redirect
      setSuccess(true);
      setTimeout(() => {
        router.push('/wa/login');
      }, 1600);
    } catch (err) {
      console.error('Registration error:', err);
      // Messaggi più utili
      const code = err?.code || '';
      if (code === 'auth/email-already-in-use') {
        setErrMsg('Questa email è già registrata.');
      } else if (code === 'permission-denied') {
        setErrMsg('Permesso negato su Firestore: controlla le regole.');
      } else if (code === 'failed-precondition') {
        setErrMsg('Firestore non inizializzato correttamente (o regole).');
      } else {
        setErrMsg('Errore durante la registrazione. Riprova.');
      }
    }
  };

  const onPlaceChanged = () => {
    if (autoComplete) {
      const place = autoComplete.getPlace();
      if (place?.formatted_address) {
        setValue('address', place.formatted_address);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="max-w-2xl w-full shadow-xl border border-gray-200">
        <CardContent className="p-8">
          <h2 className="text-2xl font-bold mb-2">Registrati a Chat Boost</h2>
          <p className="text-sm text-gray-500 mb-6">Crea l’account e collega il tuo numero WhatsApp in seguito.</p>

          {errMsg && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errMsg}
            </div>
          )}

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
              <Input type="password" autoComplete="new-password" {...register('password')} />
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
              <LoadScript googleMapsApiKey="AIzaSyANjsj5ydZ-4o-r9mlCPIkimvDkHO5TfOM" libraries={['places']}>
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

            <Button type="submit" className="w-full mt-4" disabled={isSubmitting}>
              {isSubmitting ? 'Registrazione in corso…' : 'Registrati'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Popup Success */}
      {success && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 max-w-sm w-full animate-fade-in">
            <svg width="48" height="48" className="mb-2 text-green-600" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="4" fill="#E6FAEA"/>
              <path d="M14 24l6 6 14-14" stroke="#22C55E" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <h3 className="text-xl font-semibold text-green-700 text-center">Registrazione avvenuta con successo!</h3>
            <p className="text-gray-500 text-center text-sm mb-2">
              Ora puoi effettuare l’accesso con le tue credenziali.
            </p>
            <span className="text-xs text-gray-400">Reindirizzamento al login…</span>
          </div>
        </div>
      )}
    </div>
  );
}
