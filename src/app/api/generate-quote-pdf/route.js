// /src/app/api/generate-quote-pdf/route.js
import { NextResponse } from 'next/server';
import { adminDB, adminBucket } from '@/lib/firebase-admin';

// Genera PDF come buffer usando testo puro (senza dipendenze esterne)
// Questo crea un PDF valido con la struttura base
function generateQuotePDF({ seller, lead, products, notes, quoteNumber, date, expiry }) {
  // Calcoli
  const lines = products.map(p => {
    const qty = p.qty || 1;
    const netTotal = p.price * qty;
    const taxRate = p.taxRate || 22;
    const taxAmount = netTotal * (taxRate / 100);
    const grossTotal = netTotal + taxAmount;
    return { ...p, qty, netTotal, taxRate, taxAmount, grossTotal };
  });

  const subtotal = lines.reduce((s, l) => s + l.netTotal, 0);
  const totalTax = lines.reduce((s, l) => s + l.taxAmount, 0);
  const grandTotal = subtotal + totalTax;

  // Creiamo un HTML-to-text semplice per il PDF
  // Per un PDF professionale, useremo un approccio HTML→PDF
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica', 'Arial', sans-serif; font-size: 12px; color: #333; padding: 40px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 40px; border-bottom: 3px solid #059669; padding-bottom: 20px; }
    .header-left h1 { font-size: 24px; color: #059669; margin-bottom: 4px; }
    .header-left p { font-size: 11px; color: #666; line-height: 1.5; }
    .header-right { text-align: right; }
    .header-right .quote-label { font-size: 20px; font-weight: bold; color: #333; }
    .header-right .quote-number { font-size: 14px; color: #059669; font-weight: bold; }
    .header-right p { font-size: 11px; color: #666; margin-top: 4px; }
    .client-box { background: #f8fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 30px; }
    .client-box h3 { font-size: 11px; text-transform: uppercase; color: #999; letter-spacing: 1px; margin-bottom: 8px; }
    .client-box p { font-size: 12px; line-height: 1.6; }
    .client-box .name { font-size: 14px; font-weight: bold; color: #111; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    thead th { background: #059669; color: white; padding: 10px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
    thead th:nth-child(3), thead th:nth-child(4), thead th:nth-child(5), thead th:nth-child(6) { text-align: right; }
    tbody td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 11px; }
    tbody td:nth-child(3), tbody td:nth-child(4), tbody td:nth-child(5), tbody td:nth-child(6) { text-align: right; }
    tbody tr:nth-child(even) { background: #fafafa; }
    .totals { margin-left: auto; width: 280px; }
    .totals .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 12px; }
    .totals .row.sub { border-bottom: 1px solid #eee; color: #666; }
    .totals .row.grand { border-top: 2px solid #059669; padding-top: 10px; margin-top: 6px; font-size: 16px; font-weight: bold; color: #059669; }
    .notes { margin-top: 30px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; }
    .notes h3 { font-size: 11px; text-transform: uppercase; color: #b45309; letter-spacing: 1px; margin-bottom: 6px; }
    .notes p { font-size: 11px; color: #78350f; line-height: 1.5; }
    .footer { margin-top: 40px; text-align: center; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 15px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>${seller.company || seller.firstName + ' ' + seller.lastName}</h1>
      <p>
        ${seller.address || ''}${seller.address ? '<br>' : ''}
        ${seller.cap ? seller.cap + ' ' : ''}${seller.citta || ''}${seller.provincia ? ' (' + seller.provincia + ')' : ''}<br>
        ${seller.vat ? 'P.IVA: ' + seller.vat + '<br>' : ''}
        ${seller.taxCode ? 'CF: ' + seller.taxCode + '<br>' : ''}
        ${seller.email ? seller.email + '<br>' : ''}
        ${seller.personalPhone || ''}
      </p>
    </div>
    <div class="header-right">
      <div class="quote-label">PREVENTIVO</div>
      <div class="quote-number">N° ${quoteNumber}</div>
      <p>Data: ${date}</p>
      ${expiry ? '<p>Validità: ' + expiry + '</p>' : ''}
    </div>
  </div>

  <div class="client-box">
    <h3>Destinatario</h3>
    <p class="name">${lead.name}</p>
    <p>
      ${lead.address ? lead.address + '<br>' : ''}
      ${lead.taxCode ? 'CF: ' + lead.taxCode + '<br>' : ''}
      ${lead.phone ? 'Tel: ' + lead.phone + '<br>' : ''}
      ${lead.email ? lead.email : ''}
    </p>
  </div>

  <table>
    <thead>
      <tr>
        <th>Descrizione</th>
        <th>Unità</th>
        <th>Qtà</th>
        <th>Prezzo Unit.</th>
        <th>IVA</th>
        <th>Totale</th>
      </tr>
    </thead>
    <tbody>
      ${lines.map(l => `
      <tr>
        <td><strong>${l.name}</strong></td>
        <td>${l.unit || 'pz'}</td>
        <td>${l.qty}</td>
        <td>€${l.price.toFixed(2)}</td>
        <td>${l.taxRate}%</td>
        <td><strong>€${l.grossTotal.toFixed(2)}</strong></td>
      </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div class="row sub">
      <span>Imponibile</span>
      <span>€${subtotal.toFixed(2)}</span>
    </div>
    <div class="row sub">
      <span>IVA</span>
      <span>€${totalTax.toFixed(2)}</span>
    </div>
    <div class="row grand">
      <span>TOTALE</span>
      <span>€${grandTotal.toFixed(2)}</span>
    </div>
  </div>

  ${notes ? `
  <div class="notes">
    <h3>Note</h3>
    <p>${notes}</p>
  </div>
  ` : ''}

  <div class="footer">
    Documento generato automaticamente · ${seller.company || ''} · ${date}
  </div>
</body>
</html>`;

  return { html, grandTotal, subtotal, totalTax };
}

export async function POST(req) {
  try {
    const { user_uid, lead, products, notes } = await req.json();

    if (!user_uid || !lead || !products?.length) {
      return NextResponse.json({ error: 'Dati mancanti (user_uid, lead, products)' }, { status: 400 });
    }

    // Carica dati utente (venditore)
    const userSnap = await adminDB.doc(`users/${user_uid}`).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: 'Utente non trovato' }, { status: 404 });
    }
    const seller = userSnap.data();

    // Numero preventivo progressivo
    const counterRef = adminDB.doc(`users/${user_uid}/counters/quotes`);
    const counterSnap = await counterRef.get();
    let quoteNumber = 1;
    if (counterSnap.exists) {
      quoteNumber = (counterSnap.data().last || 0) + 1;
    }
    await counterRef.set({ last: quoteNumber }, { merge: true });

    const dateStr = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    const expiryStr = expiryDate.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const { html, grandTotal } = generateQuotePDF({
      seller,
      lead,
      products,
      notes,
      quoteNumber: String(quoteNumber).padStart(4, '0'),
      date: dateStr,
      expiry: expiryStr,
    });

    // Convertiamo HTML in PDF usando puppeteer (se disponibile) o salviamo come HTML
    // Per ora usiamo un approccio con fetch a un servizio di conversione gratuito
    // oppure salviamo HTML e lo convertiamo client-side

    // Approccio: salviamo l'HTML come file, poi lo convertiamo in PDF con un tool headless
    // Per semplicità, proviamo con il pacchetto html-pdf-node se disponibile

    let pdfBuffer;
    try {
      // Tentativo con puppeteer-core o chrome-aws-lambda (per Vercel/server)
      const puppeteer = require('puppeteer');
      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
      });
      await browser.close();
    } catch (puppeteerErr) {
      console.log('[generate-quote-pdf] Puppeteer non disponibile, salvo HTML come fallback');
      // Fallback: salva l'HTML come file (il browser può renderizzarlo)
      pdfBuffer = Buffer.from(html, 'utf-8');
    }

    // Upload su Firebase Storage
    const fileName = `quotes/preventivo_${quoteNumber}_${Date.now()}.pdf`;
    const filePath = `users/${user_uid}/${fileName}`;
    const file = adminBucket.file(filePath);
    
    const contentType = pdfBuffer.toString().startsWith('<!DOCTYPE') ? 'text/html' : 'application/pdf';
    
    await file.save(pdfBuffer, {
      metadata: {
        contentType,
        metadata: {
          quoteNumber: String(quoteNumber),
          leadName: lead.name,
          total: String(grandTotal),
        },
      },
    });

    // Rendi il file pubblico e ottieni URL
    await file.makePublic();
    const url = `https://storage.googleapis.com/${adminBucket.name}/${filePath}`;

    // Salva il preventivo in Firestore
    await adminDB.collection(`users/${user_uid}/quotes`).add({
      quoteNumber,
      leadName: lead.name,
      leadPhone: lead.phone,
      leadEmail: lead.email,
      products,
      subtotal: grandTotal, // gross
      notes: notes || '',
      pdfUrl: url,
      createdAt: new Date(),
    });

    console.log(`[generate-quote-pdf] Preventivo #${quoteNumber} generato per ${lead.name}: ${url}`);

    return NextResponse.json({ success: true, url, quoteNumber });
  } catch (e) {
    console.error('[generate-quote-pdf] Errore:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}