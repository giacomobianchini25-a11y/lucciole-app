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
  getDocs 
} from 'firebase/firestore';

// --- IMPORTAZIONE ICONE (FIX DEFINITIVO) ---
import { 
  Wine, 
  Utensils, 
  Bed, 
  Waves, 
  Package, 
  ChevronRight, 
  AlertTriangle, 
  Clock, 
  Power, 
  Search, 
  Plus, 
  X, 
  Truck, 
  Calendar, 
  Trash2 
} from 'lucide-react';

// --- Mappa Icone ---
const ICON_MAP = {
  'wine': Wine,
  'utensils': Utensils,
  'bed': Bed,
  'waves': Waves,
  'package': Package,
  'chevron-right': ChevronRight,
  'alert-triangle': AlertTriangle,
  'clock': Clock,
  'power': Power,
  'search': Search,
  'plus': Plus,
  'x': X,
  'truck': Truck,
  'calendar': Calendar,
  'trash-2': Trash2
};

// --- Componente Iconale Reattivo ---
const Icon = ({ name, size = 20, className = "", strokeWidth = 2.5 }) => {
  // Prende l'icona dalla mappa, se non esiste usa Package come default
  const LucideIcon = ICON_MAP[name] || Package;
  return <LucideIcon size={size} className={className} strokeWidth={strokeWidth} />;
};

// --- Costanti ---
const CATEGORIES = {
  BAR: 'Bar',
  RISTORANTE: 'Ristorante',
  BIANCHERIA: 'Biancheria e Prodotti',
  PISCINA: 'Piscina',
  ALTRO: 'Altro'
};

const UNITS = ['Pz', 'Kg', 'Lt', 'Pacchi'];

const CATEGORIES_META = {
  [CATEGORIES.BAR]: { icon: 'wine', color: 'bg-blue-700', text: 'text-blue-900', border: 'border-blue-300' },
  [CATEGORIES.RISTORANTE]: { icon: 'utensils', color: 'bg-orange-600', text: 'text-orange-900', border: 'border-orange-300' },
  [CATEGORIES.BIANCHERIA]: { icon: 'bed', color: 'bg-purple-700', text: 'text-purple-900', border: 'border-purple-300' },
  [CATEGORIES.PISCINA]: { icon: 'waves', color: 'bg-cyan-700', text: 'text-cyan-900', border: 'border-cyan-300' },
  [CATEGORIES.ALTRO]: { icon: 'package', color: 'bg-slate-700', text: 'text-slate-900', border: 'border-slate-300' }
};

// --- Componenti UI ---
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

// --- App Core ---
export default function App() {
  const [user, setUser] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState('');
  
  const [activeCategory, setActiveCategory] = useState('TUTTI');
  const [filterMode, setFilterMode] = useState('ALL'); 
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);

  const userRole = useMemo(() => {
    if (!user) return null;
    if (user.email === 'admin@lucciole.app') return 'admin';
    if (user.email === 'cuoco@lucciole.app') return 'cuoco';
    return null;
  }, [user]);

  const isCook = userRole === 'cuoco';
  const isAdmin = userRole === 'admin';

  // Auth & Sync
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u?.email === 'cuoco@lucciole.app') setActiveCategory(CATEGORIES.RISTORANTE);
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
    else { setLoginError('Utente non riconosciuto.'); return; }

    try {
      await signInWithEmailAndPassword(auth, email, p);
    } catch (err) {
      setLoginError('Accesso fallito. Verifica la password (min 6 char).');
    }
  };

  const handleLogout = () => signOut(auth);

  const addItemOrMerge = async (newItem) => {
    // Smart Merge Check
    const existing = items.find(i => 
      (i.name || "").toLowerCase().trim() === (newItem.name || "").toLowerCase().trim() && 
      (i.category || "") === (newItem.category || "")
    );

    try {
      if (existing) {
        const itemRef = doc(db, 'inventory', existing.id);
        await updateDoc(itemRef, {
          quantity: (existing.quantity || 0) + newItem.quantity,
          minThreshold: newItem.minThreshold || existing.minThreshold,
          supplier: newItem.supplier || existing.supplier || ""
        });
      } else {
        await addDoc(collection(db, 'inventory'), newItem);
      }
      setIsAddModalOpen(false);
    } catch (err) {
      alert("Errore durante il salvataggio.");
    }
  };

  const updateQty = async (id, delta) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    try {
      await updateDoc(doc(db, 'inventory', id), {
        quantity: Math.max(0, (item.quantity || 0) + delta)
      });
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
    else if (activeCategory !== 'TUTTI') list = list.filter(i => (i.category || "") === activeCategory);

    if (filterMode === 'LOW_STOCK') list = list.filter(i => (i.quantity || 0) <= (i.minThreshold || 0));
    if (filterMode === 'EXPIRING') list = list.filter(i => checkExpiring(i.expiryDate));

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i => (i.name || "").toLowerCase().includes(q));
    }
    return list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [items, activeCategory, filterMode, searchQuery, isCook]);

  const lowStockCount = useMemo(() => items.filter(i => (i.quantity || 0) <= (i.minThreshold || 0)).length, [items]);
  const expiringCount = useMemo(() => items.filter(i => checkExpiring(i.expiryDate)).length, [items]);

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
      <button onClick={() => { if(confirm("Resettare l'app?")) window.location.reload(); }} className="mt-8 text-[10px] font-black uppercase text-slate-500 hover:text-red-500 bg-white/5 px-4 py-2 rounded-full">⚠️ Reset Dati App</button>
    </div>
  );

  return (
    <div className="min-h-screen pb-44">
      {!isCook && (
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

      <header className="bg-slate-900 text-white p-8 flex justify-between items-center shadow-xl">
        <div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter text-yellow-400 leading-none">Lucciole nella Nebbia</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Gestione Magazzino</p>
        </div>
        <button onClick={handleLogout} className="bg-red-50 text-red-600 px-4 py-2 rounded-full border border-red-100 hover:bg-red-100 font-black text-[10px] uppercase tracking-widest transition-all shadow-md active:scale-95">
           Esci
        </button>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-8">
        <div className="relative group">
          <Icon name="search" size={24} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 z-50 group-focus-within:text-slate-900" />
          <Autocomplete 
            value={searchQuery} onChange={setSearchQuery} 
            suggestions={[...new Set(items.map(i => i.name || ""))]} 
            placeholder="Cerca articoli..." className="w-full bg-white border-4 border-slate-200 rounded-[2rem] p-6 pl-14 text-xl font-black focus:border-slate-900 outline-none shadow-hard" 
          />
        </div>

        {!isCook && (
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

      <button onClick={() => setIsAddModalOpen(true)} className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-8 py-4 rounded-full shadow-[0_4px_14px_0_rgba(0,118,255,0.39)] flex items-center justify-center gap-3 active:scale-95 hover:bg-blue-700 hover:-translate-y-1 transition-all z-[200] font-black uppercase tracking-widest text-sm w-11/12 max-w-sm">
        <Icon name="plus" size={24} strokeWidth={3} /> Aggiungi Prodotto
      </button>

      {isAddModalOpen && <AddModal onClose={() => setIsAddModalOpen(false)} onAdd={addItemOrMerge} isCook={isCook} nameSuggestions={[...new Set(items.map(i => i.name || ""))]} supplierSuggestions={[...new Set(items.filter(i => i.supplier).map(i => i.supplier || ""))]} />}
      {selectedItem && <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} isAdmin={isAdmin} onDelete={async (id) => { if(confirm("Eliminare?")) { await deleteDoc(doc(db, 'inventory', id)); setSelectedItem(null); } }} />}
    </div>
  );
}

function ItemCard({ item, onUpdate, onDetails, isExpiringSoon }) {
  const isLow = (item?.quantity || 0) <= (item?.minThreshold || 0);
  const meta = CATEGORIES_META[item?.category] || CATEGORIES_META[CATEGORIES.ALTRO];

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
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-6">{item?.category || "Altro"}</p>
        <div className="flex items-baseline gap-2">
          <span className={`text-6xl font-black tracking-tighter tabular-nums ${isLow ? 'text-red-700' : 'text-slate-900'}`}>{item?.quantity || 0}</span>
          <span className="text-xl font-black text-slate-400 uppercase tracking-tighter">{item?.unit || ""}</span>
        </div>
      </div>
      <div className="flex p-4 gap-4 bg-slate-50 border-t">
        <button onClick={(e) => {e.stopPropagation(); onUpdate(item.id, -1)}} className="flex-1 bg-white border-2 border-slate-200 py-4 rounded-2xl font-black text-3xl hover:bg-slate-100 active:scale-95 transition-all">-</button>
        <button onClick={(e) => {e.stopPropagation(); onUpdate(item.id, 1)}} className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black text-3xl hover:bg-black active:scale-95 transition-all">+</button>
      </div>
    </div>
  );
}

function AddModal({ onClose, onAdd, isCook, nameSuggestions, supplierSuggestions }) {
  const [name, setName] = useState('');
  const [supplier, setSupplier] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    onAdd({
      name: name.trim(),
      category: isCook ? CATEGORIES.RISTORANTE : fd.get('category'),
      quantity: parseFloat(fd.get('quantity')) || 0,
      minThreshold: parseFloat(fd.get('minThreshold')) || 0,
      supplier: supplier.trim(),
      unit: fd.get('unit') || '',
      expiryDate: fd.get('expiry') || ''
    });
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl animate-modal flex flex-col max-h-[90vh]">
        <div className="p-8 border-b flex justify-between items-center">
          <h2 className="text-3xl font-black uppercase italic tracking-tighter text-slate-900">Nuovo Carico</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors"><Icon name="x" size={32} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-6 overflow-y-auto no-scrollbar">
          <Autocomplete label="Articolo" value={name} onChange={setName} suggestions={nameSuggestions} placeholder="Cerca o inserisci..." className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-slate-900 transition-all" />
          <div className="grid grid-cols-2 gap-4">
            <select name="category" disabled={isCook} className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none disabled:bg-slate-50" defaultValue={CATEGORIES.RISTORANTE}>
              {Object.values(CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select name="unit" className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none">
              <option value="">U.M.</option>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <input name="quantity" type="number" step="0.1" required defaultValue="1" className="w-full border-4 border-slate-100 rounded-2xl p-4 text-3xl font-black focus:border-slate-900 outline-none transition-all" placeholder="Q.tà" />
            <input name="minThreshold" type="number" step="0.1" required defaultValue="5" className="w-full border-4 border-slate-100 rounded-2xl p-4 text-3xl font-black focus:border-slate-900 outline-none transition-all" placeholder="Soglia" />
          </div>
          <Autocomplete label="Fornitore" value={supplier} onChange={setSupplier} suggestions={supplierSuggestions} placeholder="Fornitore..." required={false} className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-slate-900 transition-all" />
          <input name="expiry" type="date" className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none" />
          <button type="submit" className="w-full bg-slate-900 text-white p-6 rounded-2xl font-black text-xl hover:bg-black uppercase border-b-8 border-slate-950 shadow-xl active:scale-95 transition-all">Salva</button>
        </form>
      </div>
    </div>
  );
}

function DetailModal({ item, onClose, onDelete, isAdmin }) {
  const isLow = (item?.quantity || 0) <= (item?.minThreshold || 0);
  const meta = CATEGORIES_META[item?.category] || CATEGORIES_META[CATEGORIES.ALTRO];

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="relative bg-white w-11/12 max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl animate-modal flex flex-col">
        <div className="p-8 pb-2">
          <div className={`px-4 py-2 rounded-xl inline-flex ${meta.color} text-white text-[10px] font-black uppercase mb-4 shadow-md`}><Icon name={meta.icon} size={14} className="mr-2" /> {item?.category}</div>
          <h2 className="text-3xl font-black uppercase italic tracking-tighter leading-none text-slate-900">{item?.name}</h2>
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
