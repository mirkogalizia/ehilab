import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req) {
  try {
    const { message, customer_phone, customer_name, merchant_id } = await req.json();
    
    if (!message || !merchant_id) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }
    
    console.log('🚀 NEW AI RESPOND START');
    
    const userRef = doc(db, 'users', merchant_id);
    const userSnap = await getDoc(userRef);
    
    if (!userSnap.exists()) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    
    const userData = userSnap.data();
    const aiConfig = userData.ai_config || {};
    
    if (!aiConfig.enabled) {
      return NextResponse.json({ ai_enabled: false });
    }
    
    const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;
    if (!ASSISTANT_ID) {
      return NextResponse.json({ error: 'No Assistant ID' }, { status: 500 });
    }
    
    // Create thread
    const thread = await openai.beta.threads.create();
    console.log('✅ NEW Thread:', thread.id);
    
    // Add message
    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: message
    });
    
    // Run assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID
    });
    
    console.log('✅ NEW Run:', run.id);
    
    // Wait for completion
    let status = run.status;
    let attempts = 0;
    
    while (status !== 'completed' && attempts < 30) {
      await new Promise(r => setTimeout(r, 1000));
      const check = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      status = check.status;
      console.log(`🔄 NEW Status ${attempts}: ${status}`);
      
      if (status === 'failed') {
        return NextResponse.json({ error: 'AI failed' }, { status: 500 });
      }
      attempts++;
    }
    
    if (status !== 'completed') {
      return NextResponse.json({ error: 'Timeout' }, { status: 504 });
    }
    
    // Get response
    const msgs = await openai.beta.threads.messages.list(thread.id);
    const aiMsg = msgs.data.find(m => m.role === 'assistant');
    
    if (!aiMsg) {
      return NextResponse.json({ error: 'No AI response' }, { status: 500 });
    }
    
    const response = aiMsg.content[0].text.value;
    console.log('✅ NEW Response:', response.slice(0, 50));
    
    return NextResponse.json({ ai_enabled: true, response });
    
  } catch (err) {
    console.error('❌ NEW ERROR:', err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
