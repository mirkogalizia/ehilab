'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '@/lib/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Loader2,
  Plus,
  X,
  ChevronRight,
  GripVertical,
  Phone,
  Mail,
  Building2,
  DollarSign,
  Trash2,
  Edit3,
  Clock,
  User,
  Tag,
  MoreHorizontal,
  Search,
  Filter,
  ArrowUpDown,
  Eye,
  MessageSquare,
  CalendarDays,
  Zap,
  Settings2,
  Palette,
  ChevronUp,
  ChevronDown,
  Check,
  Save,
  UserPlus,
  Contact,
  Users,
  Send,
  FileText,
} from 'lucide-react';

// ─── DEFAULT PIPELINE STAGES ───
const DEFAULT_STAGES = [
  { id: 'contacted', label: 'Contacted', color: '#3B82F6', order: 0 },
  { id: 'qualified', label: 'Qualified', color: '#F59E0B', order: 1 },
  { id: 'nurturing', label: 'Nurturing', color: '#10B981', order: 2 },
  { id: 'pitch', label: 'Pitch', color: '#EF4444', order: 3 },
  { id: 'negotiation', label: 'Negotiation', color: '#8B5CF6', order: 4 },
  { id: 'closed_won', label: 'Chiuso Vinto', color: '#059669', order: 5 },
  { id: 'closed_lost', label: 'Chiuso Perso', color: '#6B7280', order: 6 },
];

// ─── STAGE COLOR MAP ───
const STAGE_COLORS = {
  contacted: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-300', bar: '#3B82F6', badge: 'bg-blue-100 text-blue-800' },
  qualified: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300', bar: '#F59E0B', badge: 'bg-amber-100 text-amber-800' },
  nurturing: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-300', bar: '#10B981', badge: 'bg-emerald-100 text-emerald-800' },
  pitch: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-300', bar: '#EF4444', badge: 'bg-red-100 text-red-800' },
  negotiation: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-300', bar: '#8B5CF6', badge: 'bg-violet-100 text-violet-800' },
  closed_won: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-300', bar: '#059669', badge: 'bg-green-100 text-green-800' },
  closed_lost: { bg: 'bg-gray-50', text: 'text-gray-500', border: 'border-gray-300', bar: '#6B7280', badge: 'bg-gray-200 text-gray-600' },
};

const getStageStyle = (stageId, stagesArr) => {
  // Try hardcoded first
  if (STAGE_COLORS[stageId]) return STAGE_COLORS[stageId];
  // For custom stages, generate from the stage's color field
  const stage = (stagesArr || []).find(s => s.id === stageId);
  if (stage?.color) {
    return {
      bg: 'bg-gray-50',
      text: 'text-gray-700',
      border: 'border-gray-300',
      bar: stage.color,
      badge: 'bg-gray-100 text-gray-700',
    };
  }
  return STAGE_COLORS.contacted;
};

// ─── FORMAT CURRENCY ───
function formatCurrency(value) {
  if (!value && value !== 0) return '€0';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 }).format(value);
}

// ─── FORMAT DATE ───
function formatDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'Ora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} min fa`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h fa`;
  if (diff < 172800000) return 'Ieri';
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

// ═══════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════
export default function PipelinePage() {
  const { user, loading: authLoading } = useAuth();

  // Pipeline & leads
  const [stages, setStages] = useState(DEFAULT_STAGES);
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  // UI state
  const [selectedLead, setSelectedLead] = useState(null);
  const [showNewLeadForm, setShowNewLeadForm] = useState(null); // stageId or null
  const [searchQuery, setSearchQuery] = useState('');
  const [draggedLead, setDraggedLead] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showPipelineEditor, setShowPipelineEditor] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(null); // stageId or null
  const [contacts, setContacts] = useState([]);
  const [contactsLoading, setContactsLoading] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(null); // holds { phone, name } or null

  // New lead form
  const [newLead, setNewLead] = useState({
    name: '', sale: 0, contactName: '', contactPhone: '', contactEmail: '',
    company: '', companyAddress: '', tags: '',
  });

  // ─── FIRESTORE: LOAD PIPELINE CONFIG ───
  useEffect(() => {
    if (!user?.uid) return;
    const loadPipeline = async () => {
      try {
        const pipeRef = doc(db, 'users', user.uid, 'pipeline', 'config');
        const snap = await getDoc(pipeRef);
        if (snap.exists() && snap.data().stages?.length) {
          setStages(snap.data().stages);
        }
      } catch (e) {
        console.error('Errore caricamento pipeline config:', e);
      }
    };
    loadPipeline();
  }, [user]);

  // ─── SAVE PIPELINE CONFIG ───
  const savePipelineConfig = async (newStages) => {
    if (!user?.uid) return;
    try {
      const pipeRef = doc(db, 'users', user.uid, 'pipeline', 'config');
      await setDoc(pipeRef, { stages: newStages, updatedAt: serverTimestamp() }, { merge: true });
      setStages(newStages);
    } catch (e) {
      console.error('Errore salvataggio pipeline config:', e);
    }
  };

  // ─── FIRESTORE: REALTIME LEADS LISTENER ───
  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);

    const q = query(
      collection(db, 'users', user.uid, 'leads'),
      orderBy('updatedAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setLeads(arr);
      setLoading(false);
    }, (err) => {
      console.error('Errore leads listener:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [user]);

  // ─── FIRESTORE: LOAD USER CONTACTS ───
  useEffect(() => {
    if (!user?.uid) return;
    setContactsLoading(true);
    const q = query(
      collection(db, 'contacts'),
      where('createdBy', '==', user.uid)
    );
    const unsub = onSnapshot(q, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setContacts(arr);
      setContactsLoading(false);
    }, (err) => {
      console.error('Errore contacts listener:', err);
      setContactsLoading(false);
    });
    return () => unsub();
  }, [user]);

  // ─── ADD LEAD ───
  const handleAddLead = async (stageId) => {
    if (!newLead.name.trim()) return;
    try {
      const leadData = {
        name: newLead.name.trim(),
        sale: parseFloat(newLead.sale) || 0,
        stage: stageId,
        contactName: newLead.contactName.trim(),
        contactPhone: newLead.contactPhone.trim(),
        contactEmail: newLead.contactEmail.trim(),
        company: newLead.company.trim(),
        companyAddress: newLead.companyAddress.trim(),
        tags: newLead.tags ? newLead.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        history: [{
          action: 'created',
          stage: stageId,
          timestamp: new Date().toISOString(),
          note: 'Lead creata',
        }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'users', user.uid, 'leads'), leadData);
      setNewLead({ name: '', sale: 0, contactName: '', contactPhone: '', contactEmail: '', company: '', companyAddress: '', tags: '' });
      setShowNewLeadForm(null);
    } catch (e) {
      console.error('Errore creazione lead:', e);
    }
  };

  // ─── ADD LEAD FROM EXISTING CONTACT ───
  const handleAddLeadFromContact = async (contact, stageId) => {
    try {
      const leadData = {
        name: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.phone || 'Lead',
        sale: 0,
        stage: stageId,
        contactName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        contactPhone: contact.phone || '',
        contactEmail: contact.email || '',
        company: contact.shop || '',
        companyAddress: contact.address || '',
        contactId: contact.id, // link back to original contact doc
        tags: [...(contact.tags || []), ...(contact.categories || [])],
        history: [{
          action: 'created',
          stage: stageId,
          timestamp: new Date().toISOString(),
          note: `Lead creata da contatto ${contact.firstName || ''} ${contact.lastName || ''} (${contact.phone || ''})`,
        }],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await addDoc(collection(db, 'users', user.uid, 'leads'), leadData);
      setShowContactPicker(null);
    } catch (e) {
      console.error('Errore creazione lead da contatto:', e);
    }
  };

  // ─── MOVE LEAD TO STAGE ───
  const moveLeadToStage = async (leadId, newStage, oldStage) => {
    if (newStage === oldStage) return;
    try {
      const leadRef = doc(db, 'users', user.uid, 'leads', leadId);
      const lead = leads.find(l => l.id === leadId);
      const historyEntry = {
        action: 'stage_change',
        from: oldStage,
        to: newStage,
        timestamp: new Date().toISOString(),
        note: `Spostata da ${stages.find(s => s.id === oldStage)?.label || oldStage} a ${stages.find(s => s.id === newStage)?.label || newStage}`,
      };
      await updateDoc(leadRef, {
        stage: newStage,
        updatedAt: serverTimestamp(),
        history: [...(lead?.history || []), historyEntry],
      });
      // Update selected lead if open
      if (selectedLead?.id === leadId) {
        setSelectedLead(prev => ({
          ...prev,
          stage: newStage,
          history: [...(prev?.history || []), historyEntry],
        }));
      }
    } catch (e) {
      console.error('Errore spostamento lead:', e);
    }
  };

  // ─── DELETE LEAD ───
  const handleDeleteLead = async (leadId) => {
    if (!confirm('Eliminare questa lead?')) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'leads', leadId));
      if (selectedLead?.id === leadId) setSelectedLead(null);
    } catch (e) {
      console.error('Errore eliminazione lead:', e);
    }
  };

  // ─── UPDATE LEAD FIELD ───
  const updateLeadField = async (leadId, field, value) => {
    try {
      await updateDoc(doc(db, 'users', user.uid, 'leads', leadId), {
        [field]: value,
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('Errore aggiornamento lead:', e);
    }
  };

  // ─── DRAG & DROP ───
  const handleDragStart = (e, lead) => {
    setDraggedLead(lead);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', lead.id);
    // Add drag ghost styling
    setTimeout(() => {
      e.target.style.opacity = '0.4';
    }, 0);
  };

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1';
    setDraggedLead(null);
    setDragOverStage(null);
  };

  const handleDragOver = (e, stageId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStage(stageId);
  };

  const handleDragLeave = (e, stageId) => {
    // Only clear if leaving the stage container entirely
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverStage(null);
    }
  };

  const handleDrop = (e, stageId) => {
    e.preventDefault();
    setDragOverStage(null);
    if (draggedLead) {
      moveLeadToStage(draggedLead.id, stageId, draggedLead.stage);
    }
  };

  // ─── FILTER LEADS ───
  const filteredLeads = leads.filter(l => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      l.name?.toLowerCase().includes(q) ||
      l.contactName?.toLowerCase().includes(q) ||
      l.contactEmail?.toLowerCase().includes(q) ||
      l.company?.toLowerCase().includes(q) ||
      l.contactPhone?.includes(q)
    );
  });

  // ─── COMPUTE STAGE STATS ───
  const getStageLeads = (stageId) => filteredLeads.filter(l => l.stage === stageId);
  const getStageTotalSale = (stageId) => getStageLeads(stageId).reduce((sum, l) => sum + (l.sale || 0), 0);

  // ─── LOADING / AUTH GUARD ───
  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="animate-spin w-8 h-8 text-gray-400" />
      </div>
    );
  }
  if (!user) return null;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#F5F5F0]">
      {/* ═══ TOP BAR ═══ */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* Left */}
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-extrabold tracking-tight text-gray-900">LEADS</h1>
            <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
              {leads.length} lead{leads.length !== 1 ? 's' : ''}
            </span>
            <span className="text-xs text-gray-500 font-medium">
              {formatCurrency(leads.reduce((s, l) => s + (l.sale || 0), 0))}
            </span>
          </div>

          {/* Right */}
          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Cerca lead..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-emerald-400 focus:outline-none transition w-48"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>

            {/* Automate */}
            <Button
              variant="outline"
              size="sm"
              className="text-xs font-semibold flex items-center gap-1.5 border-gray-200"
              onClick={() => {/* future: automations */}}
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              Automate
            </Button>

            {/* Edit Pipeline */}
            <Button
              variant="outline"
              size="sm"
              className="text-xs font-semibold flex items-center gap-1.5 border-gray-200"
              onClick={() => setShowPipelineEditor(true)}
            >
              <Settings2 className="w-3.5 h-3.5 text-gray-500" />
              Modifica Pipeline
            </Button>

            {/* New Lead - opens form in first stage */}
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
              onClick={() => setShowNewLeadForm(stages[0]?.id || 'contacted')}
            >
              <Plus className="w-4 h-4" />
              Nuova Lead
            </Button>
          </div>
        </div>
      </div>

      {/* ═══ PIPELINE BOARD ═══ */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex h-full min-w-max p-4 gap-3">
          {stages.map((stage) => {
            const stageLeads = getStageLeads(stage.id);
            const totalSale = getStageTotalSale(stage.id);
            const style = getStageStyle(stage.id, stages);
            const isDragOver = dragOverStage === stage.id;

            return (
              <div
                key={stage.id}
                className={`flex flex-col w-[280px] flex-shrink-0 rounded-xl transition-all duration-200 ${
                  isDragOver ? 'ring-2 ring-emerald-400 ring-offset-2 scale-[1.01]' : ''
                }`}
                onDragOver={(e) => handleDragOver(e, stage.id)}
                onDragLeave={(e) => handleDragLeave(e, stage.id)}
                onDrop={(e) => handleDrop(e, stage.id)}
              >
                {/* Stage Header */}
                <div className="flex-shrink-0 mb-2">
                  <div
                    className="h-1.5 rounded-full mb-2"
                    style={{ backgroundColor: style.bar }}
                  />
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[11px] font-bold tracking-widest uppercase text-gray-600">
                      {stage.label}
                    </span>
                    <span className="text-[11px] text-gray-400 font-medium">
                      {stageLeads.length} lead{stageLeads.length !== 1 ? 's' : ''} · {formatCurrency(totalSale)}
                    </span>
                  </div>
                </div>

                {/* Cards Area */}
                <div className="flex-1 overflow-y-auto space-y-2 pb-2 min-h-[120px]">
                  {/* Quick Add / Contact Picker */}
                  {showNewLeadForm === stage.id ? (
                    <NewLeadCard
                      newLead={newLead}
                      setNewLead={setNewLead}
                      onAdd={() => handleAddLead(stage.id)}
                      onCancel={() => { setShowNewLeadForm(null); setNewLead({ name: '', sale: 0, contactName: '', contactPhone: '', contactEmail: '', company: '', companyAddress: '', tags: '' }); }}
                    />
                  ) : (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setShowNewLeadForm(stage.id)}
                        className="flex-1 py-2 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-xs font-medium hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50/50 transition-all flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Nuova
                      </button>
                      <button
                        onClick={() => setShowContactPicker(stage.id)}
                        className="flex-1 py-2 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-xs font-medium hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/50 transition-all flex items-center justify-center gap-1"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> Contatto
                      </button>
                    </div>
                  )}

                  {/* Lead Cards */}
                  {loading && stageLeads.length === 0 ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="animate-spin w-5 h-5 text-gray-300" />
                    </div>
                  ) : (
                    stageLeads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        stages={stages}
                        onClick={() => setSelectedLead(lead)}
                        onDragStart={(e) => handleDragStart(e, lead)}
                        onDragEnd={handleDragEnd}
                        isDragging={draggedLead?.id === lead.id}
                      />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ LEAD DETAIL PANEL (SLIDE-OVER) ═══ */}
      {selectedLead && (
        <LeadDetailPanel
          lead={leads.find(l => l.id === selectedLead.id) || selectedLead}
          stages={stages}
          onClose={() => setSelectedLead(null)}
          onMoveStage={(newStage) => moveLeadToStage(selectedLead.id, newStage, selectedLead.stage)}
          onUpdateField={(field, value) => updateLeadField(selectedLead.id, field, value)}
          onDelete={() => handleDeleteLead(selectedLead.id)}
          onSendTemplate={(phone, contactName) => setShowTemplatePicker({ phone, name: contactName })}
        />
      )}

      {/* ═══ PIPELINE EDITOR MODAL ═══ */}
      {showPipelineEditor && (
        <PipelineEditorModal
          stages={stages}
          leads={leads}
          onSave={(newStages) => {
            savePipelineConfig(newStages);
            setShowPipelineEditor(false);
          }}
          onClose={() => setShowPipelineEditor(false)}
        />
      )}

      {/* ═══ CONTACT PICKER MODAL ═══ */}
      {showContactPicker && (
        <ContactPickerModal
          contacts={contacts}
          leads={leads}
          loading={contactsLoading}
          stageName={stages.find(s => s.id === showContactPicker)?.label || showContactPicker}
          onSelect={(contact) => handleAddLeadFromContact(contact, showContactPicker)}
          onClose={() => setShowContactPicker(null)}
        />
      )}

      {/* ═══ TEMPLATE SEND MODAL ═══ */}
      {showTemplatePicker && (
        <TemplateSendModal
          userUid={user.uid}
          recipientPhone={showTemplatePicker.phone}
          recipientName={showTemplatePicker.name}
          onClose={() => setShowTemplatePicker(null)}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// NEW LEAD CARD (inline form)
// ═══════════════════════════════════════════════════
function NewLeadCard({ newLead, setNewLead, onAdd, onCancel }) {
  const nameRef = useRef(null);
  useEffect(() => { nameRef.current?.focus(); }, []);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-3 space-y-2 animate-in fade-in-0 slide-in-from-top-2">
      <input
        ref={nameRef}
        type="text"
        placeholder="Nome lead"
        value={newLead.name}
        onChange={e => setNewLead(prev => ({ ...prev, name: e.target.value }))}
        onKeyDown={e => e.key === 'Enter' && onAdd()}
        className="w-full text-sm font-semibold px-2 py-1.5 border border-gray-200 rounded-lg focus:border-emerald-400 focus:outline-none"
      />
      <div className="flex items-center gap-1">
        <span className="text-gray-400 text-sm">€</span>
        <input
          type="number"
          placeholder="0"
          value={newLead.sale || ''}
          onChange={e => setNewLead(prev => ({ ...prev, sale: e.target.value }))}
          className="w-20 text-sm px-2 py-1 border border-gray-200 rounded-lg focus:border-emerald-400 focus:outline-none"
        />
      </div>

      <div className="space-y-1.5">
        <input
          type="text"
          placeholder="Contact: Nome"
          value={newLead.contactName}
          onChange={e => setNewLead(prev => ({ ...prev, contactName: e.target.value }))}
          className="w-full text-xs px-2 py-1 border border-gray-100 rounded bg-gray-50 focus:border-emerald-300 focus:outline-none placeholder:text-gray-300"
        />
        <input
          type="tel"
          placeholder="Contact: Telefono"
          value={newLead.contactPhone}
          onChange={e => setNewLead(prev => ({ ...prev, contactPhone: e.target.value }))}
          className="w-full text-xs px-2 py-1 border border-gray-100 rounded bg-gray-50 focus:border-emerald-300 focus:outline-none placeholder:text-gray-300"
        />
        <input
          type="email"
          placeholder="Contact: Email"
          value={newLead.contactEmail}
          onChange={e => setNewLead(prev => ({ ...prev, contactEmail: e.target.value }))}
          className="w-full text-xs px-2 py-1 border border-gray-100 rounded bg-gray-50 focus:border-emerald-300 focus:outline-none placeholder:text-gray-300"
        />
      </div>

      <div className="border-t border-gray-100 pt-1.5 space-y-1.5">
        <input
          type="text"
          placeholder="Company: Nome"
          value={newLead.company}
          onChange={e => setNewLead(prev => ({ ...prev, company: e.target.value }))}
          className="w-full text-xs px-2 py-1 border border-gray-100 rounded bg-gray-50 focus:border-emerald-300 focus:outline-none placeholder:text-gray-300"
        />
        <input
          type="text"
          placeholder="Company: Indirizzo"
          value={newLead.companyAddress}
          onChange={e => setNewLead(prev => ({ ...prev, companyAddress: e.target.value }))}
          className="w-full text-xs px-2 py-1 border border-gray-100 rounded bg-gray-50 focus:border-emerald-300 focus:outline-none placeholder:text-gray-300"
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4" onClick={onAdd}>
          Aggiungi
        </Button>
        <button onClick={onCancel} className="text-xs text-gray-400 hover:text-gray-600 font-medium">
          Annulla
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// LEAD CARD
// ═══════════════════════════════════════════════════
function LeadCard({ lead, stages, onClick, onDragStart, onDragEnd, isDragging }) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`group bg-white rounded-xl border border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md transition-all cursor-pointer p-3 select-none ${
        isDragging ? 'opacity-50 ring-2 ring-emerald-400' : ''
      }`}
    >
      {/* Top row: name + handle */}
      <div className="flex items-start justify-between mb-1.5">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm text-gray-900 truncate">{lead.name}</div>
          {lead.contactName && (
            <div className="text-emerald-600 text-xs font-semibold truncate">{lead.contactName}</div>
          )}
        </div>
        <GripVertical className="w-4 h-4 text-gray-300 group-hover:text-gray-400 flex-shrink-0 mt-0.5 cursor-grab" />
      </div>

      {/* Sale */}
      <div className="text-base font-extrabold text-gray-800 mb-2">
        {formatCurrency(lead.sale)}
      </div>

      {/* Meta row */}
      <div className="flex items-center justify-between text-[10px] text-gray-400">
        <div className="flex items-center gap-2">
          {lead.contactPhone && (
            <span className="flex items-center gap-0.5">
              <Phone className="w-3 h-3" /> {lead.contactPhone}
            </span>
          )}
        </div>
        <span>{formatDate(lead.updatedAt)}</span>
      </div>

      {/* Tags */}
      {lead.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {lead.tags.slice(0, 3).map((tag, i) => (
            <span key={i} className="text-[9px] font-semibold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
              #{tag}
            </span>
          ))}
          {lead.tags.length > 3 && (
            <span className="text-[9px] text-gray-400">+{lead.tags.length - 3}</span>
          )}
        </div>
      )}

      {/* No tasks indicator */}
      {!lead.tasks?.length && (
        <div className="mt-2 text-[10px] text-amber-500 font-medium flex items-center gap-1">
          <Clock className="w-3 h-3" /> No Tasks
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// LEAD DETAIL PANEL (Side panel like Kommo)
// ═══════════════════════════════════════════════════
function LeadDetailPanel({ lead, stages, onClose, onMoveStage, onUpdateField, onDelete, onSendTemplate }) {
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [noteText, setNoteText] = useState('');
  const panelRef = useRef(null);

  const style = getStageStyle(lead.stage, stages);

  const startEdit = (field, currentValue) => {
    setEditingField(field);
    setEditValue(currentValue || '');
  };

  const saveEdit = () => {
    if (editingField) {
      const val = editingField === 'sale' ? parseFloat(editValue) || 0 : editValue;
      onUpdateField(editingField, val);
      setEditingField(null);
      setEditValue('');
    }
  };

  const addNote = () => {
    if (!noteText.trim()) return;
    const newHistory = [
      ...(lead.history || []),
      {
        action: 'note',
        timestamp: new Date().toISOString(),
        note: noteText.trim(),
      },
    ];
    onUpdateField('history', newHistory);
    setNoteText('');
  };

  // Editable field component
  const EditableField = ({ label, field, value, icon: Icon }) => (
    <div className="flex items-center justify-between py-2 group">
      <div className="flex items-center gap-2 text-sm text-gray-500 min-w-[100px]">
        {Icon && <Icon className="w-3.5 h-3.5" />}
        {label}
      </div>
      {editingField === field ? (
        <div className="flex items-center gap-1">
          <input
            autoFocus
            type={field === 'sale' ? 'number' : 'text'}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingField(null); }}
            onBlur={saveEdit}
            className="text-sm px-2 py-0.5 border border-emerald-300 rounded focus:outline-none w-36"
          />
        </div>
      ) : (
        <button
          onClick={() => startEdit(field, value)}
          className="text-sm text-gray-800 font-medium hover:text-emerald-700 transition truncate max-w-[180px] text-right"
        >
          {value || <span className="text-gray-300">...</span>}
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />

      {/* Panel */}
      <div
        ref={panelRef}
        className="fixed right-0 top-0 h-full w-full max-w-[520px] bg-white shadow-2xl z-50 flex flex-col overflow-hidden"
        style={{ animation: 'slideInRight 0.3s ease-out' }}
      >
        {/* Header */}
        <div className="flex-shrink-0 border-b border-gray-100">
          <div className="flex items-center justify-between px-5 py-4">
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition">
              <X className="w-5 h-5 text-gray-500" />
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={onDelete}
                className="p-1.5 hover:bg-red-50 rounded-lg transition text-gray-400 hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button className="p-1.5 hover:bg-gray-100 rounded-lg transition text-gray-400 hover:text-gray-600">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Lead title */}
          <div className="px-5 pb-3">
            <h2 className="text-xl font-extrabold text-gray-900 mb-1">{lead.name}</h2>
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${style.badge}`}>
                {stages.find(s => s.id === lead.stage)?.label || lead.stage}
              </span>
              {lead.tags?.map((tag, i) => (
                <span key={i} className="text-[10px] font-medium bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {/* Stage Selector (Kommo-style progress) */}
          <div className="px-5 pb-4">
            <div className="flex gap-1">
              {stages.map((s) => {
                const isActive = s.id === lead.stage;
                const isPast = stages.findIndex(st => st.id === lead.stage) > stages.findIndex(st => st.id === s.id);
                return (
                  <button
                    key={s.id}
                    onClick={() => onMoveStage(s.id)}
                    className={`flex-1 h-2 rounded-full transition-all duration-300 hover:opacity-80 ${
                      isActive ? 'scale-y-150' : ''
                    }`}
                    style={{
                      backgroundColor: isActive || isPast
                        ? getStageStyle(s.id, stages).bar
                        : '#E5E7EB',
                    }}
                    title={s.label}
                  />
                );
              })}
            </div>
            <div className="flex justify-between mt-1.5 text-[9px] text-gray-400 font-medium">
              {stages.map(s => (
                <span key={s.id} className={s.id === lead.stage ? 'text-gray-700 font-bold' : ''}>
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Contact Info */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <User className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Contatto</span>
            </div>
            <EditableField label="Nome" field="contactName" value={lead.contactName} icon={User} />
            <EditableField label="Telefono" field="contactPhone" value={lead.contactPhone} icon={Phone} />
            <EditableField label="Email" field="contactEmail" value={lead.contactEmail} icon={Mail} />
            <EditableField label="Valore" field="sale" value={lead.sale ? formatCurrency(lead.sale) : ''} icon={DollarSign} />
          </div>

          {/* Company Info */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Azienda</span>
            </div>
            <EditableField label="Azienda" field="company" value={lead.company} icon={Building2} />
            <EditableField label="Indirizzo" field="companyAddress" value={lead.companyAddress} />
          </div>

          {/* Activity / History (Kommo-style timeline) */}
          <div className="px-5 py-4">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Attività</span>
            </div>

            {/* Note input */}
            <div className="flex items-center gap-2 mb-4">
              <input
                type="text"
                placeholder="Aggiungi una nota..."
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addNote()}
                className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:border-emerald-400 focus:outline-none bg-gray-50"
              />
              <Button
                size="sm"
                disabled={!noteText.trim()}
                onClick={addNote}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                Invia
              </Button>
            </div>

            {/* Timeline */}
            <div className="space-y-0 relative">
              <div className="absolute left-[7px] top-3 bottom-3 w-px bg-gray-200" />

              {(lead.history || []).slice().reverse().map((entry, i) => {
                const isStageChange = entry.action === 'stage_change';
                const isNote = entry.action === 'note';
                const isCreated = entry.action === 'created';

                return (
                  <div key={i} className="flex gap-3 py-2 relative">
                    {/* Dot */}
                    <div className={`w-[15px] h-[15px] rounded-full border-2 flex-shrink-0 z-10 mt-0.5 ${
                      isStageChange ? 'border-violet-400 bg-violet-100' :
                      isNote ? 'border-emerald-400 bg-emerald-100' :
                      'border-gray-300 bg-gray-100'
                    }`} />

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      {isStageChange && (
                        <div className="text-xs text-gray-600">
                          <span className="font-medium">Spostata a </span>
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${getStageStyle(entry.to, stages).badge}`}>
                            {stages.find(s => s.id === entry.to)?.label || entry.to}
                          </span>
                          <span className="text-gray-400 ml-1">
                            da {stages.find(s => s.id === entry.from)?.label || entry.from}
                          </span>
                        </div>
                      )}
                      {isNote && (
                        <div className="text-xs text-gray-700 bg-gray-50 px-2.5 py-1.5 rounded-lg border border-gray-100">
                          {entry.note}
                        </div>
                      )}
                      {isCreated && (
                        <div className="text-xs text-gray-500 italic">Lead creata</div>
                      )}
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {entry.timestamp ? new Date(entry.timestamp).toLocaleString('it-IT', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                        }) : ''}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Quick Actions Footer */}
        <div className="flex-shrink-0 border-t border-gray-100 px-5 py-3 bg-gray-50/80">
          <div className="flex items-center gap-2 flex-wrap">
            {lead.contactPhone && (
              <button
                onClick={() => onSendTemplate(lead.contactPhone, lead.contactName || lead.name)}
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg transition"
              >
                <Send className="w-3.5 h-3.5" /> Invia Template
              </button>
            )}
            {lead.contactPhone && (
              <a
                href={`https://wa.me/${lead.contactPhone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition"
              >
                <MessageSquare className="w-3.5 h-3.5" /> Chat WA
              </a>
            )}
            {lead.contactEmail && (
              <a
                href={`mailto:${lead.contactEmail}`}
                className="flex items-center gap-1.5 text-xs font-semibold text-blue-700 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-lg transition"
              >
                <Mail className="w-3.5 h-3.5" /> Email
              </a>
            )}
            {lead.contactPhone && (
              <a
                href={`tel:${lead.contactPhone}`}
                className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition"
              >
                <Phone className="w-3.5 h-3.5" /> Chiama
              </a>
            )}
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>
    </>
  );
}

// ═══════════════════════════════════════════════════
// PIPELINE EDITOR MODAL
// ═══════════════════════════════════════════════════
const PRESET_COLORS = [
  '#3B82F6', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6',
  '#059669', '#6B7280', '#EC4899', '#F97316', '#06B6D4',
  '#84CC16', '#D946EF', '#14B8A6', '#E11D48', '#7C3AED',
  '#0EA5E9',
];

function PipelineEditorModal({ stages: initialStages, leads, onSave, onClose }) {
  const [editStages, setEditStages] = useState(
    initialStages.map((s, i) => ({ ...s, order: s.order ?? i }))
  );
  const [editingLabelId, setEditingLabelId] = useState(null);
  const [editingColorId, setEditingColorId] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [saving, setSaving] = useState(false);

  // Track changes
  useEffect(() => {
    const changed = JSON.stringify(editStages) !== JSON.stringify(initialStages.map((s, i) => ({ ...s, order: s.order ?? i })));
    setHasChanges(changed);
  }, [editStages, initialStages]);

  // Count leads per stage
  const leadsInStage = (stageId) => leads.filter(l => l.stage === stageId).length;

  // ─── HANDLERS ───
  const updateLabel = (id, label) => {
    setEditStages(prev => prev.map(s => s.id === id ? { ...s, label } : s));
  };

  const updateColor = (id, color) => {
    setEditStages(prev => prev.map(s => s.id === id ? { ...s, color } : s));
    setEditingColorId(null);
  };

  const moveStage = (index, direction) => {
    const newStages = [...editStages];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newStages.length) return;
    [newStages[index], newStages[targetIndex]] = [newStages[targetIndex], newStages[index]];
    setEditStages(newStages.map((s, i) => ({ ...s, order: i })));
  };

  const addStage = () => {
    const newId = `stage_${Date.now()}`;
    setEditStages(prev => [
      ...prev,
      {
        id: newId,
        label: 'Nuovo Stage',
        color: PRESET_COLORS[prev.length % PRESET_COLORS.length],
        order: prev.length,
      },
    ]);
    setEditingLabelId(newId);
  };

  const removeStage = (id) => {
    const count = leadsInStage(id);
    if (count > 0 && confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setEditStages(prev => prev.filter(s => s.id !== id).map((s, i) => ({ ...s, order: i })));
    setConfirmDeleteId(null);
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(editStages);
    setSaving(false);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />

      {/* Modal */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
          style={{ animation: 'modalIn 0.25s ease-out' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-gray-500" />
                Modifica Pipeline
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Rinomina, riordina, cambia colore o aggiungi nuovi stage</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Stage List */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
            {editStages.map((stage, index) => {
              const count = leadsInStage(stage.id);
              const isConfirmDelete = confirmDeleteId === stage.id;

              return (
                <div
                  key={stage.id}
                  className={`group flex items-center gap-2 p-3 rounded-xl border transition-all ${
                    isConfirmDelete
                      ? 'border-red-300 bg-red-50'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  {/* Order Arrows */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button
                      onClick={() => moveStage(index, -1)}
                      disabled={index === 0}
                      className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition"
                    >
                      <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                    <button
                      onClick={() => moveStage(index, 1)}
                      disabled={index === editStages.length - 1}
                      className="p-0.5 rounded hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition"
                    >
                      <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                    </button>
                  </div>

                  {/* Color Dot / Picker */}
                  <div className="relative flex-shrink-0">
                    <button
                      onClick={() => setEditingColorId(editingColorId === stage.id ? null : stage.id)}
                      className="w-7 h-7 rounded-full border-2 border-white shadow-md transition-transform hover:scale-110"
                      style={{ backgroundColor: stage.color }}
                      title="Cambia colore"
                    />
                    {editingColorId === stage.id && (
                      <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-10 w-48">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2 block">Scegli colore</span>
                        <div className="grid grid-cols-8 gap-1.5">
                          {PRESET_COLORS.map(c => (
                            <button
                              key={c}
                              onClick={() => updateColor(stage.id, c)}
                              className={`w-5 h-5 rounded-full transition-transform hover:scale-125 ${
                                stage.color === c ? 'ring-2 ring-offset-1 ring-gray-800 scale-110' : ''
                              }`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                        {/* Custom color */}
                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                          <input
                            type="color"
                            value={stage.color}
                            onChange={e => updateColor(stage.id, e.target.value)}
                            className="w-6 h-6 rounded border-0 cursor-pointer"
                          />
                          <span className="text-[10px] text-gray-400">Personalizzato</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Color Bar Preview */}
                  <div
                    className="w-1 h-8 rounded-full flex-shrink-0"
                    style={{ backgroundColor: stage.color }}
                  />

                  {/* Label */}
                  <div className="flex-1 min-w-0">
                    {editingLabelId === stage.id ? (
                      <input
                        autoFocus
                        type="text"
                        value={stage.label}
                        onChange={e => updateLabel(stage.id, e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') setEditingLabelId(null);
                          if (e.key === 'Escape') setEditingLabelId(null);
                        }}
                        onBlur={() => setEditingLabelId(null)}
                        className="w-full text-sm font-bold px-2 py-1 border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-200"
                      />
                    ) : (
                      <button
                        onClick={() => setEditingLabelId(stage.id)}
                        className="flex items-center gap-1.5 text-sm font-bold text-gray-800 hover:text-emerald-700 transition group/label"
                      >
                        {stage.label}
                        <Edit3 className="w-3 h-3 text-gray-300 group-hover/label:text-emerald-500 transition" />
                      </button>
                    )}
                    {count > 0 && (
                      <span className="text-[10px] text-gray-400 mt-0.5 block">
                        {count} lead{count !== 1 ? 's' : ''} in questo stage
                      </span>
                    )}
                  </div>

                  {/* Order number badge */}
                  <span className="text-[10px] font-mono text-gray-300 bg-gray-50 px-1.5 py-0.5 rounded flex-shrink-0">
                    #{index + 1}
                  </span>

                  {/* Delete */}
                  {isConfirmDelete ? (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className="text-[10px] text-red-600 font-semibold whitespace-nowrap">
                        {count} lead! Sicuro?
                      </span>
                      <button
                        onClick={() => removeStage(stage.id)}
                        className="text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 px-2 py-1 rounded-lg transition"
                      >
                        Elimina
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-[10px] font-bold text-gray-500 hover:text-gray-700 px-1.5 py-1 rounded-lg transition"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => removeStage(stage.id)}
                      disabled={editStages.length <= 1}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 disabled:opacity-20 disabled:cursor-not-allowed transition flex-shrink-0"
                      title="Elimina stage"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}

            {/* Add Stage Button */}
            <button
              onClick={addStage}
              className="w-full py-3 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm font-semibold hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50/50 transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Aggiungi Stage
            </button>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/60">
            <span className="text-xs text-gray-400">
              {editStages.length} stage{editStages.length !== 1 ? 's' : ''}
              {hasChanges && <span className="text-amber-600 font-semibold ml-2">• Modifiche non salvate</span>}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs font-medium"
                onClick={onClose}
              >
                Annulla
              </Button>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                onClick={handleSave}
                disabled={!hasChanges || saving || editStages.length === 0}
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Salva Pipeline
              </Button>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.95) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </>
  );
}

// ═══════════════════════════════════════════════════
// CONTACT PICKER MODAL
// ═══════════════════════════════════════════════════
function ContactPickerModal({ contacts, leads, loading, stageName, onSelect, onClose }) {
  const [search, setSearch] = useState('');
  const searchRef = useRef(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // IDs of contacts already in any lead (to show "già in pipeline" badge)
  const contactIdsInPipeline = new Set(
    leads.filter(l => l.contactId).map(l => l.contactId)
  );
  // Also match by phone number for leads created manually
  const phonesInPipeline = new Set(
    leads.filter(l => l.contactPhone).map(l => l.contactPhone.replace(/\s/g, ''))
  );

  const isAlreadyInPipeline = (contact) => {
    if (contactIdsInPipeline.has(contact.id)) return true;
    if (contact.phone && phonesInPipeline.has(contact.phone.replace(/\s/g, ''))) return true;
    return false;
  };

  const filtered = contacts.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      c.firstName?.toLowerCase().includes(q) ||
      c.lastName?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.shop?.toLowerCase().includes(q)
    );
  });

  // Sort: non-pipeline contacts first, then alphabetically
  const sorted = [...filtered].sort((a, b) => {
    const aIn = isAlreadyInPipeline(a) ? 1 : 0;
    const bIn = isAlreadyInPipeline(b) ? 1 : 0;
    if (aIn !== bIn) return aIn - bIn;
    const aName = `${a.firstName || ''} ${a.lastName || ''}`.trim().toLowerCase();
    const bName = `${b.firstName || ''} ${b.lastName || ''}`.trim().toLowerCase();
    return aName.localeCompare(bName);
  });

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
          style={{ animation: 'modalIn 0.25s ease-out' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-500" />
                Aggiungi Contatto
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Seleziona un contatto da aggiungere a <span className="font-semibold text-gray-600">{stageName}</span>
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Search */}
          <div className="px-5 py-3 border-b border-gray-50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Cerca per nome, telefono, email..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-blue-400 focus:outline-none transition"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-gray-400 hover:text-gray-600" />
                </button>
              )}
            </div>
          </div>

          {/* Contact List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin w-6 h-6 text-gray-300" />
              </div>
            ) : sorted.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">
                  {search ? 'Nessun contatto trovato' : 'Nessun contatto disponibile'}
                </p>
                <p className="text-xs mt-1">
                  {search ? 'Prova con un altro termine di ricerca' : 'Aggiungi contatti dalla sezione Contatti'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {sorted.map((contact) => {
                  const inPipeline = isAlreadyInPipeline(contact);
                  const fullName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();

                  return (
                    <button
                      key={contact.id}
                      onClick={() => onSelect(contact)}
                      className={`w-full px-5 py-3 flex items-center gap-3 text-left transition-all hover:bg-blue-50/60 group ${
                        inPipeline ? 'opacity-60' : ''
                      }`}
                    >
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-100 to-emerald-100 flex items-center justify-center flex-shrink-0 text-sm font-bold text-blue-700 shadow-sm">
                        {(contact.firstName?.[0] || contact.phone?.[0] || '?').toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-gray-900 truncate">
                            {fullName || contact.phone || 'Senza nome'}
                          </span>
                          {inPipeline && (
                            <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full flex-shrink-0">
                              Già in pipeline
                            </span>
                          )}
                          {contact.source && contact.source !== 'manual' && (
                            <span className="text-[9px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full flex-shrink-0">
                              {contact.source}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                          {contact.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {contact.phone}
                            </span>
                          )}
                          {contact.email && (
                            <span className="flex items-center gap-1 truncate">
                              <Mail className="w-3 h-3" /> {contact.email}
                            </span>
                          )}
                        </div>
                        {/* Categories/Tags */}
                        {(contact.categories?.length > 0 || contact.tags?.length > 0) && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {[...(contact.categories || []), ...(contact.tags || [])].slice(0, 4).map((t, i) => (
                              <span key={i} className="text-[9px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Add arrow */}
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 flex-shrink-0 transition" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/60">
            <span className="text-xs text-gray-400">
              {contacts.length} contatt{contacts.length !== 1 ? 'i' : 'o'} totali
              {search && ` · ${sorted.length} risultat${sorted.length !== 1 ? 'i' : 'o'}`}
            </span>
            <Button variant="outline" size="sm" className="text-xs font-medium" onClick={onClose}>
              Chiudi
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════
// TEMPLATE SEND MODAL
// ═══════════════════════════════════════════════════
function TemplateSendModal({ userUid, recipientPhone, recipientName, onClose }) {
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sending, setSending] = useState(null); // template name being sent
  const [sentResult, setSentResult] = useState(null); // { success, error, templateName }
  const [paramValues, setParamValues] = useState({}); // { templateName: { '1': 'val', '2': 'val' } }
  const [selectedTemplate, setSelectedTemplate] = useState(null); // for parameter editing
  const searchRef = useRef(null);

  // Load approved templates
  useEffect(() => {
    if (!userUid) return;
    const loadTemplates = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/list-templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_uid: userUid }),
        });
        const data = await res.json();
        if (Array.isArray(data)) {
          // Only show APPROVED templates (non-sample)
          setTemplates(data.filter(t => t.status === 'APPROVED' && !t.name.startsWith('sample_')));
        }
      } catch (e) {
        console.error('Errore caricamento templates:', e);
      } finally {
        setLoading(false);
      }
    };
    loadTemplates();
  }, [userUid]);

  useEffect(() => {
    if (!loading) searchRef.current?.focus();
  }, [loading]);

  // Extract body text and parameters from template
  const getTemplateBody = (tpl) => {
    const bodyComp = tpl.components?.find(c => c.type === 'BODY');
    return bodyComp?.text || '';
  };

  const getTemplateHeader = (tpl) => {
    const headerComp = tpl.components?.find(c => c.type === 'HEADER');
    return headerComp || null;
  };

  // Count positional parameters {{1}}, {{2}}, etc.
  const getParamCount = (tpl) => {
    const body = getTemplateBody(tpl);
    const matches = body.match(/\{\{(\d+)\}\}/g);
    if (!matches) return 0;
    const nums = matches.map(m => parseInt(m.replace(/[{}]/g, '')));
    return Math.max(...nums);
  };

  // Preview body with params filled in
  const getPreviewBody = (tpl) => {
    let body = getTemplateBody(tpl);
    const params = paramValues[tpl.name] || {};
    // Replace {{1}}, {{2}} etc with values or placeholder
    body = body.replace(/\{\{(\d+)\}\}/g, (match, num) => {
      return params[num] || `[Parametro ${num}]`;
    });
    return body;
  };

  // Send template
  const handleSend = async (tpl) => {
    setSending(tpl.name);
    setSentResult(null);

    try {
      // Build components array for parameters
      const paramCount = getParamCount(tpl);
      const components = [];

      if (paramCount > 0) {
        const params = paramValues[tpl.name] || {};
        const parameters = [];
        for (let i = 1; i <= paramCount; i++) {
          parameters.push({
            type: 'text',
            text: params[String(i)] || '',
          });
        }
        components.push({
          type: 'body',
          parameters,
        });
      }

      // Check if header has media
      const header = getTemplateHeader(tpl);
      if (header && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(header.format)) {
        // Header media requires a parameter - for now we skip it
        // You can extend this with a file upload per-send
      }

      const res = await fetch('/api/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientPhone,
          template_name: tpl.name,
          language: tpl.language,
          components: components.length > 0 ? components : undefined,
          user_uid: userUid,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSentResult({ success: true, templateName: tpl.name });
        // Auto close after 2s
        setTimeout(() => onClose(), 2000);
      } else {
        const errMsg = data.error?.message || data.error?.error_data?.details || data.detail || JSON.stringify(data.error);
        setSentResult({ success: false, templateName: tpl.name, error: errMsg });
      }
    } catch (e) {
      setSentResult({ success: false, templateName: tpl.name, error: e.message });
    } finally {
      setSending(null);
    }
  };

  // Filter templates
  const filtered = templates.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return t.name?.toLowerCase().includes(q) || getTemplateBody(t).toLowerCase().includes(q);
  });

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-[60]" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
          style={{ animation: 'modalIn 0.25s ease-out' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
                <Send className="w-5 h-5 text-emerald-500" />
                Invia Template WhatsApp
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                A: <span className="font-semibold text-gray-600">{recipientName}</span>
                <span className="text-gray-300 mx-1">·</span>
                <span className="font-mono text-gray-500">{recipientPhone}</span>
              </p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Success Banner */}
          {sentResult?.success && (
            <div className="px-5 py-3 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2">
              <Check className="w-5 h-5 text-emerald-600" />
              <span className="text-sm font-semibold text-emerald-700">
                Template "{sentResult.templateName}" inviato con successo!
              </span>
            </div>
          )}

          {/* Error Banner */}
          {sentResult && !sentResult.success && (
            <div className="px-5 py-3 bg-red-50 border-b border-red-200">
              <div className="flex items-center gap-2">
                <X className="w-4 h-4 text-red-500" />
                <span className="text-sm font-semibold text-red-700">Errore invio</span>
              </div>
              <p className="text-xs text-red-600 mt-1 break-all">{sentResult.error}</p>
            </div>
          )}

          {/* Search */}
          <div className="px-5 py-3 border-b border-gray-50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Cerca template..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:border-emerald-400 focus:outline-none transition"
              />
            </div>
          </div>

          {/* Template List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin w-6 h-6 text-gray-300" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm font-medium">
                  {search ? 'Nessun template trovato' : 'Nessun template approvato disponibile'}
                </p>
                <p className="text-xs mt-1">
                  {search ? 'Prova con un altro termine' : 'Crea e fai approvare un template dalla sezione Template'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {filtered.map((tpl) => {
                  const paramCount = getParamCount(tpl);
                  const header = getTemplateHeader(tpl);
                  const isSelected = selectedTemplate === tpl.name;
                  const isSending = sending === tpl.name;

                  return (
                    <div key={tpl.id || tpl.name} className="px-5 py-3">
                      {/* Template card */}
                      <div
                        className={`border rounded-xl p-3 transition-all cursor-pointer ${
                          isSelected
                            ? 'border-emerald-300 bg-emerald-50/50 shadow-sm'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                        }`}
                        onClick={() => setSelectedTemplate(isSelected ? null : tpl.name)}
                      >
                        {/* Top row */}
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-gray-900 capitalize">{tpl.name.replace(/_/g, ' ')}</span>
                            <span className="text-[10px] font-medium bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                              {tpl.language}
                            </span>
                            <span className="text-[10px] font-medium bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full capitalize">
                              {tpl.category?.toLowerCase()}
                            </span>
                          </div>
                          {header && header.format && header.format !== 'TEXT' && (
                            <span className="text-[9px] font-semibold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                              📎 {header.format}
                            </span>
                          )}
                        </div>

                        {/* Body preview */}
                        <div className="text-xs text-gray-600 bg-gray-50 rounded-lg p-2 font-mono leading-relaxed whitespace-pre-wrap">
                          {isSelected && paramCount > 0 ? getPreviewBody(tpl) : getTemplateBody(tpl) || '— Nessun contenuto —'}
                        </div>

                        {/* Parameter inputs (expanded when selected) */}
                        {isSelected && paramCount > 0 && (
                          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                              Parametri ({paramCount})
                            </span>
                            {Array.from({ length: paramCount }, (_, i) => i + 1).map(num => {
                              const defaultVal = num === 1 ? (recipientName?.split(' ')[0] || '') :
                                                 num === 2 ? (recipientName?.split(' ').slice(1).join(' ') || '') :
                                                 num === 3 ? recipientPhone :
                                                 '';
                              // Auto-fill on first open
                              if (!paramValues[tpl.name]?.[String(num)] && defaultVal) {
                                setTimeout(() => {
                                  setParamValues(prev => ({
                                    ...prev,
                                    [tpl.name]: {
                                      ...(prev[tpl.name] || {}),
                                      [String(num)]: defaultVal,
                                    }
                                  }));
                                }, 0);
                              }

                              return (
                                <div key={num} className="flex items-center gap-2">
                                  <span className="text-xs text-gray-500 font-mono w-12 flex-shrink-0">{`{{${num}}}`}</span>
                                  <input
                                    type="text"
                                    placeholder={`Parametro ${num}`}
                                    value={paramValues[tpl.name]?.[String(num)] || ''}
                                    onChange={e => {
                                      setParamValues(prev => ({
                                        ...prev,
                                        [tpl.name]: {
                                          ...(prev[tpl.name] || {}),
                                          [String(num)]: e.target.value,
                                        }
                                      }));
                                    }}
                                    className="flex-1 text-xs px-2 py-1.5 border border-gray-200 rounded-lg focus:border-emerald-400 focus:outline-none bg-white"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Send button */}
                        {isSelected && (
                          <div className="mt-3 flex items-center justify-end gap-2">
                            <Button
                              size="sm"
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSend(tpl);
                              }}
                              disabled={isSending}
                            >
                              {isSending ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Send className="w-3.5 h-3.5" />
                              )}
                              {isSending ? 'Invio...' : 'Invia a ' + (recipientName?.split(' ')[0] || recipientPhone)}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/60">
            <span className="text-xs text-gray-400">
              {templates.length} template approvati
            </span>
            <Button variant="outline" size="sm" className="text-xs font-medium" onClick={onClose}>
              Chiudi
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}