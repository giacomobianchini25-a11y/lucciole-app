import React, { useState, useEffect, useMemo, useRef } from 'react';
import { auth, db } from './firebaseConfig';
import { 
  signInWithEmailAndPassword, 
  onAuthStateChanged, 
  signOut 
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  getDocs,
  orderBy 
} from 'firebase/firestore';

// --- IMPORTAZIONE ICONE ---
import { 
  Wine, Utensils, Bed, Waves, Package, ChevronRight, AlertTriangle, 
  Clock, Power, Search, Plus, X, Truck, Calendar, Trash2, Pencil, Tag, 
  BarChart3, ArrowDownCircle, ArrowUpCircle, CookingPot
} from 'lucide-react';

// --- MAPPA ICONE ---
const ICON_MAP = {
  'wine': Wine, 'utensils': Utensils, 'bed': Bed, 'waves': Waves, 
  'package': Package, 'chevron-right': ChevronRight, 'alert-triangle': AlertTriangle, 
  'clock': Clock, 'power': Power, 'search': Search, 'plus': Plus, 'x': X, 
  'truck': Truck, 'calendar': Calendar, 'trash-2': Trash2, 'pencil': Pencil, 
  'tag': Tag, 'bar-chart': BarChart3, 'arrow-down': ArrowDownCircle, 'arrow-up': ArrowUpCircle,
  'cooking-pot': CookingPot
};

const Icon = ({ name, size = 20, className = "", strokeWidth = 2.5 }) => {
  const LucideIcon = ICON_MAP[name] || Package;
  return <LucideIcon size={size} className={className} strokeWidth={strokeWidth} />;
};

// --- COSTANTI ---
const CATEGORIES = {
  BAR: 'Bar',
  RISTORANTE: 'Ristorante',
  PIATTI: 'Piatti',
  BIANCHERIA: 'Biancheria e Prodotti',
  PISCINA: 'Piscina',
  ALTRO: 'Altro'
};

const UNITS = ['Pz', 'Kg', 'Lt', 'Pacchi', 'Porzioni'];

const CATEGORIES_META = {
  [CATEGORIES.BAR]: { icon: 'wine', color: 'bg-blue-700', text: 'text-blue-900', border: 'border-blue-300' },
  [CATEGORIES.RISTORANTE]: { icon: 'utensils', color: 'bg-orange-600', text: 'text-orange-900', border: 'border-orange-300' },
  [CATEGORIES.PIATTI]: { icon: 'cooking-pot', color: 'bg-rose-600', text: 'text-rose-900', border: 'border-rose-300' },
  [CATEGORIES.BIANCHERIA]: { icon: 'bed', color: 'bg-purple-700', text: 'text-purple-900', border: 'border-purple-300' },
  [CATEGORIES.PISCINA]: { icon: 'waves', color: 'bg-cyan-700', text: 'text-cyan-900', border: 'border-cyan-300' },
  [CATEGORIES.ALTRO]: { icon: 'package', color: 'bg-slate-700', text: 'text-slate-900', border: 'border-slate-300' }
};

// --- UI COMPONENTS ---
const Autocomplete = ({ value, onChange, suggestions, placeholder, className, label, required = true }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);
  const filtered = useMemo(() => {
    const v = (value || "").toLowerCase();
    if (!v) return [];
    return (suggestions || []).filter(s => (s || "").toLowerCase().includes(v) && (s || "").toLowerCase() !== v).slice(0, 5);
  }, [value, suggestions]);

  useEffect(() => {
    const close = (e) => { if (containerRef.current && !containerRef.current.contains(e.target)) setIsOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={containerRef} className="relative w-full space-y-1">
      {label && <label className="text-[11px] font-black uppercase text-slate-500 px-2 block">{label}</label>}
      <input type="text" value={value} onChange={(e) => { onChange(e.target.value); setIsOpen(true); }} onFocus={() => setIsOpen(true)} placeholder={placeholder} className={className} required={required} />
      {isOpen && filtered.length > 0 && (
        <ul className="absolute z-[300] w-full mt-2 bg-white border-4 border-gray-900 rounded-2xl overflow-hidden shadow-2xl animate-modal">
          {filtered.map((s, i) => (
            <li key={i} onClick={() => { onChange(s); setIsOpen(false); }} className="p-4 text-black font-black uppercase text-sm border-b-2 border-gray-100 hover:bg-yellow-300 cursor-pointer flex justify-between items-center transition-colors">
              {s} <Icon name="chevron-right" size={16} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// --- LOGGING ---
const logTransaction = async (itemName, category, quantityChange, userRole) => {
  try {
    await addDoc(collection(db, 'logs'), {
      itemName,
      category,
      quantityChange,
      userRole,
      date: new Date().toISOString()
    });
  } catch (e) {
    console.error("Errore salvataggio log", e);
  }
};

// --- APP CORE ---
export default function App() {
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState('');
  
  const [activeCategory, setActiveCategory] = useState('TUTTI');
  const [filterMode, setFilterMode] = useState('ALL'); 
  const [searchQuery, setSearchQuery] = useState('');
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [itemToEdit, setItemToEdit] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [isStatsOpen, setIsStatsOpen] = useState(false);

  const userRole = useMemo(() => {
    if (!user) return null;
    if (user.email === 'admin@lucciole.app') return 'admin';
    if (user.email === 'cuoco@lucciole.app') return 'cuoco';
    if (user.email === 'barista@lucciole.app') return 'barista';
    return null;
  }, [user]);

  const isCook = userRole === 'cuoco';
  const isBarista = userRole === 'barista';
  const isAdmin = userRole === 'admin';

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u?.email === 'cuoco@lucciole.app') setActiveCategory(CATEGORIES.RISTORANTE);
      if (u?.email === 'barista@lucciole.app') setActiveCategory(CATEGORIES.BAR);
    });

    const unsubDb = onSnapshot(collection(db, 'inventory'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(data);
    });

    return () => { unsubAuth(); unsubDb(); };
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    const u = e.target.username.value.trim().toLowerCase();
    const p = e.target.password.value;
    
    let email = '';
    if (u === 'admin') email = 'admin@lucciole.app';
    else if (u === 'cuoco') email = 'cuoco@lucciole.app';
    else if (u === 'barista') email = 'barista@lucciole.app';
    else { setLoginError('Utente non riconosciuto.'); return; }

    try {
      await signInWithEmailAndPassword(auth, email, p);
    } catch (err) {
      setLoginError('Accesso fallito. Verifica la password.');
    }
  };

  const handleLogout = () => signOut(auth);

  const handleSaveItem = async (formData, docId = null) => {
    try {
      if (docId) {
        const itemRef = doc(db, 'inventory', docId);
        await updateDoc(itemRef, {
          name: formData.name,
          category: formData.category,
          quantity: formData.quantity,
          minThreshold: formData.minThreshold,
          supplier: formData.supplier || "",
          subcategory: formData.subcategory || "",
          unit: formData.unit,
          expiryDate: formData.expiryDate
        });
        await logTransaction(formData.name, formData.category, 0, userRole + " (Edit)");
      } else {
        const existing = items.find(i => 
          (i.name || "").toLowerCase().trim() === (formData.name || "").toLowerCase().trim() && 
          (i.category || "") === (formData.category || "")
        );

        if (existing) {
          const itemRef = doc(db, 'inventory', existing.id);
          await updateDoc(itemRef, {
            quantity: (existing.quantity || 0) + formData.quantity,
            minThreshold: formData.minThreshold || existing.minThreshold,
            supplier: formData.supplier || existing.supplier || "",
            subcategory: formData.subcategory || existing.subcategory || ""
          });
          await logTransaction(existing.name, existing.category, formData.quantity, userRole);
        } else {
          await addDoc(collection(db, 'inventory'), formData);
          await logTransaction(formData.name, formData.category, formData.quantity, userRole);
        }
      }
      setIsAddModalOpen(false);
      setItemToEdit(null);
    } catch (err) {
      alert("Errore salvataggio: " + err.message);
    }
  };

  const updateQty = async (id, delta) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    try {
      const newQty = Math.max(0, parseFloat((item.quantity + delta).toFixed(2)));
      
      await updateDoc(doc(db, 'inventory', id), {
        quantity: newQty
      });
      await logTransaction(item.name, item.category, delta, userRole);
    } catch (err) { console.error(err); }
  };

  const checkExpiring = (dateStr) => {
    if (!dateStr) return false;
    try {
      const expiry = new Date(dateStr);
      const limit = new Date();
      limit.setDate(limit.getDate() + 10);
      return expiry <= limit;
    } catch (e) { return false; }
  };

  const filteredItems = useMemo(() => {
    let list = items || [];
    if (isCook) list = list.filter(i => (i.category || "") === CATEGORIES.RISTORANTE);
    else if (isBarista) list = list.filter(i => (i.category || "") === CATEGORIES.BAR);
    else if (activeCategory !== 'TUTTI') list = list.filter(i => (i.category || "") === activeCategory);

    if (filterMode === 'LOW_STOCK') list = list.filter(i => (i.quantity || 0) <= (i.minThreshold || 0));
    if (filterMode === 'EXPIRING') list = list.filter(i => checkExpiring(i.expiryDate));

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i => 
        (i.name || "").toLowerCase().includes(q) || 
        (i.supplier || "").toLowerCase().includes(q) ||
        (i.subcategory || "").toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [items, activeCategory, filterMode, searchQuery, isCook, isBarista]);

  const lowStockCount = useMemo(() => items.filter(i => (i.quantity || 0) <= (i.minThreshold || 0)).length, [items]);
  const expiringCount = useMemo(() => items.filter(i => checkExpiring(i.expiryDate)).length, [items]);

  const openNewItemModal = () => { setItemToEdit(null); setIsAddModalOpen(true); };
  const openEditModal = (item) => { setSelectedItem(null); setItemToEdit(item); setIsAddModalOpen(true); };

  if (loading) return <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white font-black italic">CARICAMENTO...</div>;

  if (!user) return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-900">
      <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-10 shadow-2xl space-y-8 animate-modal">
        <div className="text-center">
          <h1 className="text-4xl font-black uppercase italic tracking-tighter text-slate-900 leading-none">Lucciole</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-1">nella Nebbia</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-5">
          <label className="block">
              <span className="text-[10px] font-black uppercase text-slate-500 px-2 block mb-1">Nome Utente</span>
              <input name="username" required className="w-full border-4 border-slate-100 p-4 rounded-2xl font-black focus:border-slate-900 outline-none" placeholder="Nome utente" />
          </label>
          <label className="block">
              <span className="text-[10px] font-black uppercase text-slate-500 px-2 block mb-1">Password</span>
              <input name="password" type="password" required className="w-full border-4 border-slate-100 p-4 rounded-2xl font-black focus:border-slate-900 outline-none" placeholder="Password (min 6 char)" />
          </label>
          {loginError && <p className="text-red-600 text-[10px] font-black text-center bg-red-50 p-3 rounded-xl">{loginError}</p>}
          <button type="submit" className="w-full bg-slate-900 text-white p-5 rounded-2xl font-black text-xl hover:bg-black uppercase border-b-8 border-slate-950 shadow-xl active:scale-95 transition-all">Accedi</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pb-44">
      <header className="bg-slate-900 text-white p-8 flex justify-between items-center shadow-xl">
        <div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter text-yellow-400 leading-none">Lucciole</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Magazzino</p>
        </div>
        <div className="flex gap-2">
            {isAdmin && (
                <button onClick={() => setIsStatsOpen(true)} className="bg-white/10 text-yellow-400 p-3 rounded-full hover:bg-white/20 transition-all">
                    <Icon name="bar-chart" size={20} />
                </button>
            )}
            <button onClick={handleLogout} className="bg-red-50 text-red-600 px-4 py-2 rounded-full border border-red-100 hover:bg-red-100 font-black text-[10px] uppercase tracking-widest transition-all shadow-md active:scale-95">
            Esci
            </button>
        </div>
      </header>
      
      {!isCook && !isBarista && (
        <div className="sticky top-0 z-[150] space-y-0.5">
          {lowStockCount > 0 && (
            <button onClick={() => setFilterMode(prev => prev === 'LOW_STOCK' ? 'ALL' : 'LOW_STOCK')} className={`w-full p-4 flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest transition-all ${filterMode === 'LOW_STOCK' ? 'bg-black text-white' : 'bg-red-700 text-white shadow-xl'}`}>
              <Icon name="alert-triangle" size={14} /> {filterMode === 'LOW_STOCK' ? 'Filtro Scorte Attivo' : `${lowStockCount} Sotto Scorta`}
            </button>
          )}
          {expiringCount > 0 && (
            <button onClick={() => setFilterMode(prev => prev === 'EXPIRING' ? 'ALL' : 'EXPIRING')} className={`w-full p-4 flex items-center justify-center gap-3 font-black text-[10px] uppercase tracking-widest transition-all ${filterMode === 'EXPIRING' ? 'bg-black text-white' : 'bg-orange-600 text-white shadow-xl'}`}>
              <Icon name="clock" size={14} /> {filterMode === 'EXPIRING' ? 'Filtro Scadenze Attivo' : `${expiringCount} In Scadenza`}
            </button>
          )}
        </div>
      )}

      <main className="max-w-4xl mx-auto p-6 space-y-8">
        <div className="relative group">
          <Icon name="search" size={24} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 z-50 group-focus-within:text-slate-900" />
          <Autocomplete 
            value={searchQuery} onChange={setSearchQuery} 
            suggestions={[...new Set(items.map(i => i.name || ""))]} 
            placeholder="Cerca..." className="w-full bg-white border-4 border-slate-200 rounded-[2rem] p-6 pl-14 text-xl font-black focus:border-slate-900 outline-none shadow-hard" 
          />
        </div>

        {!isCook && !isBarista && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            <button onClick={() => {setActiveCategory('TUTTI'); setFilterMode('ALL');}} className={`flex-shrink-0 px-6 py-4 rounded-[1.5rem] font-black text-[11px] uppercase transition-all ${activeCategory === 'TUTTI' && filterMode === 'ALL' ? 'bg-slate-900 text-white shadow-lg scale-105' : 'bg-white text-slate-400 border-2 border-slate-100'}`}>TUTTI</button>
            {Object.values(CATEGORIES).map(cat => (
              <button key={cat} onClick={() => {setActiveCategory(cat); setFilterMode('ALL');}} className={`flex-shrink-0 px-6 py-4 rounded-[1.5rem] font-black text-[11px] uppercase flex items-center gap-2 transition-all ${activeCategory === cat ? `${CATEGORIES_META[cat].color} text-white shadow-lg scale-105` : 'bg-white text-slate-400 border-2 border-slate-100'}`}>
                <Icon name={CATEGORIES_META[cat].icon} size={16} /> {cat.split(' ')[0]}
              </button>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          {filteredItems.map(item => (
            <ItemCard key={item.id} item={item} onUpdate={updateQty} onDetails={() => setSelectedItem(item)} isExpiringSoon={checkExpiring(item.expiryDate)} />
          ))}
        </div>
      </main>

      <button onClick={openNewItemModal} className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-8 py-4 rounded-full shadow-[0_4px_14px_0_rgba(0,118,255,0.39)] flex items-center justify-center gap-3 active:scale-95 hover:bg-blue-700 hover:-translate-y-1 transition-all z-[200] font-black uppercase tracking-widest text-sm w-11/12 max-w-sm">
        <Icon name="plus" size={24} strokeWidth={3} /> Aggiungi Prodotto
      </button>

      {isAddModalOpen && (
        <AddModal 
          onClose={() => setIsAddModalOpen(false)} 
          onSave={handleSaveItem} 
          isCook={isCook} 
          isBarista={isBarista} 
          initialData={itemToEdit}
          nameSuggestions={[...new Set(items.map(i => i.name || ""))]} 
          supplierSuggestions={[...new Set(items.filter(i => i.supplier).map(i => i.supplier || ""))]} 
          subcategorySuggestions={[...new Set(items.filter(i => i.subcategory).map(i => i.subcategory || ""))]} 
        />
      )}
      
      {selectedItem && (
        <DetailModal 
          item={selectedItem} 
          onClose={() => setSelectedItem(null)} 
          isAdmin={isAdmin} 
          onEdit={() => openEditModal(selectedItem)}
          onDelete={async (id) => { if(confirm("Eliminare?")) { await deleteDoc(doc(db, 'inventory', id)); setSelectedItem(null); } }} 
        />
      )}

      {isStatsOpen && isAdmin && (
          <StatsModal onClose={() => setIsStatsOpen(false)} items={items} />
      )}
    </div>
  );
}

// --- ITEM CARD ---
function ItemCard({ item, onUpdate, onDetails, isExpiringSoon }) {
  const isLow = (item?.quantity || 0) <= (item?.minThreshold || 0);
  const meta = CATEGORIES_META[item?.category] || CATEGORIES_META[CATEGORIES.ALTRO];
  
  const allowDecimals = ['Kg', 'Lt'].includes(item?.unit);

  return (
    <div className={`relative bg-white rounded-[2.5rem] border-4 transition-all duration-300 overflow-hidden ${isLow ? 'border-red-600 bg-red-50/30' : (isExpiringSoon ? 'border-orange-500 bg-orange-50/30' : 'border-white hover:border-slate-200 shadow-xl')}`}>
      <div className="p-8 cursor-pointer" onClick={onDetails}>
        <div className="flex justify-between items-start mb-6">
          <div className={`p-4 rounded-2xl ${meta.text} border-2 ${meta.border} bg-white shadow-sm`}><Icon name={meta.icon} size={24} strokeWidth={3} /></div>
          <div className="flex flex-col gap-1">
            {isLow && <span className="bg-red-700 text-white px-2 py-1 rounded-lg text-[8px] font-black uppercase animate-pulse">Low Stock</span>}
            {isExpiringSoon && <span className="bg-orange-600 text-white px-2 py-1 rounded-lg text-[8px] font-black uppercase">Exp Soon</span>}
          </div>
        </div>
        <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none mb-1 text-slate-900 line-clamp-2">{item?.name || "Articolo"}</h3>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-6 flex gap-2">
            <span>{item?.category || "Altro"}</span>
            {item?.subcategory && <span className="text-slate-500">/ {item.subcategory}</span>}
        </p>
        <div className="flex items-baseline gap-2">
          <span className={`text-6xl font-black tracking-tighter tabular-nums ${isLow ? 'text-red-700' : 'text-slate-900'}`}>{item?.quantity || 0}</span>
          <span className="text-xl font-black text-slate-400 uppercase tracking-tighter">{item?.unit || ""}</span>
        </div>
      </div>
      
      <div className="flex flex-col bg-slate-50 border-t">
         {allowDecimals && (
             <div className="flex justify-center gap-4 pt-2">
                 <button onClick={(e) => {e.stopPropagation(); onUpdate(item.id, -0.1)}} className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-slate-500 hover:bg-red-50 hover:text-red-600 active:scale-95 transition-all">- 0.1</button>
                 <button onClick={(e) => {e.stopPropagation(); onUpdate(item.id, 0.1)}} className="px-3 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-black text-slate-500 hover:bg-green-50 hover:text-green-600 active:scale-95 transition-all">+ 0.1</button>
             </div>
         )}
         <div className="flex p-4 gap-4">
            <button onClick={(e) => {e.stopPropagation(); onUpdate(item.id, -1)}} className="flex-1 bg-white border-2 border-slate-200 py-4 rounded-2xl font-black text-3xl hover:bg-slate-100 active:scale-95 transition-all">-</button>
            <button onClick={(e) => {e.stopPropagation(); onUpdate(item.id, 1)}} className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black text-3xl hover:bg-black active:scale-95 transition-all">+</button>
         </div>
      </div>
    </div>
  );
}

function AddModal({ onClose, onSave, isCook, isBarista, initialData, nameSuggestions, supplierSuggestions, subcategorySuggestions }) {
  const [name, setName] = useState(initialData?.name || '');
  const [supplier, setSupplier] = useState(initialData?.supplier || '');
  const [subcategory, setSubcategory] = useState(initialData?.subcategory || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    let selectedCategory = fd.get('category');
    if (isCook) selectedCategory = CATEGORIES.RISTORANTE;
    if (isBarista) selectedCategory = CATEGORIES.BAR;

    const formData = {
      name: name.trim(),
      category: selectedCategory,
      quantity: parseFloat(fd.get('quantity')) || 0,
      minThreshold: parseFloat(fd.get('minThreshold')) || 0,
      supplier: supplier.trim(),
      subcategory: subcategory.trim(),
      unit: fd.get('unit') || '',
      expiryDate: fd.get('expiry') || ''
    };
    onSave(formData, initialData?.id);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl animate-modal flex flex-col max-h-[90vh]">
        <div className="p-8 border-b flex justify-between items-center">
          <h2 className="text-3xl font-black uppercase italic tracking-tighter text-slate-900">
             {initialData ? "Modifica" : "Nuovo Carico"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors"><Icon name="x" size={32} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto no-scrollbar">
          <Autocomplete label="Articolo" value={name} onChange={setName} suggestions={nameSuggestions} placeholder="Cerca o inserisci..." className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-slate-900 transition-all" />
          <div className="grid grid-cols-2 gap-4">
            <select name="category" disabled={isCook || isBarista} className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none disabled:bg-slate-50" defaultValue={initialData?.category || (isCook ? CATEGORIES.RISTORANTE : isBarista ? CATEGORIES.BAR : CATEGORIES.RISTORANTE)}>
              {Object.values(CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select name="unit" className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none" defaultValue={initialData?.unit || ""}>
              <option value="">U.M.</option>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <input name="quantity" type="number" step="0.1" required defaultValue={initialData?.quantity || "1"} className="w-full border-4 border-slate-100 rounded-2xl p-4 text-3xl font-black focus:border-slate-900 outline-none transition-all" placeholder="Q.tà" />
            <input name="minThreshold" type="number" step="0.1" required defaultValue={initialData?.minThreshold || "5"} className="w-full border-4 border-slate-100 rounded-2xl p-4 text-3xl font-black focus:border-slate-900 outline-none transition-all" placeholder="Soglia" />
          </div>
          <Autocomplete label="Sottocategoria / Cantina" value={subcategory} onChange={setSubcategory} suggestions={subcategorySuggestions} placeholder="Es. Cantina Antinori" required={false} className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-slate-900 transition-all" />
          <Autocomplete label="Fornitore" value={supplier} onChange={setSupplier} suggestions={supplierSuggestions} placeholder="Fornitore..." required={false} className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-slate-900 transition-all" />
          <input name="expiry" type="date" defaultValue={initialData?.expiryDate || ""} className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none" />
          <button type="submit" className="w-full bg-slate-900 text-white p-6 rounded-2xl font-black text-xl hover:bg-black uppercase border-b-8 border-slate-950 shadow-xl active:scale-95 transition-all">
             {initialData ? "Salva Modifiche" : "Aggiungi al Magazzino"}
          </button>
        </form>
      </div>
    </div>
  );
}

function DetailModal({ item, onClose, onDelete, onEdit, isAdmin }) {
  const isLow = (item?.quantity || 0) <= (item?.minThreshold || 0);
  const meta = CATEGORIES_META[item?.category] || CATEGORIES_META[CATEGORIES.ALTRO];

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="relative bg-white w-11/12 max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl animate-modal flex flex-col">
        <div className="p-8 pb-2">
          <div className="flex justify-between items-start">
             <div className={`px-4 py-2 rounded-xl inline-flex ${meta.color} text-white text-[10px] font-black uppercase mb-4 shadow-md`}><Icon name={meta.icon} size={14} className="mr-2" /> {item?.category}</div>
             {isAdmin && (
               <button onClick={onEdit} className="bg-blue-50 text-blue-600 p-3 rounded-xl border border-blue-100 hover:bg-blue-100 transition-all flex items-center gap-2 font-black text-[10px] uppercase">
                 <Icon name="pencil" size={16} /> Modifica
               </button>
             )}
          </div>
          <h2 className="text-3xl font-black uppercase italic tracking-tighter leading-none text-slate-900">{item?.name}</h2>
          {item?.subcategory && <p className="text-lg font-bold text-slate-500 mt-1 flex items-center gap-1"><Icon name="tag" size={14} /> {item.subcategory}</p>}
          <div className={`mt-6 p-6 rounded-[2rem] border-4 flex flex-col items-center justify-center ${isLow ? 'bg-red-50 border-red-600' : 'bg-slate-50 border-slate-200'}`}>
            <p className={`text-[10px] font-black uppercase mb-1 ${isLow ? 'text-red-700' : 'text-slate-400'}`}>Giacenza Attuale</p>
            <div className="flex items-baseline gap-2">
              <span className={`text-6xl font-black tracking-tighter tabular-nums ${isLow ? 'text-red-600' : 'text-slate-900'}`}>{item?.quantity || 0}</span>
              <span className="text-2xl font-black uppercase text-slate-400">{item?.unit || ""}</span>
            </div>
          </div>
        </div>
        <div className="p-8 pt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100"><p className="text-[9px] font-black uppercase text-slate-400">Unità</p><p className="font-black text-slate-800 uppercase truncate">{item?.unit || "Nessuna"}</p></div>
            <div className="bg-slate-50 p-4 rounded-2xl border-2 border-slate-100"><p className="text-[9px] font-black uppercase text-slate-400">Alert Sotto</p><p className="font-black text-slate-800 uppercase truncate">{item?.minThreshold || 0} {item?.unit}</p></div>
          </div>
          <div className="p-5 rounded-2xl border-2 bg-slate-50 border-slate-200"><p className="text-[10px] font-black uppercase text-slate-400 mb-1 flex items-center gap-2"><Icon name="truck" size={14} /> Fornitore</p><p className="text-xl font-black text-slate-900 uppercase truncate">{item?.supplier || "Non specificato"}</p></div>
          {item?.expiryDate && <div className="p-5 rounded-2xl border-2 bg-orange-50 border-orange-200 text-orange-900"><p className="text-[10px] font-black uppercase mb-1 flex items-center gap-2"><Icon name="calendar" size={14} /> Scadenza</p><p className="text-xl font-black uppercase">{new Date(item.expiryDate).toLocaleDateString('it-IT')}</p></div>}
          <div className="flex gap-3 pt-4">
            {isAdmin && <button onClick={() => onDelete(item.id)} className="p-5 bg-red-50 text-red-600 rounded-2xl font-black border-2 border-red-100 hover:bg-red-100 transition-all"><Icon name="trash-2" size={24} /></button>}
            <button onClick={onClose} className="flex-1 bg-slate-200 text-slate-700 p-5 rounded-2xl font-black text-xl uppercase tracking-tighter hover:bg-slate-300 transition-all">CHIUDI</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- STATS MODAL (AGGIORNATA CON RICERCA) ---
function StatsModal({ onClose, items }) {
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportData, setReportData] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // NUOVO STATO PER LA RICERCA NEL REPORT
  const [reportSearchQuery, setReportSearchQuery] = useState('');

  const generateReport = async () => {
    setLoading(true);
    try {
      const logsRef = collection(db, 'logs');
      const q = query(logsRef, orderBy('date', 'desc')); 
      const snapshot = await getDocs(q);
      
      const start = new Date(startDate); start.setHours(0,0,0,0);
      const end = new Date(endDate); end.setHours(23,59,59,999);

      const grouped = {};
      snapshot.docs.forEach(doc => {
        const log = doc.data();
        const logDate = new Date(log.date);
        
        if (logDate >= start && logDate <= end) {
          if (!grouped[log.itemName]) {
            grouped[log.itemName] = { name: log.itemName, loaded: 0, sold: 0, category: log.category };
          }
          if (log.quantityChange > 0) {
            grouped[log.itemName].loaded += log.quantityChange;
          } else {
            grouped[log.itemName].sold += Math.abs(log.quantityChange);
          }
        }
      });
      const finalReport = Object.values(grouped).map(i => ({
         ...i,
         loaded: parseFloat(i.loaded.toFixed(2)),
         sold: parseFloat(i.sold.toFixed(2))
      })).sort((a,b) => b.sold - a.sold);

      setReportData(finalReport);
    } catch (err) {
      alert("Errore generazione report: " + err.message);
    }
    setLoading(false);
  };

  // LOGICA FILTRO RICERCA
  const filteredReportData = useMemo(() => {
    if (!reportSearchQuery) return reportData;
    return reportData.filter(item => 
        item.name.toLowerCase().includes(reportSearchQuery.toLowerCase())
    );
  }, [reportData, reportSearchQuery]);

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-2xl rounded-[2.5rem] overflow-hidden shadow-2xl animate-modal flex flex-col max-h-[90vh]">
        <div className="p-8 border-b bg-slate-900 text-white flex justify-between items-center">
          <div>
             <h2 className="text-2xl font-black uppercase italic tracking-tighter text-yellow-400">Report Vendite</h2>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Analisi Movimenti</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><Icon name="x" size={32} /></button>
        </div>

        <div className="p-6 bg-slate-50 border-b space-y-4">
             {/* SELEZIONE DATE */}
            <div className="flex flex-col sm:flex-row gap-4 items-end">
                <label className="w-full">
                    <span className="text-[10px] font-black uppercase text-slate-500 block mb-1">Dal Giorno</span>
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-3 rounded-xl border-2 border-slate-200 font-bold" />
                </label>
                <label className="w-full">
                    <span className="text-[10px] font-black uppercase text-slate-500 block mb-1">Al Giorno</span>
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-3 rounded-xl border-2 border-slate-200 font-bold" />
                </label>
                <button onClick={generateReport} disabled={loading} className="w-full sm:w-auto bg-blue-600 text-white px-6 py-3 rounded-xl font-black uppercase hover:bg-blue-700 transition-all shadow-lg">
                    {loading ? '...' : 'Calcola'}
                </button>
            </div>
            
            {/* NUOVA BARRA DI RICERCA NEL REPORT */}
            <div className="relative">
                <Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Cerca prodotto specifico nel report..." 
                    value={reportSearchQuery}
                    onChange={(e) => setReportSearchQuery(e.target.value)}
                    className="w-full p-3 pl-10 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-700 focus:border-blue-600 outline-none transition-colors placeholder:font-medium"
                />
            </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-2">
            {reportData.length === 0 ? (
                <div className="text-center text-slate-400 py-10 font-bold italic">Nessun dato o report non generato.</div>
            ) : filteredReportData.length === 0 ? (
                <div className="text-center text-slate-400 py-10 font-bold italic">Nessun prodotto trovato con questo nome.</div>
            ) : (
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white z-10 shadow-sm">
                        <tr>
                            <th className="p-3 text-[10px] font-black uppercase text-slate-400">Prodotto</th>
                            <th className="p-3 text-[10px] font-black uppercase text-green-600 text-center">Caricati</th>
                            <th className="p-3 text-[10px] font-black uppercase text-red-600 text-center">Venduti</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredReportData.map((row, i) => (
                            <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                                <td className="p-3">
                                    <div className="font-bold text-slate-900">{row.name}</div>
                                    <div className="text-[9px] uppercase text-slate-400">{row.category}</div>
                                </td>
                                <td className="p-3 text-center">
                                    {row.loaded > 0 ? (
                                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded-lg text-xs font-black">+{row.loaded}</span>
                                    ) : <span className="text-slate-200">-</span>}
                                </td>
                                <td className="p-3 text-center">
                                    {row.sold > 0 ? (
                                        <span className="bg-red-100 text-red-800 px-2 py-1 rounded-lg text-xs font-black">-{row.sold}</span>
                                    ) : <span className="text-slate-200">-</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
      </div>
    </div>
  );
}
