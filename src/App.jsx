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
  orderBy,
  getDoc,
  setDoc
} from 'firebase/firestore';

// --- IMPORTAZIONE LIBRERIA GRAFICI ---
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

// --- IMPORTAZIONE ICONE ---
import { 
  Wine, Utensils, Bed, Waves, Package, ChevronRight, AlertTriangle, 
  Clock, Power, Search, Plus, X, Truck, Calendar, Trash2, Pencil, Tag, 
  BarChart3, ArrowDownCircle, ArrowUpCircle, CookingPot, CheckCircle2,
  Archive, RefreshCw, ArchiveRestore, ClipboardList, Save, CheckSquare,
  Undo2, Calculator, Wallet, GlassWater // Icona per il bicchiere
} from 'lucide-react';

// --- MAPPA ICONE ---
const ICON_MAP = {
  'wine': Wine, 'utensils': Utensils, 'bed': Bed, 'waves': Waves, 
  'package': Package, 'chevron-right': ChevronRight, 'alert-triangle': AlertTriangle, 
  'clock': Clock, 'power': Power, 'search': Search, 'plus': Plus, 'x': X, 
  'truck': Truck, 'calendar': Calendar, 'trash-2': Trash2, 'pencil': Pencil, 
  'tag': Tag, 'bar-chart': BarChart3, 'arrow-down': ArrowDownCircle, 'arrow-up': ArrowUpCircle,
  'cooking-pot': CookingPot, 'check-circle': CheckCircle2,
  'archive': Archive, 'refresh-cw': RefreshCw, 'archive-restore': ArchiveRestore,
  'clipboard-list': ClipboardList, 'save': Save, 'check-square': CheckSquare,
  'undo-2': Undo2, 'calculator': Calculator, 'wallet': Wallet, 'glass-water': GlassWater
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
  LAVANDERIA: 'Lavanderia',
  PISCINA: 'Piscina',
  ALTRO: 'Altro'
};

const UNITS = ['Pz', 'Kg', 'Lt', 'Pacchi', 'Porzioni', 'Bottiglie'];

const CATEGORIES_META = {
  [CATEGORIES.BAR]: { icon: 'wine', color: 'bg-blue-700', text: 'text-blue-900', border: 'border-blue-300' },
  [CATEGORIES.RISTORANTE]: { icon: 'utensils', color: 'bg-orange-600', text: 'text-orange-900', border: 'border-orange-300' },
  [CATEGORIES.PIATTI]: { icon: 'cooking-pot', color: 'bg-rose-600', text: 'text-rose-900', border: 'border-rose-300' },
  [CATEGORIES.LAVANDERIA]: { icon: 'bed', color: 'bg-purple-700', text: 'text-purple-900', border: 'border-purple-300' },
  [CATEGORIES.PISCINA]: { icon: 'waves', color: 'bg-cyan-700', text: 'text-cyan-900', border: 'border-cyan-300' },
  [CATEGORIES.ALTRO]: { icon: 'package', color: 'bg-slate-700', text: 'text-slate-900', border: 'border-slate-300' }
};

// --- CONFIGURAZIONE TAB LISTA SPESA ---
const SHOPPING_TABS = [
    { id: 'ALL', label: 'TUTTO', icon: 'clipboard-list', color: 'bg-slate-800' },
    { id: 'bar', label: 'BAR', icon: 'wine', color: 'bg-blue-700' },
    { id: 'ristorante', label: 'RISTORANTE', icon: 'utensils', color: 'bg-orange-600' },
    { id: 'lavanderia', label: 'LAVANDERIA', icon: 'bed', color: 'bg-purple-700' },
    { id: 'piscina', label: 'PISCINA', icon: 'waves', color: 'bg-cyan-700' },
    { id: 'altro', label: 'ALTRO', icon: 'package', color: 'bg-slate-700' }
];

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
const logTransaction = async (itemName, category, quantityChange, userRole, note = '') => {
  try {
    await addDoc(collection(db, 'logs'), {
      itemName,
      category,
      quantityChange,
      userRole,
      note, // Aggiunto note per specificare se è un "Bicchiere" o "Bottiglia"
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
  const [isShoppingListOpen, setIsShoppingListOpen] = useState(false); 
  const [showArchived, setShowArchived] = useState(false);

  // --- LOGICA RUOLI ---
  const userRole = useMemo(() => {
    if (!user) return null;
    if (user.email === 'superadmin@lucciole.app') return 'superadmin';
    if (user.email === 'admin@lucciole.app') return 'admin';
    if (user.email === 'cuoco@lucciole.app') return 'cuoco';
    if (user.email === 'barista@lucciole.app') return 'barista';
    return null;
  }, [user]);

  const isCook = userRole === 'cuoco';
  const isBarista = userRole === 'barista';
  const isAdmin = userRole === 'admin';
  const isSuperAdmin = userRole === 'superadmin';
  const isManager = isAdmin || isSuperAdmin; 

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
    if (u === 'superadmin') email = 'superadmin@lucciole.app';
    else if (u === 'admin') email = 'admin@lucciole.app';
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
          expiryDate: formData.expiryDate,
          costPrice: formData.costPrice,
          sellPrice: formData.sellPrice,
          capacity: formData.capacity, // NUOVO: Capacità Totale (es. 700ml)
          dose: formData.dose          // NUOVO: Dose Singola (es. 40ml)
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
            subcategory: formData.subcategory || existing.subcategory || "",
            costPrice: formData.costPrice || existing.costPrice || 0,
            sellPrice: formData.sellPrice || existing.sellPrice || 0,
            capacity: formData.capacity || existing.capacity || 0,
            dose: formData.dose || existing.dose || 0
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

  // --- FUNZIONE UPDATE QTY AGGIORNATA PER SUPPORTARE LE DOSI ---
  const updateQty = async (id, delta, note = '') => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    if (item.category === CATEGORIES.PIATTI) {
        await logTransaction(item.name, item.category, delta, userRole, note);
        return; 
    }

    try {
      // Calcola nuova quantità gestendo i decimali con precisione
      const newQty = Math.max(0, parseFloat((item.quantity + delta).toFixed(4))); 
      
      await updateDoc(doc(db, 'inventory', id), {
        quantity: newQty
      });
      await logTransaction(item.name, item.category, delta, userRole, note);
    } catch (err) { console.error(err); }
  };

  const toggleArchiveItem = async (id, currentStatus) => {
    try {
      await updateDoc(doc(db, 'inventory', id), {
        isArchived: !currentStatus
      });
      setSelectedItem(null); 
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

    if (showArchived) {
        list = list.filter(i => i.isArchived === true);
    } else {
        list = list.filter(i => !i.isArchived); 
    }

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
  }, [items, activeCategory, filterMode, searchQuery, isCook, isBarista, showArchived]);

  const lowStockCount = useMemo(() => items.filter(i => !i.isArchived && i.category !== CATEGORIES.PIATTI && (i.quantity || 0) <= (i.minThreshold || 0)).length, [items]);
  const expiringCount = useMemo(() => items.filter(i => !i.isArchived && checkExpiring(i.expiryDate)).length, [items]);

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

// --- FINE PARTE 1 ---
return (
  <div className="min-h-screen pb-44">
    <header className={`p-8 flex justify-between items-center shadow-xl transition-colors ${showArchived ? 'bg-slate-800 border-b-4 border-yellow-500' : 'bg-slate-900 text-white'}`}>
      <div>
        <h1 className="text-3xl font-black uppercase italic tracking-tighter text-yellow-400 leading-none">Lucciole</h1>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            {showArchived ? "ARCHIVIO OBSOLETI" : "Magazzino"}
        </p>
      </div>
      <div className="flex gap-2">
          {isManager && (
              <button 
                  onClick={() => {
                      setShowArchived(!showArchived);
                      setActiveCategory('TUTTI');
                  }} 
                  className={`p-3 rounded-full transition-all ${showArchived ? 'bg-yellow-400 text-black shadow-[0_0_15px_rgba(250,204,21,0.5)]' : 'bg-white/10 text-slate-400 hover:text-white'}`}
              >
                  <Icon name={showArchived ? "archive-restore" : "archive"} size={20} />
              </button>
          )}

          {isSuperAdmin && (
              <button onClick={() => setIsStatsOpen(true)} className="bg-white/10 text-yellow-400 p-3 rounded-full hover:bg-white/20 transition-all">
                  <Icon name="bar-chart" size={20} />
              </button>
          )}
          
          <button onClick={handleLogout} className="bg-red-50 text-red-600 px-4 py-2 rounded-full border border-red-100 hover:bg-red-100 font-black text-[10px] uppercase tracking-widest transition-all shadow-md active:scale-95">
          Esci
          </button>
      </div>
    </header>
    
    {!isCook && !isBarista && !showArchived && (
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
      {showArchived && (
          <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800 p-4 rounded-xl mb-4 text-sm font-bold">
              ⚠️ Stai visualizzando i prodotti obsoleti. Clicca su un prodotto per ripristinarlo nel menu attivo.
          </div>
      )}

      <div className="relative group">
        <Icon name="search" size={24} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 z-50 group-focus-within:text-slate-900" />
        <Autocomplete 
          value={searchQuery} onChange={setSearchQuery} 
          suggestions={[...new Set(items.map(i => i.name || ""))]} 
          placeholder={showArchived ? "Cerca nell'archivio..." : "Cerca..."} 
          className="w-full bg-white border-4 border-slate-200 rounded-[2rem] p-6 pl-14 text-xl font-black focus:border-slate-900 outline-none shadow-hard" 
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

    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-11/12 max-w-sm flex gap-3 z-[200]">
        {!showArchived && (
          <button onClick={openNewItemModal} className="flex-1 bg-blue-600 text-white px-6 py-4 rounded-full shadow-[0_4px_14px_0_rgba(0,118,255,0.39)] flex items-center justify-center gap-3 active:scale-95 hover:bg-blue-700 hover:-translate-y-1 transition-all font-black uppercase tracking-widest text-sm">
              <Icon name="plus" size={24} strokeWidth={3} /> Aggiungi
          </button>
        )}
        
        <button onClick={() => setIsShoppingListOpen(true)} className="w-16 bg-white text-slate-900 border-4 border-slate-200 rounded-full shadow-lg flex items-center justify-center active:scale-95 hover:bg-slate-50 transition-all">
            <Icon name="clipboard-list" size={24} strokeWidth={2.5} />
        </button>
    </div>

    {isAddModalOpen && (
      <AddModal 
        onClose={() => setIsAddModalOpen(false)} 
        onSave={handleSaveItem} 
        isCook={isCook} 
        isBarista={isBarista} 
        isManager={isManager} 
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
        isManager={isManager} 
        onEdit={() => openEditModal(selectedItem)}
        onDelete={async (id) => { if(confirm("Eliminare?")) { await deleteDoc(doc(db, 'inventory', id)); setSelectedItem(null); } }} 
        onToggleArchive={() => toggleArchiveItem(selectedItem.id, selectedItem.isArchived)}
        onUpdate={updateQty}
      />
    )}

    {isStatsOpen && isSuperAdmin && (
        <StatsModal onClose={() => setIsStatsOpen(false)} items={items} />
    )}

    {isShoppingListOpen && (
        <ShoppingListModal 
          onClose={() => setIsShoppingListOpen(false)} 
          isCook={isCook}
          isBarista={isBarista}
          isManager={isManager}
        />
    )}
  </div>
);
}

// --- MODALE LISTA SPESA (LAVAGNA COMPLETA CON PERMESSI) ---
function ShoppingListModal({ onClose, isCook, isBarista, isManager }) {
  const visibleTabs = useMemo(() => {
      if (isCook) return SHOPPING_TABS.filter(t => t.id === 'ristorante');
      if (isBarista) return SHOPPING_TABS.filter(t => t.id === 'bar');
      return SHOPPING_TABS; 
  }, [isCook, isBarista]);

  const [activeTab, setActiveTab] = useState(() => {
      if (isCook) return 'ristorante';
      if (isBarista) return 'bar';
      return 'ALL';
  });

  const [notes, setNotes] = useState({
      bar: '',
      ristorante: '',
      lavanderia: '',
      piscina: '',
      altro: ''
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
      const fetchNote = async () => {
          const docRef = doc(db, 'general', 'shoppingList');
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
              const data = docSnap.data();
              setNotes({
                  bar: data.contentBar || '',
                  ristorante: data.contentRistorante !== undefined ? data.contentRistorante : (data.contentKitchen || ''),
                  lavanderia: data.contentLavanderia !== undefined ? data.contentLavanderia : (data.contentBiancheria || ''), 
                  piscina: data.contentPiscina || '',
                  altro: data.contentAltro || ''
              });
          }
      };
      fetchNote();
  }, []);

  const saveNotes = async (updatedNotes = notes) => {
      setSaving(true);
      try {
          await setDoc(doc(db, 'general', 'shoppingList'), {
              contentBar: updatedNotes.bar,
              contentRistorante: updatedNotes.ristorante,
              contentLavanderia: updatedNotes.lavanderia,
              contentPiscina: updatedNotes.piscina,
              contentAltro: updatedNotes.altro,
              updatedAt: new Date().toISOString()
          }, { merge: true });
      } catch (e) {
          alert("Errore salvataggio: " + e.message);
      }
      setSaving(false);
  };

  const handleClearCurrent = async () => {
      if (activeTab === 'ALL') {
          if(confirm("ATTENZIONE: Stai per svuotare TUTTE le liste spesa di tutti i reparti. Confermi che è arrivata tutta la merce?")) {
              const emptyNotes = { bar: '', ristorante: '', lavanderia: '', piscina: '', altro: '' };
              setNotes(emptyNotes);
              await saveNotes(emptyNotes);
          }
      } else {
          if(confirm(`Svuotare la lista ${SHOPPING_TABS.find(t => t.id === activeTab)?.label}?`)) {
              const newNotes = { ...notes, [activeTab]: '' };
              setNotes(newNotes);
              await saveNotes(newNotes);
          }
      }
  };

  const handleNoteChange = (text) => {
      setNotes(prev => ({ ...prev, [activeTab]: text }));
  };

  return (
      <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
          <div className="relative bg-white w-full max-w-2xl rounded-[2.5rem] overflow-hidden shadow-2xl animate-modal flex flex-col h-[90vh]">
              <div className="p-3 bg-slate-100 flex gap-2 overflow-x-auto no-scrollbar items-center border-b border-slate-200">
                  <button onClick={onClose} className="flex-shrink-0 w-12 h-12 flex items-center justify-center text-slate-400 hover:text-red-500 transition-colors bg-white rounded-2xl mr-1">
                      <Icon name="x" size={24} />
                  </button>
                  {visibleTabs.map(tab => (
                      <button 
                          key={tab.id}
                          onClick={() => setActiveTab(tab.id)} 
                          className={`flex-shrink-0 px-5 py-3 rounded-2xl font-black uppercase text-[10px] flex items-center justify-center gap-2 transition-all ${activeTab === tab.id ? `${tab.color} text-white shadow-md scale-105` : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'}`}
                      >
                          <Icon name={tab.icon} size={16} /> {tab.label}
                      </button>
                  ))}
              </div>

              <div className="flex-1 p-0 bg-white relative overflow-y-auto">
                  {activeTab === 'ALL' ? (
                      <div className="p-6 space-y-8">
                          <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter mb-4 flex items-center gap-2">
                              <Icon name="clipboard-list" size={28} /> Riepilogo Ordini
                          </h3>
                          {SHOPPING_TABS.filter(t => t.id !== 'ALL').map(tab => {
                              const content = notes[tab.id];
                              if (!content || !content.trim()) return null;
                              return (
                                  <div key={tab.id} className="border-l-4 border-slate-200 pl-4 py-1">
                                      <h4 className={`font-black uppercase text-sm ${tab.color.replace('bg-', 'text-')} mb-2 flex items-center gap-2`}>
                                          <Icon name={tab.icon} size={16} /> {tab.label}
                                      </h4>
                                      <pre className="whitespace-pre-wrap font-medium text-slate-600 text-lg leading-relaxed font-sans">
                                          {content}
                                      </pre>
                                  </div>
                              );
                          })}
                          {Object.values(notes).every(v => !v.trim()) && (
                              <div className="text-center text-slate-300 font-bold py-10 italic">
                                  Nessuna merce da ordinare al momento.
                              </div>
                          )}
                      </div>
                  ) : (
                      <textarea 
                          className="w-full h-full p-6 text-xl font-medium text-slate-700 placeholder:text-slate-300 outline-none resize-none"
                          placeholder={`Scrivi qui la lista per ${SHOPPING_TABS.find(t => t.id === activeTab)?.label}...`}
                          value={notes[activeTab] || ''}
                          onChange={(e) => handleNoteChange(e.target.value)}
                      ></textarea>
                  )}
              </div>

              <div className="p-4 border-t bg-slate-50 flex flex-col gap-3">
                  {activeTab !== 'ALL' && (
                      <button onClick={() => saveNotes()} disabled={saving} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xl hover:bg-black active:scale-95 transition-all flex items-center justify-center gap-2">
                          <Icon name="save" size={20} /> {saving ? "Salvataggio..." : "Salva Modifiche"}
                      </button>
                  )}
                  
                  <button onClick={handleClearCurrent} className="w-full bg-green-100 text-green-700 border-2 border-green-200 py-3 rounded-2xl font-black text-sm hover:bg-green-200 active:scale-95 transition-all flex items-center justify-center gap-2">
                      <Icon name="check-square" size={18} /> 
                      {activeTab === 'ALL' ? "MERCE ARRIVATA (Svuota TUTTO)" : "MERCE ARRIVATA (Svuota Lista)"}
                  </button>
              </div>
          </div>
      </div>
  );
}

// --- FINE PARTE 2 ---
// --- ITEM CARD ---
function ItemCard({ item, onUpdate, onDetails, isExpiringSoon }) {
  const isPiatti = item?.category === CATEGORIES.PIATTI;
  const isLow = !isPiatti && (item?.quantity || 0) <= (item?.minThreshold || 0);
  const meta = CATEGORIES_META[item?.category] || CATEGORIES_META[CATEGORIES.ALTRO];
  
  // Logica Dosi (Metodo Scientifico)
  const hasDose = item?.category === CATEGORIES.BAR && item?.capacity > 0 && item?.dose > 0;
  const doseFraction = hasDose ? (item.dose / item.capacity) : 0;
  
  // Se l'unità è bottiglia/pz ma vogliamo decimali, o se è Kg/Lt
  const allowDecimals = !isPiatti && (['Kg', 'Lt'].includes(item?.unit) || hasDose);

  return (
    <div className={`relative bg-white rounded-[2.5rem] border-4 transition-all duration-300 overflow-hidden ${isLow && !item.isArchived ? 'border-red-600 bg-red-50/30' : (item.isArchived ? 'border-slate-300 opacity-75' : 'border-white hover:border-slate-200 shadow-xl')}`}>
      {item.isArchived && <div className="absolute top-0 right-0 bg-yellow-400 text-black text-[9px] font-black px-3 py-1 rounded-bl-xl z-10">OBSOLETO</div>}
      
      <div className="p-8 cursor-pointer" onClick={onDetails}>
        <div className="flex justify-between items-start mb-6">
          <div className={`p-4 rounded-2xl ${meta.text} border-2 ${meta.border} bg-white shadow-sm`}><Icon name={meta.icon} size={24} strokeWidth={3} /></div>
          <div className="flex flex-col gap-1">
            {!item.isArchived && isLow && <span className="bg-red-700 text-white px-2 py-1 rounded-lg text-[8px] font-black uppercase animate-pulse">Low Stock</span>}
            {!item.isArchived && isExpiringSoon && <span className="bg-orange-600 text-white px-2 py-1 rounded-lg text-[8px] font-black uppercase">Exp Soon</span>}
          </div>
        </div>
        
        <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none mb-1 text-slate-900 line-clamp-2">{item?.name || "Articolo"}</h3>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-6 flex gap-2">
            <span>{item?.category || "Altro"}</span>
            {item?.subcategory && <span className="text-slate-500">/ {item.subcategory}</span>}
        </p>
        
        {!isPiatti && (
            <div className="flex items-baseline gap-2">
                {/* Mostra fino a 2 decimali se ci sono dosi, altrimenti intero */}
                <span className={`text-6xl font-black tracking-tighter tabular-nums ${isLow && !item.isArchived ? 'text-red-700' : 'text-slate-900'}`}>
                    {parseFloat((item?.quantity || 0).toFixed(2))}
                </span>
                <span className="text-xl font-black text-slate-400 uppercase tracking-tighter">{item?.unit || ""}</span>
            </div>
        )}
        
        {/* Visualizzatore livello bottiglia aperta (grafico a barra) se gestiamo dosi */}
        {hasDose && !item.isArchived && (
            <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-blue-500 transition-all duration-500" 
                        style={{ width: `${((item.quantity % 1) * 100).toFixed(0)}%` }}
                    ></div>
                </div>
                <span className="text-[8px] font-black text-blue-400 uppercase">Aperta</span>
            </div>
        )}

        {isPiatti && (
            <div className="flex items-center gap-2 text-slate-300 mt-2">
                <div className="h-2 w-full bg-slate-100 rounded-full"></div>
            </div>
        )}
      </div>
      
      {!item.isArchived && (
          <div className="flex flex-col bg-slate-50 border-t">
             
             {/* ZONA BAR - VENDITA A BICCHIERE */}
             {hasDose && (
                 <div className="p-2 pb-0">
                     <button 
                        onClick={(e) => {e.stopPropagation(); onUpdate(item.id, -doseFraction, 'Shot Venduto')}} 
                        className="w-full py-3 bg-blue-100 text-blue-700 border-2 border-blue-200 rounded-2xl font-black text-xs hover:bg-blue-200 active:scale-95 transition-all flex items-center justify-center gap-2"
                     >
                         <Icon name="glass-water" size={16} /> VENDI BICCHIERE (-{item.dose}ml)
                     </button>
                 </div>
             )}

             {/* TASTI STANDARD +/- (o Bottiglia intera) */}
             <div className="flex p-4 gap-4">
                {isPiatti ? (
                    <button 
                        onClick={(e) => {
                            e.stopPropagation(); 
                            onUpdate(item.id, -1);
                            const btn = e.currentTarget;
                            const originalText = btn.innerHTML;
                            btn.innerHTML = "REGISTRATO!";
                            btn.className = "w-full bg-green-600 text-white py-4 rounded-2xl font-black text-xl hover:bg-green-700 active:scale-95 transition-all";
                            setTimeout(() => {
                                btn.innerHTML = originalText;
                                btn.className = "w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xl hover:bg-black active:scale-95 transition-all";
                            }, 1000);
                        }} 
                        className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xl hover:bg-black active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        <Icon name="check-circle" size={20} /> VENDUTO
                    </button>
                ) : (
                    <>
                        <button onClick={(e) => {e.stopPropagation(); onUpdate(item.id, -1)}} className="flex-1 bg-white border-2 border-slate-200 py-4 rounded-2xl font-black text-3xl hover:bg-slate-100 active:scale-95 transition-all text-slate-400 hover:text-red-500">-</button>
                        <button onClick={(e) => {e.stopPropagation(); onUpdate(item.id, 1)}} className="flex-1 bg-slate-900 text-white py-4 rounded-2xl font-black text-3xl hover:bg-black active:scale-95 transition-all">+</button>
                    </>
                )}
             </div>
          </div>
      )}
    </div>
  );
}

// --- MODALE AGGIUNTA (CON CALCULATOR & DOSI) ---
function AddModal({ onClose, onSave, isCook, isBarista, isManager, initialData, nameSuggestions, supplierSuggestions, subcategorySuggestions }) {
  const [name, setName] = useState(initialData?.name || '');
  const [supplier, setSupplier] = useState(initialData?.supplier || '');
  const [subcategory, setSubcategory] = useState(initialData?.subcategory || '');
  
  // STATI PER IL CALCULATOR
  const [selectedCategory, setSelectedCategory] = useState(initialData?.category || (isCook ? CATEGORIES.RISTORANTE : isBarista ? CATEGORIES.BAR : CATEGORIES.RISTORANTE));
  const [costPrice, setCostPrice] = useState(initialData?.costPrice || '');
  const [sellPrice, setSellPrice] = useState(initialData?.sellPrice || '');
  
  // STATI PER DOSI (BAR)
  const [capacity, setCapacity] = useState(initialData?.capacity || '');
  const [dose, setDose] = useState(initialData?.dose || '');

  // SLIDERS
  const [foodCostPercent, setFoodCostPercent] = useState(30); // 15-40
  const [staffPercent, setStaffPercent] = useState(30); // 15-40
  const [utilityPercent, setUtilityPercent] = useState(10); // 5-20
  const [barMultiplier, setBarMultiplier] = useState(4); // 3-7

  // CALCOLO AUTOMATICO CONSIGLIATO
  const calculatorResult = useMemo(() => {
      const cost = parseFloat(costPrice);
      if (!cost || isNaN(cost)) return null;

      // LOGICA RISTORANTE (COMPLESSA)
      if (selectedCategory === CATEGORIES.RISTORANTE || selectedCategory === CATEGORIES.PIATTI) {
          const recommendedPrice = cost / (foodCostPercent / 100);
          const staffCost = recommendedPrice * (staffPercent / 100);
          const utilityCost = recommendedPrice * (utilityPercent / 100);
          const netProfit = recommendedPrice - cost - staffCost - utilityCost;
          const netProfitPercent = (netProfit / recommendedPrice) * 100;

          return {
              type: 'COMPLEX',
              recPrice: recommendedPrice,
              breakdown: { cost, staffCost, utilityCost, netProfit, netProfitPercent }
          };
      } 
      // LOGICA BAR (SEMPLICE)
      else if (selectedCategory === CATEGORIES.BAR) {
          const recommendedPrice = cost * barMultiplier;
          const drinkCost = (cost / recommendedPrice) * 100;
          const grossMargin = recommendedPrice - cost;

          return {
              type: 'SIMPLE',
              recPrice: recommendedPrice,
              breakdown: { drinkCost, grossMargin }
          };
      }
      return null;
  }, [costPrice, selectedCategory, foodCostPercent, staffPercent, utilityPercent, barMultiplier]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    
    // NOTA: Se l'input è nascosto (perché non è manager), non verrà inviato nel FormData.
    // La logica in App.jsx (Parte 1) gestirà il mantenimento dei valori vecchi.
    const formData = {
      name: name.trim(),
      category: selectedCategory,
      quantity: parseFloat(fd.get('quantity')) || 0,
      minThreshold: parseFloat(fd.get('minThreshold')) || 0,
      supplier: supplier.trim(),
      subcategory: subcategory.trim(),
      unit: fd.get('unit') || '',
      expiryDate: fd.get('expiry') || '',
      costPrice: parseFloat(costPrice) || 0,
      sellPrice: parseFloat(sellPrice) || 0,
      capacity: parseFloat(capacity) || 0,
      dose: parseFloat(dose) || 0
    };
    onSave(formData, initialData?.id);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl animate-modal flex flex-col max-h-[95vh]">
        <div className="p-6 border-b flex justify-between items-center bg-slate-50">
          <h2 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">
             {initialData ? "Modifica" : "Nuovo Carico"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors"><Icon name="x" size={32} /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto no-scrollbar">
          <Autocomplete label="Articolo" value={name} onChange={setName} suggestions={nameSuggestions} placeholder="Cerca o inserisci..." className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-slate-900 transition-all" />
          
          <div className="grid grid-cols-2 gap-4">
            <select 
                name="category" 
                disabled={!isManager} 
                className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none disabled:bg-slate-50" 
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
            >
              {Object.values(CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select name="unit" className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none" defaultValue={initialData?.unit || ""}>
              <option value="">U.M.</option>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          {/* --- SEZIONE PREZZI E CALCOLATORE (VISIBILE SOLO AI MANAGER) --- */}
          {isManager && selectedCategory !== CATEGORIES.LAVANDERIA && selectedCategory !== CATEGORIES.PISCINA && selectedCategory !== CATEGORIES.ALTRO && (
            <div className="bg-slate-50 p-4 rounded-3xl border-2 border-slate-100 space-y-4">
              <div className="flex gap-4">
                  <div className="flex-1">
                      <label className="text-[10px] font-black uppercase text-slate-500 px-2 block mb-1">Costo Acquisto (€)</label>
                      <input type="number" step="0.01" value={costPrice} onChange={e => setCostPrice(e.target.value)} className="w-full border-2 border-slate-200 rounded-xl p-3 font-bold outline-none focus:border-slate-900" placeholder="0.00" />
                  </div>
                  <div className="flex-1">
                      <label className="text-[10px] font-black uppercase text-slate-500 px-2 block mb-1">Prezzo Menu (€)</label>
                      <input type="number" step="0.01" value={sellPrice} onChange={e => setSellPrice(e.target.value)} className="w-full border-2 border-slate-200 rounded-xl p-3 font-bold outline-none focus:border-blue-600 text-blue-600" placeholder="0.00" />
                  </div>
              </div>

              {/* CALCOLATORE DINAMICO */}
              {calculatorResult && (
                  <div className={`rounded-2xl p-4 space-y-3 ${calculatorResult.type === 'COMPLEX' ? 'bg-orange-50 border border-orange-200' : 'bg-blue-50 border border-blue-200'}`}>
                      <div className="flex justify-between items-center border-b border-black/5 pb-2">
                          <span className="text-[10px] font-black uppercase tracking-widest opacity-50 flex gap-1"><Icon name="calculator" size={14} /> Analisi Prezzo</span>
                          <span className="text-xl font-black">{calculatorResult.recPrice.toFixed(2)} € <span className="text-[10px] font-bold text-slate-400">CONSIGLIATO</span></span>
                      </div>

                      {/* SLIDERS PER RISTORANTE */}
                      {calculatorResult.type === 'COMPLEX' && (
                          <div className="space-y-3 pt-2">
                              <div>
                                  <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500 mb-1">
                                      <span>Incidenza Materia ({foodCostPercent}%)</span>
                                  </div>
                                  <input type="range" min="15" max="40" value={foodCostPercent} onChange={e => setFoodCostPercent(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-orange-600" />
                              </div>
                              <div>
                                  <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500 mb-1">
                                      <span>Incidenza Staff ({staffPercent}%)</span>
                                      <span>{calculatorResult.breakdown.staffCost.toFixed(2)}€</span>
                                  </div>
                                  <input type="range" min="15" max="40" value={staffPercent} onChange={e => setStaffPercent(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-600" />
                              </div>
                              <div>
                                  <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500 mb-1">
                                      <span>Incidenza Utenze ({utilityPercent}%)</span>
                                      <span>{calculatorResult.breakdown.utilityCost.toFixed(2)}€</span>
                                  </div>
                                  <input type="range" min="5" max="20" value={utilityPercent} onChange={e => setUtilityPercent(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-400" />
                              </div>
                              <div className="mt-2 pt-2 border-t border-orange-200 flex justify-between items-center text-orange-900">
                                  <span className="text-[10px] font-black uppercase">Utile Netto Stimato</span>
                                  <span className="font-black text-lg">{calculatorResult.breakdown.netProfit.toFixed(2)}€ ({calculatorResult.breakdown.netProfitPercent.toFixed(0)}%)</span>
                              </div>
                          </div>
                      )}

                      {/* SLIDERS PER BAR */}
                      {calculatorResult.type === 'SIMPLE' && (
                          <div className="space-y-3 pt-2">
                              <div>
                                  <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500 mb-1">
                                      <span>Moltiplicatore (x{barMultiplier})</span>
                                  </div>
                                  <input type="range" min="3" max="7" step="0.5" value={barMultiplier} onChange={e => setBarMultiplier(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                              </div>
                              <div className="flex gap-2">
                                  <div className="bg-white/50 p-2 rounded-lg flex-1 text-center border border-blue-100">
                                      <span className="block text-[8px] font-black uppercase text-blue-400">Drink Cost</span>
                                      <span className="font-black text-blue-900">{calculatorResult.breakdown.drinkCost.toFixed(0)}%</span>
                                  </div>
                                  <div className="bg-white/50 p-2 rounded-lg flex-1 text-center border border-blue-100">
                                      <span className="block text-[8px] font-black uppercase text-blue-400">Margine</span>
                                      <span className="font-black text-blue-900">{calculatorResult.breakdown.grossMargin.toFixed(2)}€</span>
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
              )}
            </div>
          )}
          
          {/* --- SEZIONE DOSI (SOLO BAR E SOLO MANAGER) --- */}
          {isManager && selectedCategory === CATEGORIES.BAR && (
              <div className="bg-blue-50 p-4 rounded-3xl border-2 border-blue-100 grid grid-cols-2 gap-4">
                  <div>
                      <label className="text-[10px] font-black uppercase text-blue-400 px-2 block mb-1">Capacità (ml)</label>
                      <input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} className="w-full border-2 border-blue-100 rounded-xl p-3 font-bold outline-none focus:border-blue-600" placeholder="Es. 700" />
                  </div>
                  <div>
                      <label className="text-[10px] font-black uppercase text-blue-400 px-2 block mb-1">Dose Shot (ml)</label>
                      <input type="number" value={dose} onChange={e => setDose(e.target.value)} className="w-full border-2 border-blue-100 rounded-xl p-3 font-bold outline-none focus:border-blue-600" placeholder="Es. 40" />
                  </div>
                  <p className="col-span-2 text-[9px] text-blue-400 font-bold text-center">Compilando questi campi abiliterai il tasto "Vendi Bicchiere".</p>
              </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <input name="quantity" type="number" step="0.1" required defaultValue={initialData?.quantity || "0"} className="w-full border-4 border-slate-100 rounded-2xl p-4 text-3xl font-black focus:border-slate-900 outline-none transition-all" placeholder="Q.tà" />
            <input name="minThreshold" type="number" step="0.1" required defaultValue={initialData?.minThreshold || "0"} className="w-full border-4 border-slate-100 rounded-2xl p-4 text-3xl font-black focus:border-slate-900 outline-none transition-all" placeholder="Soglia" />
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

function DetailModal({ item, onClose, onDelete, onEdit, onToggleArchive, onUpdate, isManager }) {
  const isPiatti = item?.category === CATEGORIES.PIATTI;
  const isLow = !isPiatti && (item?.quantity || 0) <= (item?.minThreshold || 0);
  const meta = CATEGORIES_META[item?.category] || CATEGORIES_META[CATEGORIES.ALTRO];

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="relative bg-white w-11/12 max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl animate-modal flex flex-col">
        <div className="p-8 pb-2">
          <div className="flex justify-between items-start">
             <div className={`px-4 py-2 rounded-xl inline-flex ${meta.color} text-white text-[10px] font-black uppercase mb-4 shadow-md`}><Icon name={meta.icon} size={14} className="mr-2" /> {item?.category}</div>
             {isManager && (
               <button onClick={onEdit} className="bg-blue-50 text-blue-600 p-3 rounded-xl border border-blue-100 hover:bg-blue-100 transition-all flex items-center gap-2 font-black text-[10px] uppercase">
                 <Icon name="pencil" size={16} /> Modifica
               </button>
             )}
          </div>
          <h2 className="text-3xl font-black uppercase italic tracking-tighter leading-none text-slate-900">{item?.name}</h2>
          {item?.subcategory && <p className="text-lg font-bold text-slate-500 mt-1 flex items-center gap-1"><Icon name="tag" size={14} /> {item.subcategory}</p>}
          
          {!isPiatti && !item.isArchived && (
            <div className={`mt-6 p-6 rounded-[2rem] border-4 flex flex-col items-center justify-center ${isLow ? 'bg-red-50 border-red-600' : 'bg-slate-50 border-slate-200'}`}>
                <p className={`text-[10px] font-black uppercase mb-1 ${isLow ? 'text-red-700' : 'text-slate-400'}`}>Giacenza Attuale</p>
                <div className="flex items-baseline gap-2">
                <span className={`text-6xl font-black tracking-tighter tabular-nums ${isLow ? 'text-red-600' : 'text-slate-900'}`}>{item?.quantity || 0}</span>
                <span className="text-2xl font-black uppercase text-slate-400">{item?.unit || ""}</span>
                </div>
            </div>
          )}
          {isPiatti && !item.isArchived && (
              <div className="mt-6 p-6 rounded-[2rem] border-4 bg-slate-50 border-slate-200 text-center flex flex-col items-center justify-center gap-3">
                  <div>
                    <p className="text-slate-500 font-bold italic">Prodotto "A Flusso"</p>
                    <p className="text-xs text-slate-400">La quantità non viene tracciata, solo le vendite.</p>
                  </div>
                  <button onClick={() => { onUpdate(item.id, 1); onClose(); }} className="px-4 py-2 bg-red-50 text-red-600 rounded-xl font-black text-[10px] uppercase border border-red-100 hover:bg-red-100 flex items-center gap-2">
                      <Icon name="undo-2" size={14} /> Annulla Errore (+1)
                  </button>
              </div>
          )}
          {item.isArchived && (
              <div className="mt-6 p-6 rounded-[2rem] border-4 bg-yellow-50 border-yellow-400 text-center">
                  <p className="text-yellow-700 font-black italic">PRODOTTO OBSOLETO</p>
                  <p className="text-xs text-yellow-600">Attualmente nascosto dal menu attivo.</p>
              </div>
          )}

        </div>
        <div className="p-8 pt-4 space-y-4">
          
          <div className="p-5 rounded-2xl border-2 bg-slate-50 border-slate-200"><p className="text-[10px] font-black uppercase text-slate-400 mb-1 flex items-center gap-2"><Icon name="truck" size={14} /> Fornitore</p><p className="text-xl font-black text-slate-900 uppercase truncate">{item?.supplier || "Non specificato"}</p></div>
          {item?.expiryDate && <div className="p-5 rounded-2xl border-2 bg-orange-50 border-orange-200 text-orange-900"><p className="text-[10px] font-black uppercase mb-1 flex items-center gap-2"><Icon name="calendar" size={14} /> Scadenza</p><p className="text-xl font-black uppercase">{new Date(item.expiryDate).toLocaleDateString('it-IT')}</p></div>}
          
          <div className="flex gap-3 pt-4 flex-col">
            {isManager && item.category === CATEGORIES.PIATTI && (
                <button 
                    onClick={onToggleArchive} 
                    className={`p-4 rounded-2xl font-black text-sm uppercase flex items-center justify-center gap-2 transition-all ${item.isArchived ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'}`}
                >
                    <Icon name={item.isArchived ? "refresh-cw" : "archive"} size={18} />
                    {item.isArchived ? "RIPRISTINA NEL MENU" : "RENDI OBSOLETO"}
                </button>
            )}

            <div className="flex gap-3">
                {isManager && <button onClick={() => onDelete(item.id)} className="p-5 bg-red-50 text-red-600 rounded-2xl font-black border-2 border-red-100 hover:bg-red-100 transition-all"><Icon name="trash-2" size={24} /></button>}
                <button onClick={onClose} className="flex-1 bg-slate-200 text-slate-700 p-5 rounded-2xl font-black text-xl uppercase tracking-tighter hover:bg-slate-300 transition-all">CHIUDI</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatsModal({ onClose, items }) {
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [reportData, setReportData] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reportSearchQuery, setReportSearchQuery] = useState('');

  const generateReport = async () => {
    setLoading(true);
    try {
      const logsRef = collection(db, 'logs');
      const q = query(logsRef, orderBy('date', 'desc')); 
      const snapshot = await getDocs(q);
      
      const start = new Date(startDate); start.setHours(0,0,0,0);
      const end = new Date(endDate); end.setHours(23,59,59,999);

      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
      const isMonthlyMode = diffDays > 60; 

      const grouped = {};
      const chartGrouped = {}; 

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

          const matchesQuery = reportSearchQuery ? log.itemName.toLowerCase().includes(reportSearchQuery.toLowerCase()) : true;

          if (log.quantityChange < 0 && matchesQuery) { 
              let key;
              if (isMonthlyMode) {
                  key = logDate.toISOString().slice(0, 7); 
              } else {
                  key = logDate.toISOString().slice(0, 10); 
              }

              if (!chartGrouped[key]) chartGrouped[key] = 0;
              chartGrouped[key] += Math.abs(log.quantityChange);
          }
        }
      });

      const finalReport = Object.values(grouped).map(i => ({
         ...i,
         loaded: parseFloat(i.loaded.toFixed(2)),
         sold: parseFloat(i.sold.toFixed(2))
      })).sort((a,b) => b.sold - a.sold);
      setReportData(finalReport);

      const chartArray = Object.keys(chartGrouped).map(key => {
          let label = key;
          if (isMonthlyMode) {
              const [y, m] = key.split('-');
              const dateObj = new Date(parseInt(y), parseInt(m)-1, 1);
              label = dateObj.toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }); 
          } else {
              const [y, m, d] = key.split('-');
              label = `${d}/${m}`; 
          }

          return {
              sortKey: key, 
              date: label,  
              vendite: parseFloat(chartGrouped[key].toFixed(2))
          };
      });
      
      chartArray.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

      setChartData(chartArray);

    } catch (err) {
      alert("Errore generazione report: " + err.message);
    }
    setLoading(false);
  };

  useEffect(() => {
      if (reportData.length > 0) generateReport();
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportSearchQuery]);

  const filteredReportData = useMemo(() => {
    if (!reportSearchQuery) return reportData;
    return reportData.filter(item => 
        item.name.toLowerCase().includes(reportSearchQuery.toLowerCase())
    );
  }, [reportData, reportSearchQuery]);

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-4xl rounded-[2.5rem] overflow-hidden shadow-2xl animate-modal flex flex-col max-h-[95vh]">
        <div className="p-8 border-b bg-slate-900 text-white flex justify-between items-center">
          <div>
             <h2 className="text-2xl font-black uppercase italic tracking-tighter text-yellow-400">Report Vendite</h2>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Analisi Movimenti</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><Icon name="x" size={32} /></button>
        </div>

        <div className="p-6 bg-slate-50 border-b space-y-4">
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
            
            <div className="relative">
                <Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Cerca prodotto per filtrare grafico e tabella..." 
                    value={reportSearchQuery}
                    onChange={(e) => setReportSearchQuery(e.target.value)}
                    className="w-full p-3 pl-10 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-700 focus:border-blue-600 outline-none transition-colors placeholder:font-medium"
                />
            </div>
        </div>

        {chartData.length > 0 && (
            <div className="h-64 w-full bg-white p-4 border-b border-slate-100">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-2 text-center">
                    Andamento Vendite {reportSearchQuery ? `"${reportSearchQuery}"` : "Totali"}
                </p>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{fontSize: 10, fill: '#64748b'}} axisLine={false} tickLine={false} />
                        <YAxis tick={{fontSize: 10, fill: '#64748b'}} axisLine={false} tickLine={false} />
                        <Tooltip 
                            contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}}
                            cursor={{fill: '#f1f5f9'}}
                        />
                        <Bar dataKey="vendite" fill="#0f172a" radius={[4, 4, 0, 0]}>
                             {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.vendite > 10 ? '#2563eb' : '#0f172a'} />
                             ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        )}

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
