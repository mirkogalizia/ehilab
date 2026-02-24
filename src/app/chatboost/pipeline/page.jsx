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

const getStageStyle = (stageId) => STAGE_COLORS[stageId] || STAGE_COLORS.contacted;

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
            const style = getStageStyle(stage.id);
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
                  {/* Quick Add */}
                  {showNewLeadForm === stage.id ? (
                    <NewLeadCard
                      newLead={newLead}
                      setNewLead={setNewLead}
                      onAdd={() => handleAddLead(stage.id)}
                      onCancel={() => { setShowNewLeadForm(null); setNewLead({ name: '', sale: 0, contactName: '', contactPhone: '', contactEmail: '', company: '', companyAddress: '', tags: '' }); }}
                    />
                  ) : (
                    <button
                      onClick={() => setShowNewLeadForm(stage.id)}
                      className="w-full py-2 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm font-medium hover:border-emerald-300 hover:text-emerald-600 hover:bg-emerald-50/50 transition-all flex items-center justify-center gap-1"
                    >
                      <Plus className="w-4 h-4" /> Quick add
                    </button>
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
function LeadDetailPanel({ lead, stages, onClose, onMoveStage, onUpdateField, onDelete }) {
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [noteText, setNoteText] = useState('');
  const panelRef = useRef(null);

  const style = getStageStyle(lead.stage);

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
                        ? getStageStyle(s.id).bar
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
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${getStageStyle(entry.to).badge}`}>
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
          <div className="flex items-center gap-2">
            {lead.contactPhone && (
              <a
                href={`https://wa.me/${lead.contactPhone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-3 py-1.5 rounded-lg transition"
              >
                <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
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
