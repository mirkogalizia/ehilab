'use client';

import { useEffect, useState, useRef } from 'react';
import { db, storage } from '@/lib/firebase';
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, orderBy, query, serverTimestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/lib/useAuth';
import { Button } from '@/components/ui/button';
import {
  Loader2, Plus, X, Search, Edit3, Trash2, Save,
  ShoppingBag, Image as ImageIcon, Package, Tag,
  Euro, MoreHorizontal, ChevronDown, ChevronUp,
  Copy, Check, Filter, LayoutGrid, List, Upload,
} from 'lucide-react';

// ─── FORMAT CURRENCY ───
function formatCurrency(value) {
  if (!value && value !== 0) return '€0,00';
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);
}

// ═══════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════
export default function ProdottiPage() {
  const { user, loading: authLoading } = useAuth();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);

  // ─── FIRESTORE: REALTIME PRODUCTS LISTENER ───
  useEffect(() => {
    if (!user?.uid) return;
    setLoading(true);
    const q = query(
      collection(db, 'users', user.uid, 'products'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setProducts(arr);
      setLoading(false);
    }, (err) => {
      console.error('Errore products listener:', err);
      setLoading(false);
    });
    return () => unsub();
  }, [user]);

  // ─── DELETE PRODUCT ───
  const handleDelete = async (productId) => {
    if (!confirm('Eliminare questo prodotto?')) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'products', productId));
      if (selectedProduct?.id === productId) setSelectedProduct(null);
    } catch (e) {
      console.error('Errore eliminazione prodotto:', e);
    }
  };

  // ─── DUPLICATE PRODUCT ───
  const handleDuplicate = async (product) => {
    try {
      const { id, createdAt, updatedAt, ...data } = product;
      await addDoc(collection(db, 'users', user.uid, 'products'), {
        ...data,
        name: `${data.name} (copia)`,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('Errore duplicazione prodotto:', e);
    }
  };

  // ─── CATEGORIES (from products) ───
  const allCategories = [...new Set(products.flatMap(p => p.categories || []).filter(Boolean))].sort();

  // ─── FILTER ───
  const filtered = products.filter(p => {
    const q = searchQuery.toLowerCase();
    const matchSearch = !searchQuery || (
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.description?.toLowerCase().includes(q) ||
      p.categories?.some(c => c.toLowerCase().includes(q))
    );
    const matchCategory = !filterCategory || p.categories?.includes(filterCategory);
    return matchSearch && matchCategory;
  });

  // ─── STATS ───
  const totalProducts = products.length;
  const totalValue = products.reduce((sum, p) => sum + ((p.price || 0) * (p.stock ?? 1)), 0);

  // ─── AUTH GUARD ───
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
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-extrabold tracking-tight text-gray-900 flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-emerald-600" />
              PRODOTTI
            </h1>
            <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
              {totalProducts} prodott{totalProducts !== 1 ? 'i' : 'o'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Cerca prodotti..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:bg-white focus:border-emerald-400 focus:outline-none transition w-48"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-gray-400" />
                </button>
              )}
            </div>

            {/* Category Filter */}
            {allCategories.length > 0 && (
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-gray-50 focus:border-emerald-400 focus:outline-none"
              >
                <option value="">Tutte le categorie</option>
                {allCategories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}

            {/* View Mode */}
            <div className="flex border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 transition ${viewMode === 'grid' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 transition ${viewMode === 'list' ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>

            {/* Add Product */}
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm"
              onClick={() => { setEditingProduct(null); setShowForm(true); }}
            >
              <Plus className="w-4 h-4" />
              Nuovo Prodotto
            </Button>
          </div>
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin w-8 h-8 text-gray-300" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p className="text-gray-500 font-medium">
              {searchQuery || filterCategory ? 'Nessun prodotto trovato' : 'Nessun prodotto nel catalogo'}
            </p>
            <p className="text-gray-400 text-sm mt-1">
              {!searchQuery && !filterCategory && 'Clicca "Nuovo Prodotto" per iniziare'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* ── GRID VIEW ── */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                onEdit={() => { setEditingProduct(product); setShowForm(true); }}
                onDelete={() => handleDelete(product.id)}
                onDuplicate={() => handleDuplicate(product)}
                onClick={() => setSelectedProduct(product)}
              />
            ))}
          </div>
        ) : (
          /* ── LIST VIEW ── */
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-12 gap-3 px-4 py-2 border-b border-gray-100 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              <div className="col-span-1"></div>
              <div className="col-span-3">Prodotto</div>
              <div className="col-span-2">SKU</div>
              <div className="col-span-2">Categoria</div>
              <div className="col-span-1 text-right">Prezzo</div>
              <div className="col-span-1 text-right">IVA</div>
              <div className="col-span-1 text-right">Qtà</div>
              <div className="col-span-1"></div>
            </div>
            {filtered.map(product => (
              <div
                key={product.id}
                onClick={() => setSelectedProduct(product)}
                className="grid grid-cols-12 gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50/80 cursor-pointer transition items-center group"
              >
                {/* Immagine */}
                <div className="col-span-1">
                  {product.imageUrl ? (
                    <img src={product.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-200" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Package className="w-4 h-4 text-gray-300" />
                    </div>
                  )}
                </div>
                {/* Nome */}
                <div className="col-span-3">
                  <div className="text-sm font-bold text-gray-900 truncate">{product.name}</div>
                  {product.description && (
                    <div className="text-[10px] text-gray-400 truncate">{product.description}</div>
                  )}
                </div>
                {/* SKU */}
                <div className="col-span-2 text-xs font-mono text-gray-500">{product.sku || '-'}</div>
                {/* Categoria */}
                <div className="col-span-2">
                  <div className="flex flex-wrap gap-1">
                    {(product.categories || []).slice(0, 2).map((c, i) => (
                      <span key={i} className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{c}</span>
                    ))}
                  </div>
                </div>
                {/* Prezzo */}
                <div className="col-span-1 text-right text-sm font-bold text-gray-800">
                  {formatCurrency(product.price)}
                </div>
                {/* IVA */}
                <div className="col-span-1 text-right text-xs text-gray-500">
                  {product.taxRate || 22}%
                </div>
                {/* Stock */}
                <div className="col-span-1 text-right text-xs text-gray-500">
                  {product.stock ?? '-'}
                </div>
                {/* Azioni */}
                <div className="col-span-1 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingProduct(product); setShowForm(true); }}
                    className="p-1 hover:bg-gray-200 rounded"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-gray-500" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(product.id); }}
                    className="p-1 hover:bg-red-50 rounded"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ═══ PRODUCT FORM MODAL ═══ */}
      {showForm && (
        <ProductFormModal
          product={editingProduct}
          userUid={user.uid}
          onClose={() => { setShowForm(false); setEditingProduct(null); }}
          onSaved={() => { setShowForm(false); setEditingProduct(null); }}
        />
      )}

      {/* ═══ PRODUCT DETAIL PANEL ═══ */}
      {selectedProduct && (
        <ProductDetailPanel
          product={products.find(p => p.id === selectedProduct.id) || selectedProduct}
          onClose={() => setSelectedProduct(null)}
          onEdit={() => { setEditingProduct(selectedProduct); setShowForm(true); setSelectedProduct(null); }}
          onDelete={() => { handleDelete(selectedProduct.id); setSelectedProduct(null); }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// PRODUCT CARD (Grid)
// ═══════════════════════════════════════════════════
function ProductCard({ product, onEdit, onDelete, onDuplicate, onClick }) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-gray-200 hover:border-gray-300 shadow-sm hover:shadow-md transition-all cursor-pointer group overflow-hidden"
    >
      {/* Immagine */}
      <div className="relative h-40 bg-gray-50 overflow-hidden">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="w-10 h-10 text-gray-200" />
          </div>
        )}
        {/* Prezzo badge */}
        <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm rounded-lg px-2 py-1 shadow-sm">
          <span className="text-sm font-extrabold text-gray-900">{formatCurrency(product.price)}</span>
        </div>
        {/* Menu */}
        <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition">
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
              className="bg-white/90 backdrop-blur-sm rounded-lg p-1.5 shadow-sm hover:bg-white"
            >
              <MoreHorizontal className="w-4 h-4 text-gray-600" />
            </button>
            {showMenu && (
              <div className="absolute top-full left-0 mt-1 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-10 min-w-[120px]">
                <button
                  onClick={(e) => { e.stopPropagation(); setShowMenu(false); onEdit(); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Edit3 className="w-3 h-3" /> Modifica
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDuplicate(); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                >
                  <Copy className="w-3 h-3" /> Duplica
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDelete(); }}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <Trash2 className="w-3 h-3" /> Elimina
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <div className="text-sm font-bold text-gray-900 truncate">{product.name}</div>
        {product.description && (
          <div className="text-[11px] text-gray-400 mt-0.5 line-clamp-2">{product.description}</div>
        )}
        <div className="flex items-center justify-between mt-2">
          <div className="flex flex-wrap gap-1">
            {(product.categories || []).slice(0, 2).map((c, i) => (
              <span key={i} className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">{c}</span>
            ))}
          </div>
          {product.sku && (
            <span className="text-[9px] font-mono text-gray-400">{product.sku}</span>
          )}
        </div>
        {/* IVA + Stock */}
        <div className="flex items-center justify-between mt-1.5 text-[10px] text-gray-400">
          <span>IVA {product.taxRate || 22}%</span>
          {product.stock != null && <span>Qtà: {product.stock}</span>}
          {product.unit && <span>{product.unit}</span>}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// PRODUCT FORM MODAL (Create / Edit)
// ═══════════════════════════════════════════════════
function ProductFormModal({ product, userUid, onClose, onSaved }) {
  const isEdit = !!product;
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const [form, setForm] = useState({
    name: product?.name || '',
    description: product?.description || '',
    sku: product?.sku || '',
    price: product?.price || '',
    taxRate: product?.taxRate || 22,
    unit: product?.unit || 'pz',
    stock: product?.stock ?? '',
    categories: product?.categories?.join(', ') || '',
    imageUrl: product?.imageUrl || '',
    notes: product?.notes || '',
  });

  const updateField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  // Upload immagine
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const storageRef = ref(storage, `users/${userUid}/products/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      updateField('imageUrl', url);
    } catch (err) {
      console.error('Errore upload immagine:', err);
      alert('Errore nel caricamento dell\'immagine');
    } finally {
      setUploading(false);
    }
  };

  // Salva
  const handleSave = async () => {
    if (!form.name.trim()) return alert('Il nome è obbligatorio');
    setSaving(true);
    try {
      const data = {
        name: form.name.trim(),
        description: form.description.trim(),
        sku: form.sku.trim(),
        price: parseFloat(form.price) || 0,
        taxRate: parseInt(form.taxRate) || 22,
        unit: form.unit.trim() || 'pz',
        stock: form.stock !== '' ? parseInt(form.stock) : null,
        categories: form.categories ? form.categories.split(',').map(c => c.trim()).filter(Boolean) : [],
        imageUrl: form.imageUrl,
        notes: form.notes.trim(),
        updatedAt: serverTimestamp(),
      };

      if (isEdit) {
        await updateDoc(doc(db, 'users', userUid, 'products', product.id), data);
      } else {
        data.createdAt = serverTimestamp();
        await addDoc(collection(db, 'users', userUid, 'products'), data);
      }
      onSaved();
    } catch (e) {
      console.error('Errore salvataggio prodotto:', e);
      alert('Errore nel salvataggio');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
          style={{ animation: 'modalIn 0.25s ease-out' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-emerald-600" />
              {isEdit ? 'Modifica Prodotto' : 'Nuovo Prodotto'}
            </h2>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Form */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Immagine */}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1.5 block">Immagine</label>
              <div className="flex items-center gap-3">
                {form.imageUrl ? (
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200">
                    <img src={form.imageUrl} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => updateField('imageUrl', '')}
                      className="absolute top-1 right-1 bg-white/90 rounded-full p-0.5 shadow"
                    >
                      <X className="w-3 h-3 text-gray-500" />
                    </button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileRef.current?.click()}
                    className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-300 hover:bg-emerald-50/50 transition"
                  >
                    {uploading ? (
                      <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                    ) : (
                      <>
                        <Upload className="w-5 h-5 text-gray-300" />
                        <span className="text-[9px] text-gray-400 mt-1">Carica</span>
                      </>
                    )}
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                {form.imageUrl && (
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    Cambia immagine
                  </button>
                )}
              </div>
            </div>

            {/* Nome */}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Nome *</label>
              <input
                type="text"
                value={form.name}
                onChange={e => updateField('name', e.target.value)}
                placeholder="es. Consulenza SEO base"
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:border-emerald-400 focus:outline-none"
              />
            </div>

            {/* Descrizione */}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Descrizione</label>
              <textarea
                value={form.description}
                onChange={e => updateField('description', e.target.value)}
                placeholder="Descrizione del prodotto o servizio..."
                rows={3}
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:border-emerald-400 focus:outline-none resize-none"
              />
            </div>

            {/* Prezzo + IVA + Unità (row) */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Prezzo (€)</label>
                <input
                  type="number"
                  step="0.01"
                  value={form.price}
                  onChange={e => updateField('price', e.target.value)}
                  placeholder="0.00"
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:border-emerald-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">IVA %</label>
                <select
                  value={form.taxRate}
                  onChange={e => updateField('taxRate', e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:border-emerald-400 focus:outline-none"
                >
                  <option value={0}>Esente (0%)</option>
                  <option value={4}>4%</option>
                  <option value={5}>5%</option>
                  <option value={10}>10%</option>
                  <option value={22}>22%</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Unità</label>
                <select
                  value={form.unit}
                  onChange={e => updateField('unit', e.target.value)}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:border-emerald-400 focus:outline-none"
                >
                  <option value="pz">pz (pezzo)</option>
                  <option value="h">h (ora)</option>
                  <option value="g">g (giorno)</option>
                  <option value="mese">mese</option>
                  <option value="kg">kg</option>
                  <option value="m">m (metro)</option>
                  <option value="mq">mq</option>
                  <option value="lt">lt</option>
                  <option value="servizio">servizio</option>
                  <option value="pacchetto">pacchetto</option>
                </select>
              </div>
            </div>

            {/* SKU + Stock */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">SKU / Codice</label>
                <input
                  type="text"
                  value={form.sku}
                  onChange={e => updateField('sku', e.target.value)}
                  placeholder="es. SEO-001"
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:border-emerald-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Quantità / Stock</label>
                <input
                  type="number"
                  value={form.stock}
                  onChange={e => updateField('stock', e.target.value)}
                  placeholder="Illimitato"
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:border-emerald-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Categorie */}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Categorie</label>
              <input
                type="text"
                value={form.categories}
                onChange={e => updateField('categories', e.target.value)}
                placeholder="Separa con virgola: Marketing, SEO, Web"
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:border-emerald-400 focus:outline-none"
              />
            </div>

            {/* Note */}
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Note interne</label>
              <textarea
                value={form.notes}
                onChange={e => updateField('notes', e.target.value)}
                placeholder="Note visibili solo a te..."
                rows={2}
                className="w-full text-sm px-3 py-2 border border-gray-200 rounded-xl focus:border-emerald-400 focus:outline-none resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/60">
            <Button variant="outline" size="sm" className="text-xs font-medium" onClick={onClose}>
              Annulla
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
              onClick={handleSave}
              disabled={saving || !form.name.trim()}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {isEdit ? 'Salva Modifiche' : 'Crea Prodotto'}
            </Button>
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
// PRODUCT DETAIL PANEL
// ═══════════════════════════════════════════════════
function ProductDetailPanel({ product, onClose, onEdit, onDelete }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div
        className="fixed right-0 top-0 h-full w-full max-w-[420px] bg-white shadow-2xl z-50 flex flex-col overflow-hidden"
        style={{ animation: 'slideInRight 0.3s ease-out' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition">
            <X className="w-5 h-5 text-gray-500" />
          </button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={onEdit}>
              <Edit3 className="w-3.5 h-3.5 mr-1" /> Modifica
            </Button>
            <button onClick={onDelete} className="p-1.5 hover:bg-red-50 rounded-lg transition text-gray-400 hover:text-red-500">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Immagine */}
          {product.imageUrl && (
            <div className="w-full h-56 bg-gray-50">
              <img src={product.imageUrl} alt={product.name} className="w-full h-full object-cover" />
            </div>
          )}

          <div className="px-5 py-4">
            <h2 className="text-xl font-extrabold text-gray-900">{product.name}</h2>
            {product.sku && (
              <span className="text-xs font-mono text-gray-400 mt-0.5 block">SKU: {product.sku}</span>
            )}

            {/* Prezzo grande */}
            <div className="mt-3 bg-emerald-50 rounded-xl px-4 py-3 border border-emerald-200">
              <div className="text-2xl font-extrabold text-emerald-700">{formatCurrency(product.price)}</div>
              <div className="text-xs text-emerald-600 mt-0.5">
                + IVA {product.taxRate || 22}% = {formatCurrency((product.price || 0) * (1 + (product.taxRate || 22) / 100))}
                <span className="text-gray-400 ml-2">/ {product.unit || 'pz'}</span>
              </div>
            </div>

            {/* Descrizione */}
            {product.description && (
              <div className="mt-4">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Descrizione</span>
                <p className="text-sm text-gray-700 mt-1 leading-relaxed">{product.description}</p>
              </div>
            )}

            {/* Dettagli */}
            <div className="mt-4 space-y-2">
              {product.stock != null && (
                <div className="flex justify-between py-1.5 border-b border-gray-50">
                  <span className="text-xs text-gray-500">Quantità disponibile</span>
                  <span className="text-xs font-bold text-gray-800">{product.stock} {product.unit || 'pz'}</span>
                </div>
              )}
              {product.categories?.length > 0 && (
                <div className="flex justify-between py-1.5 border-b border-gray-50 items-start">
                  <span className="text-xs text-gray-500">Categorie</span>
                  <div className="flex flex-wrap gap-1 justify-end">
                    {product.categories.map((c, i) => (
                      <span key={i} className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Note */}
            {product.notes && (
              <div className="mt-4 bg-amber-50 rounded-xl px-4 py-3 border border-amber-200">
                <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Note interne</span>
                <p className="text-xs text-amber-800 mt-1">{product.notes}</p>
              </div>
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
