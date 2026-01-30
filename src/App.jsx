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
  setDoc,
  increment
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
  Undo2, Calculator, Wallet, GlassWater, 
  Store, // Icona Magazzino
  LayoutGrid, // Icona Menù
  Link as LinkIcon // Icona per il collegamento
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
  'undo-2': Undo2, 'calculator': Calculator, 'wallet': Wallet, 'glass-water': GlassWater,
  'store': Store, 'layout-grid': LayoutGrid, 'link': LinkIcon
};

const Icon = ({ name, size = 20, className = "", strokeWidth = 2.5 }) => {
  const LucideIcon = ICON_MAP[name] || Package;
  return <LucideIcon size={size} className={className} strokeWidth={strokeWidth} />;
};

// --- COSTANTI ---
// Categorie "Fisiche" (Magazzino)
const WAREHOUSE_CATEGORIES = {
  BAR: 'Bar (Stock)',
  CUCINA: 'Cucina (Stock)',
  LAVANDERIA: 'Lavanderia',
  PISCINA: 'Piscina',
  ALTRO: 'Altro'
};

// Categoria Speciale per il Menù (Front Office)
const MENU_CATEGORY = 'MENU_ITEM';

const SECTIONS = {
  WAREHOUSE: 'Magazzino',
  MENU: 'Menù Vendita'
};

const MENU_TYPES = {
  DIRECT: 'Prodotto Diretto', // Es. Coca Cola (Scala magazzino)
  DISH: 'Piatto/Ricetta'      // Es. Carbonara (Solo Food Cost)
};

const UNITS = ['Pz', 'Kg', 'Lt', 'Pacchi', 'Porzioni', 'Bottiglie'];

const CATEGORIES_META = {
  [WAREHOUSE_CATEGORIES.BAR]: { icon: 'wine', color: 'bg-blue-700', text: 'text-blue-900', border: 'border-blue-300' },
  [WAREHOUSE_CATEGORIES.CUCINA]: { icon: 'utensils', color: 'bg-orange-600', text: 'text-orange-900', border: 'border-orange-300' },
  [WAREHOUSE_CATEGORIES.LAVANDERIA]: { icon: 'bed', color: 'bg-purple-700', text: 'text-purple-900', border: 'border-purple-300' },
  [WAREHOUSE_CATEGORIES.PISCINA]: { icon: 'waves', color: 'bg-cyan-700', text: 'text-cyan-900', border: 'border-cyan-300' },
  [WAREHOUSE_CATEGORIES.ALTRO]: { icon: 'package', color: 'bg-slate-700', text: 'text-slate-900', border: 'border-slate-300' },
  [MENU_CATEGORY]: { icon: 'layout-grid', color: 'bg-emerald-600', text: 'text-emerald-900', border: 'border-emerald-300' }
};

// --- CONFIGURAZIONE TAB LISTA SPESA ---
const SHOPPING_TABS = [
    { id: 'ALL', label: 'TUTTO', icon: 'clipboard-list', color: 'bg-slate-800' },
    { id: 'bar', label: 'BAR', icon: 'wine', color: 'bg-blue-700' },
    { id: 'cucina', label: 'CUCINA', icon: 'utensils', color: 'bg-orange-600' },
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
const logTransaction = async (itemName, category, quantityChange, userRole, note = '', revenue = 0, cost = 0) => {
  try {
    await addDoc(collection(db, 'logs'), {
      itemName,
      category,
      quantityChange,
      revenue, // Incasso generato
      cost,    // Costo stimato o reale
      userRole,
      note,
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
  
  // STATI DI NAVIGAZIONE
  const [activeSection, setActiveSection] = useState(SECTIONS.MENU); // Default: Menù
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
      // Imposta la vista di default in base al ruolo
      if (u) {
          if (u.email === 'cuoco@lucciole.app' || u.email === 'barista@lucciole.app') {
              setActiveSection(SECTIONS.MENU); // Staff parte dal Menù
          } else {
              setActiveSection(SECTIONS.WAREHOUSE); // Admin parte dal Magazzino
          }
      }
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

  // --- SALVATAGGIO (Gestisce sia Magazzino che Menù) ---
  const handleSaveItem = async (formData, docId = null) => {
    try {
      // Dati comuni
      const payload = {
          name: formData.name,
          category: formData.category, // Può essere 'MENU_ITEM' o una categoria stock
          subcategory: formData.subcategory || "",
          
          // Dati specifici per Menù
          menuType: formData.menuType || null, // DIRECT o DISH
          linkedProductId: formData.linkedProductId || null, // ID del prodotto magazzino collegato
          
          // Dati specifici per Magazzino
          supplier: formData.supplier || "",
          unit: formData.unit || "",
          expiryDate: formData.expiryDate || "",
          
          // Quantità (Stock per Magazzino, 0 per Menù solitamente)
          quantity: formData.quantity !== undefined ? formData.quantity : 0,
          minThreshold: formData.minThreshold || 0,
          
          // Prezzi (Visibili solo a Manager)
          costPrice: formData.costPrice, 
          sellPrice: formData.sellPrice,
          
          // Dosi (per Bar Stock)
          capacity: formData.capacity,
          dose: formData.dose
      };

      if (docId) {
        await updateDoc(doc(db, 'inventory', docId), payload);
        await logTransaction(formData.name, activeSection, 0, userRole + " (Edit)");
      } else {
        await addDoc(collection(db, 'inventory'), payload);
        await logTransaction(formData.name, activeSection, formData.quantity || 0, userRole);
      }
      setIsAddModalOpen(false);
      setItemToEdit(null);
    } catch (err) {
      alert("Errore salvataggio: " + err.message);
    }
  };

  // --- GESTIONE VENDITA (IL PONTE TRA MENU E MAGAZZINO) ---
  const handleSellItem = async (menuItem) => {
      try {
          // 1. Registra la vendita (Log Finanziario)
          // Se NON sono manager, non vedo i costi, ma il sistema li registra comunque dai dati dell'item
          const revenue = menuItem.sellPrice || 0;
          const estimatedCost = menuItem.costPrice || 0; // Food Cost o Costo Acquisto

          await logTransaction(
              menuItem.name, 
              'VENDITA', 
              -1, 
              userRole, 
              'Vendita da Menù', 
              revenue, 
              estimatedCost
          );

          // 2. Il Ponte: Scarica il magazzino se necessario
          if (menuItem.menuType === 'DIRECT' && menuItem.linkedProductId) {
              const linkedItemRef = doc(db, 'inventory', menuItem.linkedProductId);
              
              // Verifica che il prodotto esista ancora
              const linkedSnap = await getDoc(linkedItemRef);
              if (linkedSnap.exists()) {
                  // Scala 1 unità dal magazzino (es. 1 Coca Cola)
                  await updateDoc(linkedItemRef, {
                      quantity: increment(-1)
                  });
              } else {
                  console.warn("Prodotto collegato non trovato in magazzino");
              }
          }

          // Feedback visivo (opzionale, gestito nel componente card)
          return true;
      } catch (err) {
          console.error("Errore vendita:", err);
          alert("Errore registrazione vendita");
          return false;
      }
  };

  // --- UPDATE QTY (Solo per Magazzino: Carico/Scarico merce/Rotture) ---
  const updateQty = async (id, delta, note = '') => {
    const item = items.find(i => i.id === id);
    if (!item) return;

    // Se stiamo nel Menù, non usiamo questa funzione per vendere (si usa handleSellItem)
    // Questa serve solo per modifiche stock manuali
    try {
      const newQty = Math.max(0, parseFloat((item.quantity + delta).toFixed(4)));
      await updateDoc(doc(db, 'inventory', id), {
        quantity: newQty
      });
      await logTransaction(item.name, item.category, delta, userRole, note || 'Rettifica Stock');
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

  // --- FILTRI INTELLIGENTI (Divisi per Sezione) ---
  const filteredItems = useMemo(() => {
    let list = items || [];

    // Filtro Archivio
    if (showArchived) list = list.filter(i => i.isArchived === true);
    else list = list.filter(i => !i.isArchived); 

    // Filtro SEZIONE (Menù vs Magazzino)
    if (activeSection === SECTIONS.MENU) {
        // Mostra solo elementi del menu
        list = list.filter(i => i.category === MENU_CATEGORY);
    } else {
        // Mostra solo elementi magazzino (quindi NON menu)
        list = list.filter(i => i.category !== MENU_CATEGORY);
    }

    // Filtro Categoria Magazzino (se attivo)
    if (activeSection === SECTIONS.WAREHOUSE) {
        if (isCook) list = list.filter(i => i.category === WAREHOUSE_CATEGORIES.CUCINA);
        else if (isBarista) list = list.filter(i => i.category === WAREHOUSE_CATEGORIES.BAR);
        else if (activeCategory !== 'TUTTI') list = list.filter(i => i.category === activeCategory);
        
        // Filtri Stock/Scadenza (hanno senso solo in magazzino)
        if (filterMode === 'LOW_STOCK') list = list.filter(i => (i.quantity || 0) <= (i.minThreshold || 0));
        if (filterMode === 'EXPIRING') list = list.filter(i => checkExpiring(i.expiryDate));
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(i => 
        (i.name || "").toLowerCase().includes(q) || 
        (i.supplier || "").toLowerCase().includes(q) ||
        (i.subcategory || "").toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [items, activeSection, activeCategory, filterMode, searchQuery, isCook, isBarista, showArchived]);

  const lowStockCount = useMemo(() => items.filter(i => !i.isArchived && i.category !== MENU_CATEGORY && (i.quantity || 0) <= (i.minThreshold || 0)).length, [items]);
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
  <div className="min-h-screen pb-44 bg-slate-50">
    <header className={`p-6 shadow-xl transition-colors ${showArchived ? 'bg-slate-800 border-b-4 border-yellow-500' : 'bg-slate-900 text-white'}`}>
      <div className="flex justify-between items-center mb-6">
          <div>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter text-yellow-400 leading-none">Lucciole</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              {showArchived ? "ARCHIVIO OBSOLETI" : "Gestionale"}
          </p>
          </div>
          <div className="flex gap-2">
              {isManager && (
                  <button 
                      onClick={() => { setShowArchived(!showArchived); setActiveCategory('TUTTI'); }} 
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
      </div>

      {/* --- NAVIGAZIONE SEZIONI (MENU vs MAGAZZINO) --- */}
      {!showArchived && (
          <div className="bg-slate-800 p-1 rounded-2xl flex relative z-10">
              <button 
                  onClick={() => { setActiveSection(SECTIONS.MENU); setFilterMode('ALL'); }}
                  className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeSection === SECTIONS.MENU ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                  <Icon name="layout-grid" size={16} /> Menù (Vendita)
              </button>
              <button 
                  onClick={() => { setActiveSection(SECTIONS.WAREHOUSE); setFilterMode('ALL'); }}
                  className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeSection === SECTIONS.WAREHOUSE ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}
              >
                  <Icon name="store" size={16} /> Magazzino (Stock)
              </button>
          </div>
      )}
    </header>
    
    {/* AVVISI (Visibili solo in Magazzino) */}
    {!isCook && !isBarista && !showArchived && activeSection === SECTIONS.WAREHOUSE && (
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
              ⚠️ Stai visualizzando i prodotti obsoleti.
          </div>
      )}

      {/* BARRA DI RICERCA */}
      <div className="relative group">
        <Icon name="search" size={24} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 z-50 group-focus-within:text-slate-900" />
        <Autocomplete 
          value={searchQuery} onChange={setSearchQuery} 
          suggestions={[...new Set(items.map(i => i.name || ""))]} 
          placeholder={activeSection === SECTIONS.MENU ? "Cerca nel menù..." : "Cerca in magazzino..."} 
          className="w-full bg-white border-4 border-slate-200 rounded-[2rem] p-6 pl-14 text-xl font-black focus:border-slate-900 outline-none shadow-hard" 
        />
      </div>

      {/* FILTRI CATEGORIE (Solo se siamo in MAGAZZINO) */}
      {activeSection === SECTIONS.WAREHOUSE && !isCook && !isBarista && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          <button onClick={() => {setActiveCategory('TUTTI'); setFilterMode('ALL');}} className={`flex-shrink-0 px-6 py-4 rounded-[1.5rem] font-black text-[11px] uppercase transition-all ${activeCategory === 'TUTTI' && filterMode === 'ALL' ? 'bg-slate-900 text-white shadow-lg scale-105' : 'bg-white text-slate-400 border-2 border-slate-100'}`}>TUTTI</button>
          {Object.values(WAREHOUSE_CATEGORIES).map(cat => (
            <button key={cat} onClick={() => {setActiveCategory(cat); setFilterMode('ALL');}} className={`flex-shrink-0 px-6 py-4 rounded-[1.5rem] font-black text-[11px] uppercase flex items-center gap-2 transition-all ${activeCategory === cat ? `${CATEGORIES_META[cat].color} text-white shadow-lg scale-105` : 'bg-white text-slate-400 border-2 border-slate-100'}`}>
              <Icon name={CATEGORIES_META[cat].icon} size={16} /> {cat.split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      {/* GRIGLIA PRODOTTI */}
      {filteredItems.length === 0 ? (
          <div className="text-center py-20 opacity-50 font-black italic uppercase text-slate-400">
              Nessun elemento trovato in {activeSection}
          </div>
      ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
          {filteredItems.map(item => (
              <ItemCard 
                  key={item.id} 
                  item={item} 
                  activeSection={activeSection} // Passiamo la sezione attiva per decidere l'aspetto
                  onUpdate={updateQty} 
                  onSell={handleSellItem} // Nuova funzione per la vendita
                  onDetails={() => setSelectedItem(item)} 
                  isExpiringSoon={checkExpiring(item.expiryDate)} 
              />
          ))}
          </div>
      )}
    </main>

    {/* TASTI BASSO */}
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-11/12 max-w-sm flex gap-3 z-[200]">
        {/* Mostra "+" solo se Manager OPPURE se siamo in Magazzino (Staff può caricare stock, ma non creare menù) */}
        {!showArchived && (isManager || activeSection === SECTIONS.WAREHOUSE) && (
          <button onClick={openNewItemModal} className={`flex-1 text-white px-6 py-4 rounded-full shadow-[0_4px_14px_0_rgba(0,0,0,0.2)] flex items-center justify-center gap-3 active:scale-95 hover:-translate-y-1 transition-all font-black uppercase tracking-widest text-sm ${activeSection === SECTIONS.MENU ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
              <Icon name="plus" size={24} strokeWidth={3} /> {activeSection === SECTIONS.MENU ? "Voce Menù" : "Carico"}
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
        activeSection={activeSection} // Passiamo la sezione per sapere cosa stiamo creando
        // Passiamo la lista completa degli items per il "Ponte" (collegamento prodotti)
        allItems={items} 
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
        onDelete={async (id) => { if(confirm("Eliminare definitivamente?")) { await deleteDoc(doc(db, 'inventory', id)); setSelectedItem(null); } }} 
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
      if (isCook) return SHOPPING_TABS.filter(t => t.id === 'cucina');
      if (isBarista) return SHOPPING_TABS.filter(t => t.id === 'bar');
      return SHOPPING_TABS; 
  }, [isCook, isBarista]);

  const [activeTab, setActiveTab] = useState(() => {
      if (isCook) return 'cucina';
      if (isBarista) return 'bar';
      return 'ALL';
  });

  const [notes, setNotes] = useState({
      bar: '',
      cucina: '',
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
                  cucina: data.contentRistorante || '', // Mappato sul vecchio campo per compatibilità o nuovo
                  lavanderia: data.contentLavanderia || '', 
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
              contentRistorante: updatedNotes.cucina, // Salviamo come ristorante per retrocompatibilità
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
          if(confirm("ATTENZIONE: Svuoti TUTTO?")) {
              const emptyNotes = { bar: '', cucina: '', lavanderia: '', piscina: '', altro: '' };
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
// --- ITEM CARD (POLIMORFICA: VENDITA vs STOCK) ---
function ItemCard({ item, activeSection, onUpdate, onSell, onDetails, isExpiringSoon }) {
  const isMenu = activeSection === 'Menù Vendita'; // Stringa deve coincidere con SECTIONS.MENU
  const meta = isMenu 
    ? CATEGORIES_META['MENU_ITEM'] 
    : (CATEGORIES_META[item?.category] || CATEGORIES_META['Altro']);
  
  const isLow = !isMenu && (item?.quantity || 0) <= (item?.minThreshold || 0);

  // --- LOGICA VENDITA (Button Animation) ---
  const [sellState, setSellState] = useState('IDLE'); // IDLE, SUCCESS, ERROR
  
  const handleSellClick = async (e) => {
      e.stopPropagation();
      setSellState('LOADING');
      const success = await onSell(item);
      if (success) {
          setSellState('SUCCESS');
          setTimeout(() => setSellState('IDLE'), 1500);
      } else {
          setSellState('ERROR');
          setTimeout(() => setSellState('IDLE'), 1500);
      }
  };

  return (
    <div className={`relative bg-white rounded-[2.5rem] border-4 transition-all duration-300 overflow-hidden ${isLow && !item.isArchived ? 'border-red-600 bg-red-50/30' : (item.isArchived ? 'border-slate-300 opacity-75' : 'border-white hover:border-slate-200 shadow-xl')}`}>
      {item.isArchived && <div className="absolute top-0 right-0 bg-yellow-400 text-black text-[9px] font-black px-3 py-1 rounded-bl-xl z-10">OBSOLETO</div>}
      
      <div className="p-8 cursor-pointer" onClick={onDetails}>
        <div className="flex justify-between items-start mb-6">
          <div className={`p-4 rounded-2xl ${meta.text} border-2 ${meta.border} bg-white shadow-sm`}><Icon name={meta.icon} size={24} strokeWidth={3} /></div>
          
          {/* Badge Tipo (Solo Menu) o Avvisi (Solo Magazzino) */}
          <div className="flex flex-col gap-1 items-end">
            {isMenu && (
                <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest">
                    {item.menuType === 'DIRECT' ? 'Prodotto' : 'Piatto'}
                </span>
            )}
            {!isMenu && !item.isArchived && isLow && <span className="bg-red-700 text-white px-2 py-1 rounded-lg text-[8px] font-black uppercase animate-pulse">Sotto Scorta</span>}
            {!isMenu && !item.isArchived && isExpiringSoon && <span className="bg-orange-600 text-white px-2 py-1 rounded-lg text-[8px] font-black uppercase">In Scadenza</span>}
          </div>
        </div>
        
        <h3 className="text-2xl font-black uppercase italic tracking-tighter leading-none mb-1 text-slate-900 line-clamp-2">{item?.name || "Articolo"}</h3>
        
        {/* Sottotitolo differenziato */}
        {isMenu ? (
             // Nel menu mostriamo il prezzo (è pubblico per i clienti, quindi il cameriere deve saperlo)
             <p className="text-xl font-black text-slate-900 mt-2">{item.sellPrice ? `€ ${item.sellPrice.toFixed(2)}` : 'Prezzo N.D.'}</p>
        ) : (
            // Nel magazzino mostriamo la categoria
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-6 flex gap-2">
                <span>{item?.category}</span>
                {item?.subcategory && <span className="text-slate-500">/ {item.subcategory}</span>}
            </p>
        )}

        {/* Quantità (Solo Magazzino) */}
        {!isMenu && (
            <div className="flex items-baseline gap-2">
                <span className={`text-6xl font-black tracking-tighter tabular-nums ${isLow && !item.isArchived ? 'text-red-700' : 'text-slate-900'}`}>
                    {parseFloat((item?.quantity || 0).toFixed(2))}
                </span>
                <span className="text-xl font-black text-slate-400 uppercase tracking-tighter">{item?.unit || ""}</span>
            </div>
        )}
      </div>
      
      {/* --- FOOTER CARD --- */}
      {!item.isArchived && (
          <div className="flex flex-col bg-slate-50 border-t p-4">
             {isMenu ? (
                 // --- MODALITÀ MENÙ (TASTO VENDITA) ---
                 <button 
                    onClick={handleSellClick}
                    disabled={sellState !== 'IDLE'}
                    className={`w-full py-4 rounded-2xl font-black text-xl flex items-center justify-center gap-2 transition-all active:scale-95 ${
                        sellState === 'SUCCESS' ? 'bg-green-500 text-white' : 
                        sellState === 'ERROR' ? 'bg-red-500 text-white' : 
                        'bg-slate-900 text-white hover:bg-black'
                    }`}
                 >
                    {sellState === 'SUCCESS' ? <><Icon name="check-circle" /> VENDUTO!</> : 
                     sellState === 'ERROR' ? "ERRORE" : "VENDI"}
                 </button>
             ) : (
                 // --- MODALITÀ MAGAZZINO (STOCK) ---
                 <div className="flex gap-4">
                    <button onClick={(e) => {e.stopPropagation(); onUpdate(item.id, -1)}} className="flex-1 bg-white border-2 border-slate-200 py-3 rounded-2xl font-black text-2xl hover:bg-slate-100 active:scale-95 transition-all text-slate-400 hover:text-red-500">-</button>
                    <button onClick={(e) => {e.stopPropagation(); onUpdate(item.id, 1)}} className="flex-1 bg-slate-900 text-white py-3 rounded-2xl font-black text-2xl hover:bg-black active:scale-95 transition-all">+</button>
                 </div>
             )}
          </div>
      )}
    </div>
  );
}

// --- MODALE AGGIUNTA (MAGAZZINO & MENÙ) ---
function AddModal({ onClose, onSave, isCook, isBarista, isManager, activeSection, allItems, initialData, nameSuggestions, supplierSuggestions, subcategorySuggestions }) {
  const isMenuMode = activeSection === 'Menù Vendita'; 

  // Stati Comuni
  const [name, setName] = useState(initialData?.name || '');
  
  // Stati Magazzino
  const [category, setCategory] = useState(initialData?.category || (isCook ? 'Cucina (Stock)' : 'Bar (Stock)')); 
  const [supplier, setSupplier] = useState(initialData?.supplier || '');
  const [subcategory, setSubcategory] = useState(initialData?.subcategory || '');
  
  // Stati Menù
  const [menuType, setMenuType] = useState(initialData?.menuType || 'DISH'); // DISH o DIRECT
  const [linkedProductId, setLinkedProductId] = useState(initialData?.linkedProductId || '');

  // Prezzi & Stock
  const [quantity, setQuantity] = useState(initialData?.quantity || '');
  const [minThreshold, setMinThreshold] = useState(initialData?.minThreshold || '');
  const [costPrice, setCostPrice] = useState(initialData?.costPrice || '');
  const [sellPrice, setSellPrice] = useState(initialData?.sellPrice || '');

  // Filtra items per il collegamento (Escludi voci menu)
  const warehouseItems = useMemo(() => allItems.filter(i => i.category !== 'MENU_ITEM'), [allItems]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);

    // Preparazione dati in base alla sezione
    const finalCategory = isMenuMode ? 'MENU_ITEM' : category;

    const formData = {
      name: name.trim(),
      category: finalCategory,
      
      // Se Menu, usiamo menuType, altrimenti null
      menuType: isMenuMode ? menuType : null,
      linkedProductId: isMenuMode && menuType === 'DIRECT' ? linkedProductId : null,

      // Magazzino info
      supplier: !isMenuMode ? supplier.trim() : "",
      subcategory: !isMenuMode ? subcategory.trim() : "",
      unit: fd.get('unit') || '',
      expiryDate: fd.get('expiry') || '',

      // Numeri
      quantity: !isMenuMode ? (parseFloat(quantity) || 0) : 0, 
      minThreshold: !isMenuMode ? (parseFloat(minThreshold) || 0) : 0,

      // Prezzi (Gestiti da Manager: se non manager, mantieni vecchi)
      costPrice: isManager ? (parseFloat(costPrice) || 0) : (initialData?.costPrice || 0),
      sellPrice: isManager ? (parseFloat(sellPrice) || 0) : (initialData?.sellPrice || 0),
      
      // Mantieni vecchi valori tecnici
      capacity: initialData?.capacity || 0,
      dose: initialData?.dose || 0
    };
    onSave(formData, initialData?.id);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-lg rounded-[2.5rem] overflow-hidden shadow-2xl animate-modal flex flex-col max-h-[95vh]">
        <div className="p-6 border-b flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">
                {initialData ? "Modifica" : (isMenuMode ? "Nuova Voce Menù" : "Nuovo Carico")}
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {isMenuMode ? "Configurazione Vendita" : "Gestione Stock"}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors"><Icon name="x" size={32} /></button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto no-scrollbar">
          
          {/* 1. NOME (Comune) */}
          <Autocomplete label="Nome Prodotto" value={name} onChange={setName} suggestions={nameSuggestions} placeholder="Es. Coca Cola / Carbonara" className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-slate-900 transition-all" />

          {/* --- SCENARIO A: MODALITÀ MENÙ (Solo Manager vede config avanzata) --- */}
          {isMenuMode && (
              <div className="space-y-4">
                  {/* Tipo di Voce Menu (Solo Manager può cambiare struttura logica) */}
                  {isManager && (
                      <div className="bg-emerald-50 p-4 rounded-3xl border-2 border-emerald-100 space-y-4">
                          <p className="text-[10px] font-black uppercase text-emerald-600 mb-2 flex gap-2"><Icon name="link" size={14} /> Configurazione Prodotto</p>
                          <div className="flex gap-2">
                              <button type="button" onClick={() => setMenuType('DIRECT')} className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase ${menuType === 'DIRECT' ? 'bg-emerald-600 text-white shadow-md' : 'bg-white text-emerald-800 border border-emerald-200'}`}>Prodotto Diretto</button>
                              <button type="button" onClick={() => setMenuType('DISH')} className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase ${menuType === 'DISH' ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-orange-800 border border-orange-200'}`}>Piatto / Ricetta</button>
                          </div>

                          {menuType === 'DIRECT' ? (
                              <div>
                                  <label className="text-[10px] font-black uppercase text-emerald-600 px-2 block mb-1">Collega a Stock Magazzino</label>
                                  <select 
                                    className="w-full border-2 border-emerald-200 rounded-xl p-3 font-bold text-slate-700 outline-none focus:border-emerald-600 bg-white"
                                    value={linkedProductId}
                                    onChange={(e) => setLinkedProductId(e.target.value)}
                                  >
                                      <option value="">-- Seleziona Prodotto --</option>
                                      {warehouseItems.map(wi => (
                                          <option key={wi.id} value={wi.id}>{wi.name} (Qta: {wi.quantity})</option>
                                      ))}
                                  </select>
                                  <p className="text-[9px] text-emerald-600 mt-1 px-2">Alla vendita, verrà scalata 1 unità da questo prodotto.</p>
                              </div>
                          ) : (
                              <div>
                                  <label className="text-[10px] font-black uppercase text-orange-600 px-2 block mb-1">Food Cost Stimato (€)</label>
                                  <input type="number" step="0.01" value={costPrice} onChange={e => setCostPrice(e.target.value)} className="w-full border-2 border-orange-200 rounded-xl p-3 font-bold outline-none focus:border-orange-500" placeholder="Es. 3.00" />
                                  <p className="text-[9px] text-orange-600 mt-1 px-2">Costo medio materie prime per il calcolo margini.</p>
                              </div>
                          )}
                      </div>
                  )}

                  {/* Prezzo Vendita (Fondamentale per il menu - Manager Only) */}
                  {isManager && (
                    <div>
                        <label className="text-[10px] font-black uppercase text-slate-500 px-2 block mb-1">Prezzo di Vendita (€)</label>
                        <input type="number" step="0.10" required value={sellPrice} onChange={e => setSellPrice(e.target.value)} className="w-full border-4 border-slate-100 rounded-2xl p-4 text-3xl font-black focus:border-emerald-500 text-emerald-600 outline-none transition-all" placeholder="0.00" />
                    </div>
                  )}
              </div>
          )}

          {/* --- SCENARIO B: MODALITÀ MAGAZZINO (Standard Stock) --- */}
          {!isMenuMode && (
              <>
                <div className="grid grid-cols-2 gap-4">
                    <select name="category" disabled={!isManager} className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none disabled:bg-slate-50" value={category} onChange={(e) => setCategory(e.target.value)}>
                        {/* Mostra solo categorie magazzino, non menu */}
                        <option value="Bar (Stock)">Bar (Stock)</option>
                        <option value="Cucina (Stock)">Cucina (Stock)</option>
                        <option value="Lavanderia">Lavanderia</option>
                        <option value="Piscina">Piscina</option>
                        <option value="Altro">Altro</option>
                    </select>
                    <select name="unit" className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none" defaultValue={initialData?.unit || ""}>
                    <option value="">U.M.</option>
                    {['Pz', 'Kg', 'Lt', 'Pacchi', 'Porzioni', 'Bottiglie'].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                </div>

                {/* Quantità: Visibile anche allo staff per fare il carico */}
                <div className="grid grid-cols-2 gap-4">
                    <input type="number" step="0.1" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full border-4 border-slate-100 rounded-2xl p-4 text-3xl font-black focus:border-slate-900 outline-none transition-all" placeholder="Q.tà" />
                    <input type="number" step="1" value={minThreshold} onChange={e => setMinThreshold(e.target.value)} className="w-full border-4 border-slate-100 rounded-2xl p-4 text-3xl font-black focus:border-slate-900 outline-none transition-all" placeholder="Soglia" />
                </div>

                {/* Costo: Visibile SOLO al Manager */}
                {isManager && (
                    <div className="bg-slate-50 p-4 rounded-3xl border-2 border-slate-100">
                        <label className="text-[10px] font-black uppercase text-slate-500 px-2 block mb-1">Costo Acquisto Unitario (€)</label>
                        <input type="number" step="0.01" value={costPrice} onChange={e => setCostPrice(e.target.value)} className="w-full border-2 border-slate-200 rounded-xl p-3 font-bold outline-none focus:border-slate-900" placeholder="0.00" />
                    </div>
                )}

                <Autocomplete label="Sottocategoria" value={subcategory} onChange={setSubcategory} suggestions={subcategorySuggestions} placeholder="Es. Pasta / Carne" required={false} className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-slate-900 transition-all" />
                <Autocomplete label="Fornitore" value={supplier} onChange={setSupplier} suggestions={supplierSuggestions} placeholder="Fornitore..." required={false} className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-slate-900 transition-all" />
                <input name="expiry" type="date" defaultValue={initialData?.expiryDate || ""} className="w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none" />
              </>
          )}

          <button type="submit" className="w-full bg-slate-900 text-white p-6 rounded-2xl font-black text-xl hover:bg-black uppercase border-b-8 border-slate-950 shadow-xl active:scale-95 transition-all">
             {initialData ? "Salva Modifiche" : (isMenuMode ? "Crea Voce Menù" : "Aggiungi a Stock")}
          </button>
        </form>
      </div>
    </div>
  );
}

function DetailModal({ item, onClose, onDelete, onEdit, onToggleArchive, onUpdate, isManager }) {
  const isMenu = item.category === 'MENU_ITEM';

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose}></div>
      <div className="relative bg-white w-11/12 max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl animate-modal flex flex-col">
        <div className="p-8 pb-2">
          <div className="flex justify-between items-start">
             <div className="px-4 py-2 rounded-xl inline-flex bg-slate-900 text-white text-[10px] font-black uppercase mb-4 shadow-md">{item?.category}</div>
             {isManager && (
               <button onClick={onEdit} className="bg-blue-50 text-blue-600 p-3 rounded-xl border border-blue-100 hover:bg-blue-100 transition-all flex items-center gap-2 font-black text-[10px] uppercase">
                 <Icon name="pencil" size={16} /> Modifica
               </button>
             )}
          </div>
          <h2 className="text-3xl font-black uppercase italic tracking-tighter leading-none text-slate-900">{item?.name}</h2>
          
          {/* Dettagli specifici per tipo */}
          {isMenu ? (
              <div className="mt-4 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <p className="text-xs font-bold text-emerald-800 uppercase mb-1">Info Vendita</p>
                  <p className="text-sm text-slate-600">Tipo: <b>{item.menuType === 'DIRECT' ? 'Prodotto Diretto' : 'Piatto Cucina'}</b></p>
                  <p className="text-sm text-slate-600">Prezzo: <b>€ {item.sellPrice}</b></p>
              </div>
          ) : (
              <div className="mt-6 p-6 rounded-[2rem] border-4 bg-slate-50 border-slate-200 flex flex-col items-center justify-center">
                <p className="text-[10px] font-black uppercase mb-1 text-slate-400">Giacenza Stock</p>
                <div className="flex items-baseline gap-2">
                    <span className="text-6xl font-black tracking-tighter text-slate-900">{item?.quantity || 0}</span>
                    <span className="text-2xl font-black uppercase text-slate-400">{item?.unit || ""}</span>
                </div>
             </div>
          )}
        </div>
        
        <div className="p-8 pt-4 space-y-4">
          <div className="flex gap-3">
                {isManager && <button onClick={() => onDelete(item.id)} className="p-5 bg-red-50 text-red-600 rounded-2xl font-black border-2 border-red-100 hover:bg-red-100 transition-all"><Icon name="trash-2" size={24} /></button>}
                <button onClick={onClose} className="flex-1 bg-slate-200 text-slate-700 p-5 rounded-2xl font-black text-xl uppercase tracking-tighter hover:bg-slate-300 transition-all">CHIUDI</button>
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
          if (!grouped[log.itemName]) grouped[log.itemName] = { name: log.itemName, loaded: 0, sold: 0, revenue: 0, cost: 0, category: log.category };
          
          // Logica Magazzino (Carico/Scarico Stock)
          if (log.category !== 'VENDITA') {
              if (log.quantityChange > 0) grouped[log.itemName].loaded += log.quantityChange;
              else grouped[log.itemName].sold += Math.abs(log.quantityChange); // Rotture/Consumo interno
          } 
          // Logica Menu (Vendita)
          else {
              grouped[log.itemName].sold += 1; // 1 vendita
              grouped[log.itemName].revenue += (log.revenue || 0);
              grouped[log.itemName].cost += (log.cost || 0);
          }

          const matchesQuery = reportSearchQuery ? log.itemName.toLowerCase().includes(reportSearchQuery.toLowerCase()) : true;
          
          // Grafico (Solo vendite o scarichi)
          if ((log.quantityChange < 0 || log.category === 'VENDITA') && matchesQuery) { 
              let key = isMonthlyMode ? logDate.toISOString().slice(0, 7) : logDate.toISOString().slice(0, 10); 
              if (!chartGrouped[key]) chartGrouped[key] = 0;
              // Se è vendita usa incasso, se è magazzino usa quantità (per ora semplifichiamo grafico su quantità/incasso misto o solo incasso)
              chartGrouped[key] += log.category === 'VENDITA' ? (log.revenue || 0) : 0; 
          }
        }
      });

      const finalReport = Object.values(grouped).map(i => ({ 
          ...i, 
          loaded: parseFloat(i.loaded.toFixed(2)), 
          sold: parseFloat(i.sold.toFixed(2)),
          revenue: i.revenue,
          margin: i.revenue - i.cost
      })).sort((a,b) => b.sold - a.sold);
      
      setReportData(finalReport);
      
      const chartArray = Object.keys(chartGrouped).map(key => {
          let label = key;
          if (isMonthlyMode) {
              const [y, m] = key.split('-');
              label = new Date(parseInt(y), parseInt(m)-1, 1).toLocaleDateString('it-IT', { month: 'short', year: '2-digit' }); 
          } else {
              const [y, m, d] = key.split('-');
              label = `${d}/${m}`; 
          }
          return { sortKey: key, date: label, vendite: parseFloat(chartGrouped[key].toFixed(2)) };
      });
      chartArray.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      setChartData(chartArray);
    } catch (err) { alert("Errore generazione report: " + err.message); }
    setLoading(false);
  };

  useEffect(() => { if (reportData.length > 0) generateReport(); }, [reportSearchQuery]);
  const filteredReportData = useMemo(() => { if (!reportSearchQuery) return reportData; return reportData.filter(item => item.name.toLowerCase().includes(reportSearchQuery.toLowerCase())); }, [reportData, reportSearchQuery]);

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-4xl rounded-[2.5rem] overflow-hidden shadow-2xl animate-modal flex flex-col max-h-[95vh]">
        <div className="p-8 border-b bg-slate-900 text-white flex justify-between items-center">
          <div><h2 className="text-2xl font-black uppercase italic tracking-tighter text-yellow-400">Report Finanziario</h2><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Incassi & Margini</p></div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><Icon name="x" size={32} /></button>
        </div>
        <div className="p-6 bg-slate-50 border-b space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-end">
                <label className="w-full"><span className="text-[10px] font-black uppercase text-slate-500 block mb-1">Dal Giorno</span><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full p-3 rounded-xl border-2 border-slate-200 font-bold" /></label>
                <label className="w-full"><span className="text-[10px] font-black uppercase text-slate-500 block mb-1">Al Giorno</span><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full p-3 rounded-xl border-2 border-slate-200 font-bold" /></label>
                <button onClick={generateReport} disabled={loading} className="w-full sm:w-auto bg-blue-600 text-white px-6 py-3 rounded-xl font-black uppercase hover:bg-blue-700 transition-all shadow-lg">{loading ? '...' : 'Calcola'}</button>
            </div>
            <div className="relative"><Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" placeholder="Cerca prodotto..." value={reportSearchQuery} onChange={(e) => setReportSearchQuery(e.target.value)} className="w-full p-3 pl-10 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-700 focus:border-blue-600 outline-none transition-colors placeholder:font-medium" /></div>
        </div>
        {chartData.length > 0 && (
            <div className="h-64 w-full bg-white p-4 border-b border-slate-100">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-2 text-center">Andamento Incassi (€)</p>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="date" tick={{fontSize: 10, fill: '#64748b'}} axisLine={false} tickLine={false} />
                        <YAxis tick={{fontSize: 10, fill: '#64748b'}} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)'}} cursor={{fill: '#f1f5f9'}} />
                        <Bar dataKey="vendite" fill="#0f172a" radius={[4, 4, 0, 0]}>{chartData.map((entry, index) => (<Cell key={`cell-${index}`} fill='#2563eb' />))}</Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        )}
        <div className="flex-1 overflow-y-auto p-6 space-y-2">
            {reportData.length === 0 ? (<div className="text-center text-slate-400 py-10 font-bold italic">Nessun dato.</div>) : filteredReportData.length === 0 ? (<div className="text-center text-slate-400 py-10 font-bold italic">Nessun risultato.</div>) : (
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white z-10 shadow-sm"><tr><th className="p-3 text-[10px] font-black uppercase text-slate-400">Voce</th><th className="p-3 text-[10px] font-black uppercase text-slate-400 text-center">Venduti</th><th className="p-3 text-[10px] font-black uppercase text-green-600 text-right">Incasso</th><th className="p-3 text-[10px] font-black uppercase text-blue-600 text-right">Margine</th></tr></thead>
                    <tbody>{filteredReportData.map((row, i) => (<tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50"><td className="p-3"><div className="font-bold text-slate-900">{row.name}</div><div className="text-[9px] uppercase text-slate-400">{row.category === 'VENDITA' ? 'Menu' : row.category}</div></td><td className="p-3 text-center font-bold">{row.sold}</td><td className="p-3 text-right font-bold text-green-700">€ {row.revenue.toFixed(2)}</td><td className="p-3 text-right font-bold text-blue-700">€ {row.margin.toFixed(2)}</td></tr>))}</tbody>
                </table>
            )}
        </div>
      </div>
    </div>
  );
}
