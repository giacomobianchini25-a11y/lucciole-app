// ============================================================
//  LUCCIOLE NELLA NEBBIA — App interna del villaggio
//  Home con sezioni: Lista spesa, Riunione, Lavori e manutenzioni,
//  Turni, Check-list, Economia (solo admin e superadmin)
// ============================================================
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
  getDocs,
  getDoc,
  setDoc,
  query,
  where,
  deleteField,
  writeBatch
} from 'firebase/firestore';

// --- ICONE ---
import {
  Wine, Utensils, Bed, Waves, Package, ChevronRight, ChevronLeft, AlertTriangle,
  Clock, Plus, X, Trash2, Pencil, ClipboardList, Save, CheckSquare, CheckCircle2,
  Undo2, Users, CalendarDays, Wrench, ClipboardCheck, Wallet, Coffee, PenTool,
  Eraser, ArrowLeft, Printer, MessageCircle, Copy, History, Hand, ShoppingCart,
  Calculator, Bell, UserPlus, FileText, Sun, Home as HomeIcon, Phone, RefreshCw
} from 'lucide-react';

const ICON_MAP = {
  'wine': Wine, 'utensils': Utensils, 'bed': Bed, 'waves': Waves, 'package': Package,
  'chevron-right': ChevronRight, 'chevron-left': ChevronLeft, 'alert': AlertTriangle,
  'clock': Clock, 'plus': Plus, 'x': X, 'trash': Trash2, 'pencil': Pencil,
  'list': ClipboardList, 'save': Save, 'check-square': CheckSquare,
  'check-circle': CheckCircle2, 'undo': Undo2, 'users': Users, 'calendar': CalendarDays,
  'wrench': Wrench, 'clipboard-check': ClipboardCheck, 'wallet': Wallet, 'coffee': Coffee,
  'pen': PenTool, 'eraser': Eraser, 'back': ArrowLeft, 'printer': Printer,
  'whatsapp': MessageCircle, 'copy': Copy, 'history': History, 'hand': Hand,
  'cart': ShoppingCart, 'calculator': Calculator, 'bell': Bell, 'user-plus': UserPlus,
  'file-text': FileText, 'sun': Sun, 'home': HomeIcon, 'phone': Phone, 'refresh': RefreshCw
};

const Icon = ({ name, size = 20, className = '', strokeWidth = 2.5 }) => {
  const LucideIcon = ICON_MAP[name] || Package;
  return <LucideIcon size={size} className={className} strokeWidth={strokeWidth} />;
};

// ============================================================
//  RUOLI E PERMESSI
//  (i ruoli sono ancora legati all'email, come prima.
//   Più avanti si possono spostare su un documento "users/{uid}")
// ============================================================
const USERNAME_TO_EMAIL = {
  superadmin: 'superadmin@lucciole.app',
  admin: 'admin@lucciole.app',
  cuoco: 'cuoco@lucciole.app',
  barista: 'barista@lucciole.app'
};
const EMAIL_TO_ROLE = {
  'superadmin@lucciole.app': 'superadmin',
  'admin@lucciole.app': 'admin',
  'cuoco@lucciole.app': 'cuoco',
  'barista@lucciole.app': 'barista'
};

const MANAGERS = ['superadmin', 'admin'];
const STAFF = [...MANAGERS, 'barista']; // tutti tranne il cuoco
const EVERYONE = [...STAFF, 'cuoco'];

// Chi vede quale tasto della home
const SECTIONS = [
  { id: 'spesa', label: 'Lista spesa', sub: 'Bar, cucina, colazione...', icon: 'cart', tile: 'bg-blue-700', roles: EVERYONE },
  { id: 'riunione', label: 'Riunione', sub: 'Punti e appunti', icon: 'users', tile: 'bg-purple-700', roles: STAFF },
  { id: 'lavori', label: 'Lavori e manutenzioni', sub: 'Da fare e cose rotte', icon: 'wrench', tile: 'bg-orange-600', roles: STAFF },
  { id: 'turni', label: 'Turni', sub: 'Settimana e comunicazioni', icon: 'calendar', tile: 'bg-cyan-700', roles: STAFF },
  { id: 'checklist', label: 'Check-list', sub: 'Controlli periodici', icon: 'clipboard-check', tile: 'bg-emerald-600', roles: STAFF },
  { id: 'economia', label: 'Economia', sub: 'Scadenze, dipendenti, LUL', icon: 'wallet', tile: 'bg-slate-800', roles: MANAGERS }
];

// ============================================================
//  UTILITÀ DATE E ORE
// ============================================================
const pad2 = (n) => String(n).padStart(2, '0');
// NB: si usano le date LOCALI (non toISOString, che è in UTC e sbaglia vicino a mezzanotte)
const toISODate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const parseISODate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const diffDays = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / 86400000);
const addMonths = (d, n) => {
  const y = d.getFullYear();
  const m = d.getMonth() + n;
  const last = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(d.getDate(), last));
};
const dowMon0 = (d) => (d.getDay() + 6) % 7; // 0 = lunedì ... 6 = domenica
const startOfWeek = (d) => addDays(startOfDay(d), -dowMon0(d));

const DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
const DAYS_LONG = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];
const MONTHS = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

const fmtDateIT = (d) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
const fmtDayMonth = (d) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
const fmtTimeIT = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const fmtNum = (n) => r2(n).toLocaleString('it-IT', { maximumFractionDigits: 2 });

const timeToMin = (t) => {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
};
const rangeHours = (r) => {
  const a = timeToMin(r && r.from);
  const b = timeToMin(r && r.to);
  if (a == null || b == null) return 0;
  let diff = b - a;
  if (diff < 0) diff += 1440; // turno a cavallo della mezzanotte
  return diff / 60;
};
const cleanRanges = (rs) => (Array.isArray(rs) ? rs : []).filter((r) => r && r.from && r.to);
const sumHours = (rs) => r2(cleanRanges(rs).reduce((s, r) => s + rangeHours(r), 0));
const fmtRanges = (rs) => {
  const c = cleanRanges(rs);
  return c.length ? c.map((r) => `${r.from}–${r.to}`).join(' / ') : null;
};

const empName = (e) => `${(e && e.firstName) || ''} ${(e && e.lastName) || ''}`.trim() || 'Senza nome';
const empSort = (a, b) =>
  (a.lastName || '').localeCompare(b.lastName || '', 'it') ||
  (a.firstName || '').localeCompare(b.firstName || '', 'it');

// numero di telefono -> formato per wa.me (default Italia)
const waNumber = (p) => {
  let n = String(p || '').replace(/[^\d+]/g, '');
  if (!n) return '';
  if (n.startsWith('+')) n = n.slice(1);
  else if (n.startsWith('00')) n = n.slice(2);
  else if (n.startsWith('39') && n.length >= 11) { /* già con prefisso */ }
  else n = '39' + n;
  return n;
};

// ============================================================
//  ORARI STANDARD E LUL (funzioni di calcolo "pure")
// ============================================================
const ABSENCE_CODES = ['F', 'M', 'P']; // Ferie, Malattia, Permesso
const ABSENCE_LABELS = { F: 'Ferie', M: 'Malattia', P: 'Permesso' };

// ore previste per ciascun giorno della settimana [lun..dom] dall'orario standard
export function scheduleHours(schedule) {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => sumHours(schedule && (schedule[i] || schedule[String(i)])));
}

// legge una cella del LUL: null = vuota, 'F'/'M'/'P' = assenza, numero = ore, undefined = non valida
export function parseCell(raw) {
  const s = String(raw === undefined || raw === null ? '' : raw).trim().toUpperCase();
  if (s === '') return null;
  if (ABSENCE_CODES.includes(s)) return s;
  const n = parseFloat(s.replace(',', '.'));
  if (isNaN(n) || n < 0 || n > 24) return undefined;
  return r2(n);
}

/**
 * Calcolo del mese per un dipendente.
 * - Dipendente FISSO: le ore previste di ogni giorno vengono dall'orario standard
 *   (riscalato sulle ore settimanali di contratto, se diverse). Il confronto si fa
 *   SETTIMANA PER SETTIMANA (lun-dom): ore lavorate oltre quelle previste = straordinario.
 *   Le ore in meno in una giornata si compensano con quelle in più nella stessa settimana.
 * - Dipendente A CHIAMATA: nessun orario fisso. Straordinario solo se è indicata una soglia
 *   settimanale (ore settimanali), altrimenti tutte le ore sono ordinarie.
 * - Assenze F/M/P: coprono le ore previste di quel giorno (non sono ore lavorate, non sono mancanze).
 * - Le settimane a cavallo di due mesi sono calcolate per la sola parte del mese.
 */
export function computeLul(emp, priv, entries, year, month, today) {
  const dim = new Date(year, month + 1, 0).getDate();
  const W = Number(priv && priv.weeklyHours) || 0;
  const isCall = emp.type === 'chiamata';
  const sched = scheduleHours(emp.schedule);
  const S = sched.reduce((a, b) => a + b, 0);
  const k = !isCall && S > 0 && W > 0 ? W / S : 1;
  const noBaseline = !isCall && S === 0 && W === 0;

  const expectedFor = (dow) => {
    if (isCall) return W > 0 ? W / 7 : 0;
    if (S > 0) return sched[dow] * k;
    return W > 0 ? W / 7 : 0;
  };

  const todayD = startOfDay(today);
  const days = [];
  const weekMap = new Map();
  const absCount = { F: 0, M: 0, P: 0 };

  for (let d = 1; d <= dim; d++) {
    const date = new Date(year, month, d);
    const dow = dowMon0(date);
    const v = entries ? entries[String(d)] : undefined;
    const filled = v !== undefined && v !== null && v !== '';
    const isAbs = typeof v === 'string' && ABSENCE_CODES.includes(v);
    const worked = filled && !isAbs ? Number(v) || 0 : 0;
    const countable = filled || date <= todayD; // i giorni futuri non ancora compilati non contano
    const full = expectedFor(dow);
    const expected = countable && !isAbs ? full : 0;
    if (isAbs) absCount[v] += 1;
    days.push({ d, date, dow, v: filled ? v : undefined, filled, isAbs, worked, full, expected, countable });

    const wk = toISODate(startOfWeek(date));
    if (!weekMap.has(wk)) weekMap.set(wk, { worked: 0, expected: 0, threshold: 0 });
    const w = weekMap.get(wk);
    w.worked += worked;
    w.expected += expected;
    if (countable && !isAbs && W > 0) w.threshold += W / 7;
  }

  let overtime = 0;
  let deficit = 0;
  let expectedTotal = 0;
  let workedTotal = 0;
  weekMap.forEach((w) => {
    const worked = r2(w.worked);
    workedTotal += worked;
    if (noBaseline) return;
    if (isCall) {
      if (W > 0) overtime += Math.max(0, worked - r2(w.threshold));
    } else {
      const exp = r2(w.expected);
      expectedTotal += exp;
      overtime += Math.max(0, worked - exp);
      deficit += Math.max(0, exp - worked);
    }
  });

  return {
    days,
    noBaseline,
    isCall,
    weeklyHours: W,
    absCount,
    totals: {
      worked: r2(workedTotal),
      expected: r2(expectedTotal),
      overtime: r2(overtime),
      ordinary: r2(workedTotal - overtime),
      deficit: r2(deficit)
    }
  };
}

// ============================================================
//  CHECK-LIST: frequenza e scadenze
// ============================================================
const FREQ = {
  daily: { label: 'Giornaliera', warn: 0 },
  weekly: { label: 'Settimanale', warn: 1 },
  monthly: { label: 'Mensile', warn: 5 },
  yearly: { label: 'Annuale', warn: 30 },
  custom: { label: 'Ogni N giorni', warn: 3 }
};

export function checkNextDue(c) {
  if (!c.lastDoneAt) return null;
  const last = startOfDay(new Date(c.lastDoneAt));
  switch (c.frequency) {
    case 'weekly': return addDays(last, 7);
    case 'monthly': return addMonths(last, 1);
    case 'yearly': return addMonths(last, 12);
    case 'custom': return addDays(last, Math.max(1, Number(c.everyDays) || 1));
    default: return addDays(last, 1); // giornaliera
  }
}

export function checkStatus(c, today) {
  const due = checkNextDue(c);
  if (!due) return { state: 'due', due: null, daysLeft: 0, never: true };
  const daysLeft = diffDays(due, today);
  const warn = (FREQ[c.frequency] && FREQ[c.frequency].warn) || 0;
  let state = 'ok';
  if (daysLeft < 0) state = 'overdue';
  else if (daysLeft === 0) state = 'due';
  else if (daysLeft <= warn) state = 'soon';
  return { state, due, daysLeft, never: false };
}

// ============================================================
//  SCADENZE (corsi, visite, contratti...)
// ============================================================
const DEADLINE_CATEGORIES = ['Corso / formazione', 'Visita medica', 'Contratto', 'Certificato / licenza', 'Assicurazione', 'Altro'];

export function deadlineStatus(dl, today) {
  if (!dl.dueDate) return { state: 'ok', daysLeft: 9999 };
  const daysLeft = diffDays(parseISODate(dl.dueDate), today);
  const remind = dl.remindDays === undefined || dl.remindDays === null ? 30 : Number(dl.remindDays);
  let state = 'ok';
  if (daysLeft < 0) state = 'expired';
  else if (daysLeft <= remind) state = 'soon';
  return { state, daysLeft };
}

// ============================================================
//  STILI RIUTILIZZABILI
// ============================================================
const INPUT = 'w-full border-4 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-slate-900 transition-all bg-white';
const INPUT_SM = 'w-full border-2 border-slate-200 rounded-xl p-3 font-bold outline-none focus:border-slate-900 bg-white';
const LABEL = 'text-[10px] font-black uppercase text-slate-500 px-2 block mb-1';
const BTN_PRIMARY = 'w-full bg-slate-900 text-white p-5 rounded-2xl font-black text-xl hover:bg-black uppercase border-b-8 border-slate-950 shadow-xl active:scale-95 transition-all disabled:opacity-40';
const BTN_SOFT = 'px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-wide border-2 border-slate-200 bg-white text-slate-700 hover:bg-slate-100 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-40';

// ============================================================
//  COMPONENTI DI BASE
// ============================================================
function useToday() {
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => {
      setToday((prev) => (prev.toDateString() !== new Date().toDateString() ? new Date() : prev));
    }, 60000);
    return () => clearInterval(t);
  }, []);
  return today;
}

function useMediaQuery(q) {
  const [m, setM] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(q).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(q);
    const f = () => setM(mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, [q]);
  return m;
}

function Modal({ onClose, children, size = 'max-w-lg', z = 'z-[300]' }) {
  return (
    <div className={`fixed inset-0 ${z} flex items-center justify-center p-3 sm:p-4`}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
      <div className={`relative bg-white w-full ${size} rounded-[2rem] sm:rounded-[2.5rem] overflow-hidden shadow-2xl animate-modal flex flex-col max-h-[94vh]`}>
        {children}
      </div>
    </div>
  );
}

function ModalHeader({ title, subtitle, onClose }) {
  return (
    <div className="p-5 sm:p-6 border-b flex justify-between items-center bg-slate-50 flex-shrink-0">
      <div className="min-w-0">
        <h2 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900 truncate">{title}</h2>
        {subtitle && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{subtitle}</p>}
      </div>
      <button onClick={onClose} className="text-slate-400 hover:text-red-500 transition-colors flex-shrink-0 ml-3"><Icon name="x" size={32} /></button>
    </div>
  );
}

function PageShell({ title, subtitle, onBack, right, wide = false, children }) {
  return (
    <div className="min-h-screen bg-slate-50 pb-32">
      <header className="bg-slate-900 text-white p-4 sm:p-6 shadow-xl sticky top-0 z-[100]">
        <div className={`${wide ? 'max-w-7xl' : 'max-w-5xl'} mx-auto flex items-center gap-3`}>
          {onBack && (
            <button onClick={onBack} className="bg-white/10 hover:bg-white/20 p-3 rounded-full active:scale-95 transition-all flex-shrink-0">
              <Icon name="back" size={22} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tighter text-yellow-400 leading-none truncate">{title}</h1>
            {subtitle && <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 truncate">{subtitle}</p>}
          </div>
          {right}
        </div>
      </header>
      <main className={`${wide ? 'max-w-7xl' : 'max-w-5xl'} mx-auto p-4 sm:p-6 space-y-6`}>{children}</main>
    </div>
  );
}

const Chip = ({ active, onClick, color = 'bg-slate-900', children }) => (
  <button
    onClick={onClick}
    className={`flex-shrink-0 px-5 py-3 rounded-[1.5rem] font-black text-[11px] uppercase flex items-center gap-2 transition-all ${active ? `${color} text-white shadow-lg scale-105` : 'bg-white text-slate-400 border-2 border-slate-100'}`}
  >
    {children}
  </button>
);

const Empty = ({ children }) => (
  <div className="text-center py-16 opacity-60 font-black italic uppercase text-slate-400 text-sm">{children}</div>
);

const AddFab = ({ onClick, children }) => (
  <button
    onClick={onClick}
    className="fixed bottom-8 right-6 z-[200] bg-slate-900 text-white px-7 py-5 rounded-full shadow-[0_4px_14px_0_rgba(0,0,0,0.3)] flex items-center gap-3 active:scale-95 hover:-translate-y-1 transition-all font-black uppercase tracking-widest text-sm"
  >
    <Icon name="plus" size={22} strokeWidth={3} /> {children}
  </button>
);

// ============================================================
//  STAMPA / PDF
//  Si usa la stampa del browser: dal dialogo si sceglie "Salva come PDF".
//  Nessuna libreria aggiuntiva da installare.
// ============================================================
function PrintSheet({ landscape = true, children }) {
  return createPortal(
    <div className="print-sheet">
      <style>{`
        .print-sheet { display: none; }
        @media print {
          @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 8mm; }
          .app-root { display: none !important; }
          .print-sheet { display: block !important; color: #000; font-family: Arial, Helvetica, sans-serif; }
          body { background: #fff !important; }
          .print-sheet h1 { font-size: 16pt; margin: 0 0 2mm; }
          .print-sheet h2 { font-size: 11pt; margin: 5mm 0 2mm; }
          .print-sheet p { font-size: 8pt; margin: 0 0 3mm; color: #444; }
          .print-sheet table { border-collapse: collapse; width: 100%; font-size: 7pt; page-break-inside: auto; }
          .print-sheet tr { page-break-inside: avoid; }
          .print-sheet th, .print-sheet td { border: 0.3mm solid #666; padding: 0.8mm 1mm; text-align: center; }
          .print-sheet th { background: #e5e7eb; }
          .print-sheet td.l, .print-sheet th.l { text-align: left; }
          .print-sheet .we { background: #f3f4f6; }
          .print-sheet .ot { font-weight: bold; }
        }
      `}</style>
      {children}
    </div>,
    document.body
  );
}
const doPrint = () => setTimeout(() => window.print(), 60);

// ============================================================
//  SCRITTURA A MANO (penna del tablet) — salva i tratti come piccolo testo JSON
// ============================================================
const INK_W = 1000;
const INK_H0 = 1100;
const INK_H_STEP = 600;
const INK_COLORS = [['#0f172a', 'bg-slate-900'], ['#1d4ed8', 'bg-blue-700'], ['#dc2626', 'bg-red-600']];
const INK_SIZES = [[2.5, 'Sottile'], [4.5, 'Medio'], [9, 'Spesso']];
const r1 = (n) => Math.round(n * 10) / 10;

function paintStroke(ctx, s, scale) {
  const p = s.p;
  if (!p || p.length < 2) return;
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  ctx.lineWidth = s.s * scale;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (p.length === 2) {
    ctx.beginPath();
    ctx.arc(p[0] * scale, p[1] * scale, (s.s * scale) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(p[0] * scale, p[1] * scale);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i] * scale, p[i + 1] * scale);
  ctx.stroke();
}

function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function strokeHit(s, x, y, R) {
  const p = s.p;
  const r = R + (s.s || 3) / 2;
  if (p.length === 2) return Math.hypot(p[0] - x, p[1] - y) <= r;
  for (let i = 0; i + 3 < p.length; i += 2) {
    if (distSeg(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= r) return true;
  }
  return false;
}

function InkCanvas({ strokes, h, onChange, disabled = false }) {
  const canvasRef = useRef(null);
  const [tool, setTool] = useState('pen'); // pen | eraser | scroll
  const [color, setColor] = useState(INK_COLORS[0][0]);
  const [size, setSize] = useState(INK_SIZES[1][0]);
  const [onlyPen, setOnlyPen] = useState(false);
  const drawing = useRef(null);
  const working = useRef(strokes);
  const scale = useMemo(() => Math.min(2, Math.max(1, (typeof window !== 'undefined' && window.devicePixelRatio) || 1)), []);

  useEffect(() => { working.current = strokes; }, [strokes]);

  const paintAll = useCallback((list) => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cv.width, cv.height);
    list.forEach((s) => paintStroke(ctx, s, scale));
  }, [scale]);

  useEffect(() => { paintAll(strokes); }, [strokes, h, paintAll]);

  const point = (ev) => {
    const r = canvasRef.current.getBoundingClientRect();
    return [((ev.clientX - r.left) / r.width) * INK_W, ((ev.clientY - r.top) / r.height) * h];
  };

  const erase = (x, y) => {
    const next = working.current.filter((s) => !strokeHit(s, x, y, 14));
    if (next.length !== working.current.length) {
      working.current = next;
      if (drawing.current) drawing.current.changed = true;
      paintAll(next);
    }
  };

  const onDown = (e) => {
    if (disabled || tool === 'scroll') return;
    if (onlyPen && e.pointerType === 'touch') return;
    e.preventDefault();
    try { canvasRef.current.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    const [x, y] = point(e);
    if (tool === 'eraser') {
      drawing.current = { mode: 'erase', changed: false };
      erase(x, y);
    } else {
      const stroke = { c: color, s: size, p: [r1(x), r1(y)] };
      drawing.current = { mode: 'pen', stroke };
      paintStroke(canvasRef.current.getContext('2d'), stroke, scale);
    }
  };

  const onMove = (e) => {
    const d = drawing.current;
    if (!d) return;
    const native = e.nativeEvent;
    const list = native.getCoalescedEvents ? native.getCoalescedEvents() : [];
    const evs = list.length ? list : [native];
    const ctx = canvasRef.current.getContext('2d');
    for (const ev of evs) {
      const [x, y] = point(ev);
      if (d.mode === 'pen') {
        const p = d.stroke.p;
        const lx = p[p.length - 2];
        const ly = p[p.length - 1];
        if (Math.hypot(x - lx, y - ly) < 0.8) continue;
        p.push(r1(x), r1(y));
        ctx.strokeStyle = d.stroke.c;
        ctx.lineWidth = d.stroke.s * scale;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(lx * scale, ly * scale);
        ctx.lineTo(x * scale, y * scale);
        ctx.stroke();
      } else {
        erase(x, y);
      }
    }
  };

  const onUp = () => {
    const d = drawing.current;
    drawing.current = null;
    if (!d) return;
    if (d.mode === 'pen') onChange({ strokes: [...working.current, d.stroke], h });
    else if (d.changed) onChange({ strokes: working.current, h });
  };

  const undo = () => { if (strokes.length) onChange({ strokes: strokes.slice(0, -1), h }); };
  const clearAll = () => { if (strokes.length && confirm('Cancellare tutta la scrittura a mano di questo punto?')) onChange({ strokes: [], h }); };

  const toolBtn = (id, label, icon) => (
    <button
      type="button"
      onClick={() => setTool(id)}
      className={`px-4 py-3 rounded-xl font-black text-[11px] uppercase flex items-center gap-2 transition-all ${tool === id ? 'bg-slate-900 text-white shadow-md' : 'bg-white text-slate-500 border-2 border-slate-200'}`}
    >
      <Icon name={icon} size={16} /> {label}
    </button>
  );

  return (
    <div className="space-y-3">
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          {toolBtn('pen', 'Penna', 'pen')}
          {toolBtn('eraser', 'Gomma', 'eraser')}
          {toolBtn('scroll', 'Scorri', 'hand')}
          <span className="w-px h-8 bg-slate-200 mx-1"></span>
          {INK_COLORS.map(([c, cls]) => (
            <button
              key={c}
              type="button"
              aria-label={`Colore ${c}`}
              onClick={() => { setColor(c); setTool('pen'); }}
              className={`w-9 h-9 rounded-full ${cls} border-4 ${color === c && tool === 'pen' ? 'border-yellow-400 scale-110' : 'border-white shadow'} transition-all`}
            />
          ))}
          <span className="w-px h-8 bg-slate-200 mx-1"></span>
          {INK_SIZES.map(([s, label]) => (
            <button
              key={s}
              type="button"
              onClick={() => { setSize(s); setTool('pen'); }}
              className={`px-3 h-9 rounded-xl text-[10px] font-black uppercase ${size === s ? 'bg-slate-900 text-white' : 'bg-white border-2 border-slate-200 text-slate-500'}`}
            >
              {label}
            </button>
          ))}
          <span className="w-px h-8 bg-slate-200 mx-1"></span>
          <button type="button" onClick={undo} disabled={!strokes.length} className={BTN_SOFT}><Icon name="undo" size={16} /> Annulla</button>
          <button type="button" onClick={clearAll} disabled={!strokes.length} className={BTN_SOFT}><Icon name="trash" size={16} /></button>
          <label className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-500 ml-1 cursor-pointer">
            <input type="checkbox" checked={onlyPen} onChange={(e) => setOnlyPen(e.target.checked)} className="w-5 h-5" /> Solo penna
          </label>
        </div>
      )}
      <div
        className="relative rounded-3xl border-4 border-slate-200 bg-white overflow-hidden"
        style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 35px, #eef2f7 35px, #eef2f7 36px)' }}
      >
        <canvas
          ref={canvasRef}
          width={INK_W * scale}
          height={h * scale}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          style={{
            width: '100%',
            aspectRatio: `${INK_W} / ${h}`,
            display: 'block',
            touchAction: disabled || tool === 'scroll' ? 'auto' : 'none',
            cursor: tool === 'eraser' ? 'cell' : tool === 'scroll' ? 'grab' : 'crosshair'
          }}
        />
      </div>
      {!disabled && (
        <div className="flex justify-between items-center">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Per scorrere il foglio col dito scegli «Scorri»</p>
          <button type="button" onClick={() => onChange({ strokes, h: h + INK_H_STEP })} className={BTN_SOFT}><Icon name="plus" size={14} /> Allunga foglio</button>
        </div>
      )}
    </div>
  );
}

// ============================================================
//  LISTA SPESA  (stessa logica di prima + tab COLAZIONE)
// ============================================================
const SHOPPING_TABS = [
  { id: 'ALL', label: 'TUTTO', icon: 'list', color: 'bg-slate-800', text: 'text-slate-800', field: null },
  { id: 'bar', label: 'BAR', icon: 'wine', color: 'bg-blue-700', text: 'text-blue-700', field: 'contentBar' },
  { id: 'colazione', label: 'COLAZIONE', icon: 'coffee', color: 'bg-amber-600', text: 'text-amber-700', field: 'contentColazione' },
  { id: 'cucina', label: 'CUCINA', icon: 'utensils', color: 'bg-orange-600', text: 'text-orange-700', field: 'contentRistorante' }, // vecchio campo, per compatibilità
  { id: 'lavanderia', label: 'LAVANDERIA', icon: 'bed', color: 'bg-purple-700', text: 'text-purple-700', field: 'contentLavanderia' },
  { id: 'piscina', label: 'PISCINA', icon: 'waves', color: 'bg-cyan-700', text: 'text-cyan-700', field: 'contentPiscina' },
  { id: 'altro', label: 'ALTRO', icon: 'package', color: 'bg-slate-700', text: 'text-slate-700', field: 'contentAltro' }
];

// Chi vede quali liste. 'all' = tutte (con riepilogo TUTTO).
// Per cambiare i permessi basta modificare questa riga.
const SHOPPING_TAB_ACCESS = {
  superadmin: 'all',
  admin: 'all',
  cuoco: ['cucina'],
  barista: ['bar', 'colazione']
};

function ShoppingPage({ role, onBack, onLogout }) {
  const access = SHOPPING_TAB_ACCESS[role] || [];
  const tabs = useMemo(() => {
    const real = SHOPPING_TABS.filter((t) => t.id !== 'ALL');
    if (access === 'all') return [SHOPPING_TABS[0], ...real];
    return real.filter((t) => access.includes(t.id));
  }, [access]);
  const realTabs = tabs.filter((t) => t.id !== 'ALL');

  const [activeTab, setActiveTab] = useState(tabs[0] ? tabs[0].id : 'bar');
  const [notes, setNotes] = useState({});
  const [dirty, setDirty] = useState({});
  const dirtyRef = useRef({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const markDirty = (id, v) => {
    dirtyRef.current = { ...dirtyRef.current, [id]: v };
    setDirty(dirtyRef.current);
  };

  // Sincronizzazione in tempo reale: non sovrascrive mai ciò che stai scrivendo tu
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'general', 'shoppingList'),
      (snap) => {
        const data = snap.exists() ? snap.data() : {};
        setNotes((prev) => {
          const next = { ...prev };
          SHOPPING_TABS.forEach((t) => {
            if (t.field && !dirtyRef.current[t.id]) next[t.id] = data[t.field] || '';
          });
          return next;
        });
      },
      (err) => setError(err.message)
    );
    return () => unsub();
  }, []);

  const saveFields = async (ids, values) => {
    setSaving(true);
    try {
      const payload = { updatedAt: new Date().toISOString() };
      ids.forEach((id) => {
        const t = SHOPPING_TABS.find((x) => x.id === id);
        payload[t.field] = values[id] || '';
      });
      // scrive SOLO i campi modificati: non cancella le liste degli altri reparti
      await setDoc(doc(db, 'general', 'shoppingList'), payload, { merge: true });
      ids.forEach((id) => markDirty(id, false));
    } catch (e) {
      alert('Errore salvataggio: ' + e.message);
    }
    setSaving(false);
  };

  const clearCurrent = async () => {
    if (activeTab === 'ALL') {
      if (!confirm('ATTENZIONE: svuoti TUTTE le liste?')) return;
      const ids = realTabs.map((t) => t.id);
      const empty = {};
      ids.forEach((id) => { empty[id] = ''; });
      setNotes((p) => ({ ...p, ...empty }));
      await saveFields(ids, empty);
    } else {
      const label = SHOPPING_TABS.find((t) => t.id === activeTab).label;
      if (!confirm(`Svuotare la lista ${label}?`)) return;
      setNotes((p) => ({ ...p, [activeTab]: '' }));
      await saveFields([activeTab], { [activeTab]: '' });
    }
  };

  const goBack = () => {
    const unsaved = Object.values(dirtyRef.current).some(Boolean);
    if (unsaved && !confirm('Hai modifiche non salvate. Uscire senza salvare?')) return;
    onBack();
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-slate-900 text-white p-4 sm:p-6 shadow-xl">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          {onBack && (
            <button onClick={goBack} className="bg-white/10 hover:bg-white/20 p-3 rounded-full active:scale-95 transition-all">
              <Icon name="back" size={22} />
            </button>
          )}
          <h1 className="text-2xl sm:text-3xl font-black uppercase italic tracking-tighter text-yellow-400 leading-none flex-1">Lista spesa</h1>
          {!onBack && onLogout && (
            <button onClick={onLogout} className="bg-red-50 text-red-600 px-4 py-2 rounded-full border border-red-100 hover:bg-red-100 font-black text-[10px] uppercase tracking-widest transition-all shadow-md active:scale-95">Esci</button>
          )}
        </div>
      </header>

      <div className="max-w-3xl w-full mx-auto flex-1 flex flex-col p-3 sm:p-6 gap-3">
        {error && <div className="bg-red-100 text-red-800 p-3 rounded-xl text-xs font-bold">Errore di lettura: {error}</div>}

        <div className="p-3 bg-slate-100 rounded-3xl flex gap-2 overflow-x-auto no-scrollbar items-center">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 px-5 py-3 rounded-2xl font-black uppercase text-[10px] flex items-center justify-center gap-2 transition-all ${activeTab === tab.id ? `${tab.color} text-white shadow-md scale-105` : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'}`}
            >
              <Icon name={tab.icon} size={16} /> {tab.label}
              {dirty[tab.id] && <span className="w-2 h-2 rounded-full bg-yellow-400"></span>}
            </button>
          ))}
        </div>

        <div className="flex-1 bg-white rounded-[2rem] shadow-xl overflow-hidden flex flex-col min-h-[50vh]">
          {activeTab === 'ALL' ? (
            <div className="p-6 space-y-8 overflow-y-auto">
              <h3 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter flex items-center gap-2">
                <Icon name="list" size={28} /> Riepilogo ordini
              </h3>
              {realTabs.filter((t) => (notes[t.id] || '').trim()).length === 0 && (
                <p className="text-slate-400 font-bold italic">Nessuna lista compilata.</p>
              )}
              {realTabs.map((tab) => {
                const content = notes[tab.id];
                if (!content || !content.trim()) return null;
                return (
                  <div key={tab.id} className="border-l-4 border-slate-200 pl-4 py-1">
                    <h4 className={`font-black uppercase text-sm ${tab.text} mb-2 flex items-center gap-2`}>
                      <Icon name={tab.icon} size={16} /> {tab.label}
                    </h4>
                    <pre className="whitespace-pre-wrap font-medium text-slate-600 text-lg leading-relaxed font-sans">{content}</pre>
                  </div>
                );
              })}
            </div>
          ) : (
            <textarea
              className="flex-1 w-full p-6 text-xl font-medium text-slate-700 placeholder:text-slate-300 outline-none resize-none min-h-[45vh]"
              placeholder={`Scrivi qui la lista per ${(SHOPPING_TABS.find((t) => t.id === activeTab) || {}).label}...`}
              value={notes[activeTab] || ''}
              onChange={(e) => { setNotes((p) => ({ ...p, [activeTab]: e.target.value })); markDirty(activeTab, true); }}
            ></textarea>
          )}

          <div className="p-4 border-t bg-slate-50 flex flex-col gap-3">
            {activeTab !== 'ALL' && (
              <button onClick={() => saveFields([activeTab], notes)} disabled={saving} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-xl hover:bg-black active:scale-95 transition-all flex items-center justify-center gap-2">
                <Icon name="save" size={20} /> {saving ? 'Salvataggio...' : 'Salva modifiche'}
              </button>
            )}
            <button onClick={clearCurrent} className="w-full bg-green-100 text-green-700 border-2 border-green-200 py-3 rounded-2xl font-black text-sm hover:bg-green-200 active:scale-95 transition-all flex items-center justify-center gap-2">
              <Icon name="check-square" size={18} />
              {activeTab === 'ALL' ? 'MERCE ARRIVATA (svuota TUTTO)' : 'MERCE ARRIVATA (svuota lista)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
//  RIUNIONE  (to-do con appunti di testo e scrittura a mano)
// ============================================================
function MeetingDetail({ item, onClose, isWide }) {
  const [title, setTitle] = useState(item.title || '');
  const [notes, setNotes] = useState(item.notes || '');
  const [ink, setInk] = useState(null); // { strokes, h } oppure null mentre carica
  const [inkError, setInkError] = useState('');
  const [status, setStatus] = useState('saved'); // saved | dirty | saving | error
  const [saveError, setSaveError] = useState('');
  const dirty = useRef({ meta: false, ink: false });
  const latest = useRef({});
  latest.current = { title, notes, ink };

  useEffect(() => {
    let alive = true;
    getDoc(doc(db, 'meetingInk', item.id))
      .then((snap) => {
        if (!alive) return;
        let parsed = { strokes: [], h: INK_H0 };
        try {
          if (snap.exists() && snap.data().data) {
            const j = JSON.parse(snap.data().data);
            parsed = { strokes: Array.isArray(j.strokes) ? j.strokes : [], h: j.h || INK_H0 };
          }
        } catch (e) { /* foglio vuoto */ }
        setInk(parsed);
      })
      .catch((e) => { if (alive) setInkError(e.message); });
    return () => { alive = false; };
  }, [item.id]);

  const saveNow = useCallback(async () => {
    const d = dirty.current;
    if (!d.meta && !d.ink) return;
    const { title: t, notes: n, ink: k } = latest.current;
    dirty.current = { meta: false, ink: false };
    setStatus('saving');
    try {
      const now = new Date().toISOString();
      const update = {};
      if (d.meta) Object.assign(update, { title: t.trim() || 'Senza titolo', notes: n, hasNotes: !!n.trim(), updatedAt: now });
      if (d.ink && k) {
        const json = JSON.stringify({ v: 1, h: k.h, strokes: k.strokes });
        if (json.length > 900000) throw new Error('Troppa scrittura a mano per un solo punto: cancella qualcosa o crea un nuovo punto.');
        await setDoc(doc(db, 'meetingInk', item.id), { data: json, updatedAt: now });
        update.hasInk = k.strokes.length > 0;
        update.updatedAt = now;
      }
      if (Object.keys(update).length) await updateDoc(doc(db, 'meetingItems', item.id), update);
      setStatus('saved');
      setSaveError('');
    } catch (e) {
      dirty.current = { meta: d.meta || dirty.current.meta, ink: d.ink || dirty.current.ink };
      setSaveError(e.message);
      setStatus('error');
    }
  }, [item.id]);

  // salvataggio automatico 1,5 secondi dopo l'ultima modifica
  useEffect(() => {
    if (status !== 'dirty') return;
    const t = setTimeout(saveNow, 1500);
    return () => clearTimeout(t);
  }, [status, title, notes, ink, saveNow]);

  // salva quando si chiude / si passa a un altro punto
  useEffect(() => () => { saveNow(); }, [saveNow]);

  const touchMeta = () => { dirty.current.meta = true; setStatus('dirty'); };
  const toggleDone = async () => {
    try {
      await updateDoc(doc(db, 'meetingItems', item.id), { done: !item.done, updatedAt: new Date().toISOString() });
    } catch (e) { alert('Errore: ' + e.message); }
  };
  const remove = async () => {
    if (!confirm('Eliminare definitivamente questo punto?')) return;
    dirty.current = { meta: false, ink: false };
    try {
      await deleteDoc(doc(db, 'meetingItems', item.id));
      await deleteDoc(doc(db, 'meetingInk', item.id)).catch(() => {});
      onClose();
    } catch (e) { alert('Errore: ' + e.message); }
  };

  const statusLabel = { saved: 'Salvato ✓', dirty: 'Modifiche...', saving: 'Salvataggio...', error: 'Errore!' }[status];

  return (
    <div className={`${isWide ? 'bg-white rounded-[2rem] shadow-xl border-4 border-white' : 'min-h-screen bg-white'} p-4 sm:p-6 space-y-5`}>
      <div className="flex items-start gap-3">
        {!isWide && (
          <button onClick={onClose} className="bg-slate-100 p-3 rounded-full active:scale-95 flex-shrink-0"><Icon name="back" size={22} /></button>
        )}
        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); touchMeta(); }}
          className="flex-1 min-w-0 text-2xl sm:text-3xl font-black uppercase italic tracking-tighter text-slate-900 outline-none border-b-4 border-slate-100 focus:border-slate-900 pb-1"
        />
        <span className={`text-[10px] font-black uppercase mt-3 flex-shrink-0 ${status === 'error' ? 'text-red-600' : 'text-slate-400'}`}>{statusLabel}</span>
      </div>
      {saveError && <div className="bg-red-100 text-red-800 p-3 rounded-xl text-xs font-bold">{saveError}</div>}

      <div className="flex flex-wrap gap-2">
        <button onClick={toggleDone} className={`px-5 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-2 active:scale-95 transition-all ${item.done ? 'bg-green-600 text-white' : 'bg-white border-2 border-slate-200 text-slate-600'}`}>
          <Icon name="check-circle" size={18} /> {item.done ? 'Fatto — riapri' : 'Segna come fatto'}
        </button>
        <button onClick={remove} className="px-5 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-2 bg-red-50 text-red-600 border-2 border-red-100 active:scale-95">
          <Icon name="trash" size={18} /> Elimina
        </button>
      </div>

      <div>
        <label className={LABEL}>Appunti (testo)</label>
        <textarea
          value={notes}
          onChange={(e) => { setNotes(e.target.value); touchMeta(); }}
          placeholder="Scrivi qui cosa si è deciso, chi se ne occupa, entro quando..."
          className="w-full min-h-[8rem] border-4 border-slate-100 rounded-2xl p-4 text-lg font-medium text-slate-700 outline-none focus:border-slate-900 resize-y"
        ></textarea>
      </div>

      <div>
        <label className={LABEL}>Appunti a mano (penna)</label>
        {inkError ? (
          <div className="bg-red-100 text-red-800 p-3 rounded-xl text-xs font-bold">Non riesco a caricare la scrittura a mano: {inkError}</div>
        ) : ink === null ? (
          <div className="text-slate-400 font-bold italic p-6">Caricamento...</div>
        ) : (
          <InkCanvas
            strokes={ink.strokes}
            h={ink.h}
            onChange={(next) => { setInk(next); dirty.current.ink = true; setStatus('dirty'); }}
          />
        )}
      </div>
    </div>
  );
}

function MeetingPage({ items, role, onBack }) {
  const isWide = useMediaQuery('(min-width: 1024px)');
  const [filter, setFilter] = useState('open');
  const [newTitle, setNewTitle] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const sorted = useMemo(() => [...items].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '')), [items]);
  const openCount = sorted.filter((i) => !i.done).length;
  const doneCount = sorted.length - openCount;
  const list = sorted.filter((i) => (filter === 'open' ? !i.done : filter === 'done' ? i.done : true));
  const selected = sorted.find((i) => i.id === selectedId) || null;

  const addItem = async (e) => {
    e.preventDefault();
    const t = newTitle.trim();
    if (!t) return;
    try {
      const ref = await addDoc(collection(db, 'meetingItems'), {
        title: t, done: false, notes: '', hasNotes: false, hasInk: false,
        createdAt: new Date().toISOString(), createdBy: role
      });
      setNewTitle('');
      setSelectedId(ref.id);
    } catch (err) { alert('Errore: ' + err.message); }
  };

  const toggle = async (it) => {
    try { await updateDoc(doc(db, 'meetingItems', it.id), { done: !it.done, updatedAt: new Date().toISOString() }); }
    catch (err) { alert('Errore: ' + err.message); }
  };

  const clearDone = async () => {
    const done = sorted.filter((i) => i.done);
    if (!done.length || !confirm(`Eliminare i ${done.length} punti completati (con appunti e scrittura a mano)?`)) return;
    try {
      const batch = writeBatch(db);
      done.forEach((i) => { batch.delete(doc(db, 'meetingItems', i.id)); batch.delete(doc(db, 'meetingInk', i.id)); });
      await batch.commit();
      if (selected && selected.done) setSelectedId(null);
    } catch (err) { alert('Errore: ' + err.message); }
  };

  const listPane = (
    <div className="space-y-4">
      <form onSubmit={addItem} className="flex gap-2">
        <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Nuovo punto da discutere..." className={INPUT} />
        <button type="submit" className="bg-slate-900 text-white px-5 rounded-2xl active:scale-95 flex-shrink-0"><Icon name="plus" size={26} strokeWidth={3} /></button>
      </form>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <Chip active={filter === 'open'} onClick={() => setFilter('open')} color="bg-purple-700">Da fare ({openCount})</Chip>
        <Chip active={filter === 'done'} onClick={() => setFilter('done')} color="bg-green-600">Fatti ({doneCount})</Chip>
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Tutti</Chip>
      </div>
      {list.length === 0 ? (
        <Empty>{filter === 'done' ? 'Nessun punto completato' : 'Nessun punto. Aggiungine uno!'}</Empty>
      ) : (
        <div className="space-y-3">
          {list.map((it) => (
            <div
              key={it.id}
              className={`flex items-center gap-3 bg-white rounded-3xl p-3 shadow-md border-4 transition-all ${selectedId === it.id ? 'border-purple-600' : 'border-white'}`}
            >
              <button
                onClick={() => toggle(it)}
                aria-label="Segna fatto"
                className={`w-12 h-12 flex-shrink-0 rounded-full border-4 flex items-center justify-center active:scale-90 transition-all ${it.done ? 'bg-green-600 border-green-600 text-white' : 'border-slate-300 text-transparent hover:border-green-500'}`}
              >
                <Icon name="check-circle" size={24} />
              </button>
              <button onClick={() => setSelectedId(it.id)} className="flex-1 min-w-0 text-left py-2">
                <p className={`font-black text-lg leading-tight ${it.done ? 'line-through text-slate-400' : 'text-slate-900'}`}>{it.title}</p>
                <div className="flex gap-2 mt-1 text-slate-400">
                  {it.hasNotes && <Icon name="list" size={14} />}
                  {it.hasInk && <Icon name="pen" size={14} />}
                </div>
              </button>
              <Icon name="chevron-right" size={20} className="text-slate-300 flex-shrink-0" />
            </div>
          ))}
        </div>
      )}
      {doneCount > 0 && (
        <button onClick={clearDone} className={`${BTN_SOFT} w-full`}><Icon name="trash" size={14} /> Elimina i punti completati</button>
      )}
    </div>
  );

  return (
    <PageShell title="Riunione" subtitle="Punti da discutere e appunti" onBack={onBack} wide>
      {isWide ? (
        <div className="grid grid-cols-[24rem_1fr] gap-6 items-start">
          <div className="sticky top-28">{listPane}</div>
          <div>
            {selected ? (
              <MeetingDetail key={selected.id} item={selected} isWide onClose={() => setSelectedId(null)} />
            ) : (
              <div className="bg-white rounded-[2rem] p-16 text-center text-slate-400 font-black italic uppercase shadow-xl">Seleziona un punto per aprirlo e scrivere gli appunti</div>
            )}
          </div>
        </div>
      ) : (
        <>
          {listPane}
          {selected && (
            <div className="fixed inset-0 z-[400] bg-white overflow-y-auto">
              <MeetingDetail key={selected.id} item={selected} isWide={false} onClose={() => setSelectedId(null)} />
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}

// ============================================================
//  LAVORI E MANUTENZIONI
// ============================================================
const WORK_TYPES = {
  fuori: { label: 'Fuori', icon: 'sun', badge: 'bg-emerald-100 text-emerald-800', btn: 'bg-emerald-600' },
  dentro: { label: 'Dentro', icon: 'home', badge: 'bg-sky-100 text-sky-800', btn: 'bg-sky-600' },
  rotto: { label: 'Rotto / guasto', icon: 'wrench', badge: 'bg-orange-100 text-orange-800', btn: 'bg-orange-600' }
};
const WORK_STATUS = {
  todo: { label: 'Da fare', on: 'bg-red-600 text-white', dot: 'border-red-500' },
  doing: { label: 'In corso', on: 'bg-amber-500 text-white', dot: 'border-amber-400' },
  done: { label: 'Fatto', on: 'bg-green-600 text-white', dot: 'border-green-500' }
};

function WorkModal({ initial, role, onClose }) {
  const [type, setType] = useState(initial ? initial.type : 'rotto');
  const [title, setTitle] = useState(initial ? initial.title : '');
  const [where, setWhere] = useState(initial ? initial.where || '' : '');
  const [description, setDescription] = useState(initial ? initial.description || '' : '');
  const [note, setNote] = useState(initial ? initial.note || '' : '');
  const [urgent, setUrgent] = useState(initial ? !!initial.urgent : false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const data = { type, title: title.trim(), where: where.trim(), description: description.trim(), note: note.trim(), urgent, updatedAt: now, updatedBy: role };
      if (initial) await updateDoc(doc(db, 'works', initial.id), data);
      else await addDoc(collection(db, 'works'), { ...data, status: 'todo', createdAt: now, createdBy: role });
      onClose();
    } catch (err) { alert('Errore: ' + err.message); setBusy(false); }
  };

  return (
    <Modal onClose={onClose}>
      <ModalHeader title={initial ? 'Modifica' : 'Nuova voce'} subtitle="Lavori e manutenzioni" onClose={onClose} />
      <form onSubmit={submit} className="p-5 sm:p-6 space-y-5 overflow-y-auto">
        <div className="grid grid-cols-3 gap-2">
          {Object.entries(WORK_TYPES).map(([id, t]) => (
            <button type="button" key={id} onClick={() => setType(id)} className={`py-4 rounded-2xl font-black text-xs uppercase flex flex-col items-center gap-1 transition-all ${type === id ? `${t.btn} text-white shadow-lg scale-105` : 'bg-slate-50 text-slate-500 border-2 border-slate-100'}`}>
              <Icon name={t.icon} size={22} /> {t.label}
            </button>
          ))}
        </div>
        <div>
          <label className={LABEL}>Cosa</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Es. Rubinetto che perde / Tinteggiare cancello" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Dove</label>
          <input value={where} onChange={(e) => setWhere(e.target.value)} placeholder="Es. Bungalow 12 / Piscina / Ristorante" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Dettagli</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${INPUT} resize-none`} placeholder="Descrizione..."></textarea>
        </div>
        <div>
          <label className={LABEL}>Aggiornamenti / stato</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={`${INPUT} resize-none`} placeholder="Es. Pezzo ordinato, arriva giovedì"></textarea>
        </div>
        <button type="button" onClick={() => setUrgent(!urgent)} className={`w-full py-4 rounded-2xl font-black uppercase text-sm flex items-center justify-center gap-2 transition-all ${urgent ? 'bg-red-600 text-white shadow-lg' : 'bg-slate-50 text-slate-500 border-2 border-slate-100'}`}>
          <Icon name="alert" size={18} /> {urgent ? 'URGENTE' : 'Segna come urgente'}
        </button>
        <button type="submit" disabled={busy} className={BTN_PRIMARY}>{initial ? 'Salva modifiche' : 'Aggiungi'}</button>
      </form>
    </Modal>
  );
}

function WorksPage({ works, role, isManager, onBack }) {
  const [statusFilter, setStatusFilter] = useState('open');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [editing, setEditing] = useState(null); // null | 'new' | work

  const counts = useMemo(() => ({
    open: works.filter((w) => w.status !== 'done').length,
    done: works.filter((w) => w.status === 'done').length
  }), [works]);

  const list = useMemo(() => {
    let l = works;
    if (statusFilter === 'open') l = l.filter((w) => w.status !== 'done');
    if (statusFilter === 'done') l = l.filter((w) => w.status === 'done');
    if (typeFilter !== 'ALL') l = l.filter((w) => w.type === typeFilter);
    return [...l].sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [works, statusFilter, typeFilter]);

  const setStatus = async (w, status) => {
    if (w.status === status) return;
    try {
      const upd = { status, updatedAt: new Date().toISOString(), updatedBy: role };
      upd.doneAt = status === 'done' ? new Date().toISOString() : null;
      await updateDoc(doc(db, 'works', w.id), upd);
    } catch (e) { alert('Errore: ' + e.message); }
  };

  const remove = async (w) => {
    if (!confirm(`Eliminare «${w.title}»?`)) return;
    try { await deleteDoc(doc(db, 'works', w.id)); } catch (e) { alert('Errore: ' + e.message); }
  };

  const clearDone = async () => {
    const done = works.filter((w) => w.status === 'done');
    if (!done.length || !confirm(`Eliminare i ${done.length} lavori già fatti?`)) return;
    try {
      const batch = writeBatch(db);
      done.forEach((w) => batch.delete(doc(db, 'works', w.id)));
      await batch.commit();
    } catch (e) { alert('Errore: ' + e.message); }
  };

  const ago = (iso) => {
    if (!iso) return '';
    const d = diffDays(new Date(), new Date(iso));
    return d <= 0 ? 'oggi' : d === 1 ? 'ieri' : `${d} giorni fa`;
  };

  return (
    <PageShell title="Lavori e manutenzioni" subtitle="Da fare, in corso, fatti" onBack={onBack}>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <Chip active={statusFilter === 'open'} onClick={() => setStatusFilter('open')} color="bg-orange-600">Aperti ({counts.open})</Chip>
        <Chip active={statusFilter === 'done'} onClick={() => setStatusFilter('done')} color="bg-green-600">Fatti ({counts.done})</Chip>
        <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>Tutti</Chip>
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <Chip active={typeFilter === 'ALL'} onClick={() => setTypeFilter('ALL')}>Tutto</Chip>
        {Object.entries(WORK_TYPES).map(([id, t]) => (
          <Chip key={id} active={typeFilter === id} onClick={() => setTypeFilter(id)} color={t.btn}><Icon name={t.icon} size={14} /> {t.label}</Chip>
        ))}
      </div>

      {list.length === 0 ? (
        <Empty>Nessuna voce</Empty>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {list.map((w) => {
            const t = WORK_TYPES[w.type] || WORK_TYPES.rotto;
            const st = WORK_STATUS[w.status] || WORK_STATUS.todo;
            return (
              <div key={w.id} className={`bg-white rounded-[2rem] shadow-xl border-4 overflow-hidden ${w.urgent && w.status !== 'done' ? 'border-red-500' : 'border-white'} ${w.status === 'done' ? 'opacity-70' : ''}`}>
                <div className="p-5 space-y-3">
                  <div className="flex justify-between items-start gap-2">
                    <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase flex items-center gap-1 ${t.badge}`}><Icon name={t.icon} size={12} /> {t.label}</span>
                    {w.urgent && w.status !== 'done' && <span className="bg-red-600 text-white px-2 py-1 rounded-lg text-[9px] font-black uppercase animate-pulse">Urgente</span>}
                  </div>
                  <div>
                    <h3 className="text-xl font-black leading-tight text-slate-900">{w.title}</h3>
                    {w.where && <p className="text-[11px] font-black uppercase text-slate-400 tracking-wide mt-1">📍 {w.where}</p>}
                  </div>
                  {w.description && <p className="text-slate-600 font-medium whitespace-pre-wrap">{w.description}</p>}
                  {w.note && <p className="bg-yellow-50 border-l-4 border-yellow-400 text-slate-700 font-bold text-sm p-3 rounded-r-xl whitespace-pre-wrap">{w.note}</p>}
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Segnalato {ago(w.createdAt)}{w.createdBy ? ` da ${w.createdBy}` : ''}</p>
                </div>
                <div className="bg-slate-50 border-t p-3 space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(WORK_STATUS).map(([id, s]) => (
                      <button key={id} onClick={() => setStatus(w, id)} className={`py-3 rounded-xl font-black text-[11px] uppercase transition-all active:scale-95 ${w.status === id ? s.on : `bg-white text-slate-400 border-2 ${s.dot}`}`}>{s.label}</button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditing(w)} className={`${BTN_SOFT} flex-1`}><Icon name="pencil" size={14} /> Modifica</button>
                    {isManager && <button onClick={() => remove(w)} className="px-4 py-3 rounded-2xl bg-red-50 text-red-600 border-2 border-red-100 active:scale-95"><Icon name="trash" size={16} /></button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {isManager && counts.done > 0 && <button onClick={clearDone} className={`${BTN_SOFT} w-full`}><Icon name="trash" size={14} /> Elimina tutti i lavori fatti</button>}

      <AddFab onClick={() => setEditing('new')}>Nuova voce</AddFab>
      {editing && <WorkModal initial={editing === 'new' ? null : editing} role={role} onClose={() => setEditing(null)} />}
    </PageShell>
  );
}

// ============================================================
//  CHECK-LIST CONTROLLI PERIODICI
//  Frequenza libera per ogni controllo: giornaliera, settimanale,
//  mensile, annuale oppure ogni N giorni.
// ============================================================
function CheckModal({ initial, onClose }) {
  const [title, setTitle] = useState(initial ? initial.title : '');
  const [area, setArea] = useState(initial ? initial.area || '' : '');
  const [notes, setNotes] = useState(initial ? initial.notes || '' : '');
  const [frequency, setFrequency] = useState(initial ? initial.frequency : 'daily');
  const [everyDays, setEveryDays] = useState(initial && initial.everyDays ? String(initial.everyDays) : '15');
  const [lastDate, setLastDate] = useState(initial && initial.lastDoneAt ? toISODate(new Date(initial.lastDoneAt)) : '');
  const [busy, setBusy] = useState(false);
  const origLast = initial && initial.lastDoneAt ? toISODate(new Date(initial.lastDoneAt)) : '';

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const data = {
        title: title.trim(), area: area.trim(), notes: notes.trim(), frequency,
        everyDays: frequency === 'custom' ? Math.max(1, parseInt(everyDays, 10) || 1) : null
      };
      if (lastDate !== origLast) {
        // data scelta a mano -> mezzogiorno locale, così non cambia giorno con il fuso orario
        const [y, m, d] = (lastDate || '').split('-').map(Number);
        data.lastDoneAt = lastDate ? new Date(y, m - 1, d, 12).toISOString() : null;
        if (!lastDate) data.lastDoneBy = null;
      }
      if (initial) await updateDoc(doc(db, 'checks', initial.id), data);
      else await addDoc(collection(db, 'checks'), { lastDoneAt: null, lastDoneBy: null, ...data, createdAt: new Date().toISOString() });
      onClose();
    } catch (err) { alert('Errore: ' + err.message); setBusy(false); }
  };

  return (
    <Modal onClose={onClose}>
      <ModalHeader title={initial ? 'Modifica controllo' : 'Nuovo controllo'} subtitle="Check-list" onClose={onClose} />
      <form onSubmit={submit} className="p-5 sm:p-6 space-y-5 overflow-y-auto">
        <div>
          <label className={LABEL}>Controllo</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Es. Temperatura frigoriferi / Controllo estintori" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Ogni quanto</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(FREQ).map(([id, f]) => (
              <button type="button" key={id} onClick={() => setFrequency(id)} className={`py-3 rounded-2xl font-black text-xs uppercase transition-all ${frequency === id ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-50 text-slate-500 border-2 border-slate-100'}`}>{f.label}</button>
            ))}
          </div>
          {frequency === 'custom' && (
            <div className="mt-3 flex items-center gap-3">
              <span className="font-black text-slate-500 text-sm uppercase">Ogni</span>
              <input type="number" min="1" value={everyDays} onChange={(e) => setEveryDays(e.target.value)} className={`${INPUT} !w-28 text-center`} />
              <span className="font-black text-slate-500 text-sm uppercase">giorni</span>
            </div>
          )}
        </div>
        <div>
          <label className={LABEL}>Dove / reparto (facoltativo)</label>
          <input value={area} onChange={(e) => setArea(e.target.value)} placeholder="Es. Cucina, Piscina, Hall" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>Note (facoltativo)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${INPUT} resize-none`} placeholder="Cosa controllare, valori attesi..."></textarea>
        </div>
        <div>
          <label className={LABEL}>Ultima volta eseguito (vuoto = mai)</label>
          <input type="date" value={lastDate} onChange={(e) => setLastDate(e.target.value)} className={INPUT} />
        </div>
        <button type="submit" disabled={busy} className={BTN_PRIMARY}>{initial ? 'Salva modifiche' : 'Aggiungi controllo'}</button>
      </form>
    </Modal>
  );
}

function CheckHistoryModal({ check, isManager, onClose }) {
  const [logs, setLogs] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const snap = await getDocs(query(collection(db, 'checkLogs'), where('checkId', '==', check.id)));
      const l = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
      setLogs(l);
    } catch (e) { setError(e.message); }
  }, [check.id]);
  useEffect(() => { load(); }, [load]);

  // annulla l'ultima esecuzione (solo manager): serve se qualcuno ha spuntato per sbaglio
  const undoLast = async () => {
    if (!logs || !logs.length || !confirm('Annullare l\'ultima esecuzione registrata?')) return;
    try {
      await deleteDoc(doc(db, 'checkLogs', logs[0].id));
      const prev = logs[1];
      await updateDoc(doc(db, 'checks', check.id), {
        lastDoneAt: prev ? prev.at : null,
        lastDoneBy: prev ? prev.by || null : null
      });
      await load();
    } catch (e) { alert('Errore: ' + e.message); }
  };

  return (
    <Modal onClose={onClose}>
      <ModalHeader title="Storico" subtitle={check.title} onClose={onClose} />
      <div className="p-5 sm:p-6 overflow-y-auto space-y-3">
        {error && <div className="bg-red-100 text-red-800 p-3 rounded-xl text-xs font-bold">{error}</div>}
        {logs === null && !error && <p className="text-slate-400 font-bold italic">Caricamento...</p>}
        {logs && logs.length === 0 && <Empty>Mai eseguito</Empty>}
        {logs && logs.slice(0, 60).map((l) => {
          const d = new Date(l.at);
          return (
            <div key={l.id} className="flex justify-between items-center bg-slate-50 rounded-2xl p-4">
              <span className="font-black text-slate-800">{DAYS_SHORT[dowMon0(d)]} {fmtDateIT(d)}</span>
              <span className="text-sm font-bold text-slate-500">{fmtTimeIT(d)} · {l.by || '—'}</span>
            </div>
          );
        })}
        {isManager && logs && logs.length > 0 && (
          <button onClick={undoLast} className={`${BTN_SOFT} w-full`}><Icon name="undo" size={14} /> Annulla l'ultima esecuzione</button>
        )}
      </div>
    </Modal>
  );
}

function ChecklistPage({ checks, role, isManager, today, onBack }) {
  const [filter, setFilter] = useState('due');
  const [editing, setEditing] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const [armed, setArmed] = useState(null); // conferma in due tocchi, per evitare spunte per sbaglio

  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(null), 3500);
    return () => clearTimeout(t);
  }, [armed]);

  const enriched = useMemo(() => {
    const order = { overdue: 0, due: 1, soon: 2, ok: 3 };
    return checks
      .map((c) => ({ ...c, st: checkStatus(c, today) }))
      .sort((a, b) => order[a.st.state] - order[b.st.state] || a.st.daysLeft - b.st.daysLeft || (a.title || '').localeCompare(b.title || ''));
  }, [checks, today]);

  const dueCount = enriched.filter((c) => c.st.state === 'due' || c.st.state === 'overdue').length;
  const list = enriched.filter((c) => {
    if (filter === 'due') return c.st.state === 'due' || c.st.state === 'overdue';
    if (filter === 'all') return true;
    return c.frequency === filter;
  });

  const markDone = async (c) => {
    if (armed !== c.id) { setArmed(c.id); return; }
    setArmed(null);
    try {
      const at = new Date().toISOString();
      await addDoc(collection(db, 'checkLogs'), { checkId: c.id, title: c.title, at, by: role });
      await updateDoc(doc(db, 'checks', c.id), { lastDoneAt: at, lastDoneBy: role });
    } catch (e) { alert('Errore: ' + e.message); }
  };

  const remove = async (c) => {
    if (!confirm(`Eliminare il controllo «${c.title}» e il suo storico?`)) return;
    try {
      const snap = await getDocs(query(collection(db, 'checkLogs'), where('checkId', '==', c.id)));
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.delete(d.ref));
      batch.delete(doc(db, 'checks', c.id));
      await batch.commit();
    } catch (e) { alert('Errore: ' + e.message); }
  };

  const stateStyle = {
    overdue: { bar: 'border-red-600', tag: 'bg-red-600 text-white' },
    due: { bar: 'border-orange-500', tag: 'bg-orange-500 text-white' },
    soon: { bar: 'border-yellow-400', tag: 'bg-yellow-100 text-yellow-800' },
    ok: { bar: 'border-white', tag: 'bg-green-100 text-green-800' }
  };

  const label = (c) => {
    const s = c.st;
    if (s.never) return 'Mai eseguito';
    if (s.state === 'overdue') return `In ritardo di ${-s.daysLeft} ${-s.daysLeft === 1 ? 'giorno' : 'giorni'}`;
    if (s.state === 'due') return 'Da fare oggi';
    return `Prossimo: ${fmtDayMonth(s.due)}${s.daysLeft === 1 ? ' (domani)' : ` (tra ${s.daysLeft} gg)`}`;
  };

  return (
    <PageShell title="Check-list" subtitle="Controlli periodici" onBack={onBack}>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <Chip active={filter === 'due'} onClick={() => setFilter('due')} color="bg-orange-600">Da fare ({dueCount})</Chip>
        <Chip active={filter === 'all'} onClick={() => setFilter('all')}>Tutti ({checks.length})</Chip>
        {Object.entries(FREQ).filter(([id]) => id !== 'custom').map(([id, f]) => (
          <Chip key={id} active={filter === id} onClick={() => setFilter(id)} color="bg-emerald-600">{f.label}</Chip>
        ))}
        <Chip active={filter === 'custom'} onClick={() => setFilter('custom')} color="bg-emerald-600">Ogni N gg</Chip>
      </div>

      {list.length === 0 ? (
        <Empty>{filter === 'due' ? (checks.length ? 'Tutto fatto! 🎉' : 'Nessun controllo inserito') : 'Nessun controllo'}</Empty>
      ) : (
        <div className="space-y-4">
          {list.map((c) => {
            const stl = stateStyle[c.st.state];
            const doneToday = c.lastDoneAt && diffDays(new Date(c.lastDoneAt), today) === 0;
            const last = c.lastDoneAt ? new Date(c.lastDoneAt) : null;
            return (
              <div key={c.id} className={`bg-white rounded-[2rem] shadow-xl border-4 ${stl.bar} overflow-hidden`}>
                <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap gap-2 items-center">
                      <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase">
                        {c.frequency === 'custom' ? `Ogni ${c.everyDays} gg` : FREQ[c.frequency] ? FREQ[c.frequency].label : c.frequency}
                      </span>
                      {c.area && <span className="text-[10px] font-black uppercase text-slate-400">📍 {c.area}</span>}
                    </div>
                    <h3 className="text-xl font-black leading-tight text-slate-900">{c.title}</h3>
                    {c.notes && <p className="text-sm font-medium text-slate-500 whitespace-pre-wrap">{c.notes}</p>}
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${stl.tag}`}>{label(c)}</span>
                      {last && <span className="text-[10px] font-bold text-slate-400 uppercase">Ultimo: {fmtDayMonth(last)} {fmtTimeIT(last)}{c.lastDoneBy ? ` · ${c.lastDoneBy}` : ''}</span>}
                    </div>
                  </div>
                  <div className="sm:w-52 flex-shrink-0">
                    {doneToday ? (
                      <div className="w-full bg-green-100 text-green-700 py-4 rounded-2xl font-black text-center flex items-center justify-center gap-2"><Icon name="check-circle" size={20} /> FATTO</div>
                    ) : (
                      <button
                        onClick={() => markDone(c)}
                        className={`w-full py-4 rounded-2xl font-black text-lg uppercase active:scale-95 transition-all flex items-center justify-center gap-2 ${armed === c.id ? 'bg-green-600 text-white animate-pulse' : c.st.state === 'ok' || c.st.state === 'soon' ? 'bg-slate-100 text-slate-500' : 'bg-slate-900 text-white'}`}
                      >
                        <Icon name="check-square" size={20} /> {armed === c.id ? 'Conferma?' : 'Fatto'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="bg-slate-50 border-t px-3 py-2 flex gap-2 justify-end">
                  <button onClick={() => setHistoryFor(c)} className={BTN_SOFT}><Icon name="history" size={14} /> Storico</button>
                  {isManager && <button onClick={() => setEditing(c)} className={BTN_SOFT}><Icon name="pencil" size={14} /> Modifica</button>}
                  {isManager && <button onClick={() => remove(c)} className="px-4 py-3 rounded-2xl bg-red-50 text-red-600 border-2 border-red-100 active:scale-95"><Icon name="trash" size={16} /></button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isManager && <AddFab onClick={() => setEditing('new')}>Nuovo controllo</AddFab>}
      {editing && <CheckModal initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {historyFor && <CheckHistoryModal check={historyFor} isManager={isManager} onClose={() => setHistoryFor(null)} />}
    </PageShell>
  );
}

// ============================================================
//  DIPENDENTI  (anagrafica pubblica + dati riservati agli admin)
//  employees/{id}         -> nome, ruolo, tipo, orario standard (visibile allo staff, serve ai turni)
//  employeesPrivate/{id}  -> ore settimanali di contratto, telefono (solo admin)
// ============================================================
function useEmployees(isManager) {
  const [employees, setEmployees] = useState([]);
  const [priv, setPriv] = useState({});
  const [error, setError] = useState('');
  useEffect(() => {
    const u1 = onSnapshot(
      collection(db, 'employees'),
      (s) => setEmployees(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (e) => setError(e.message)
    );
    let u2 = () => {};
    if (isManager) {
      u2 = onSnapshot(
        collection(db, 'employeesPrivate'),
        (s) => { const o = {}; s.docs.forEach((d) => { o[d.id] = d.data(); }); setPriv(o); },
        (e) => setError(e.message)
      );
    }
    return () => { u1(); u2(); };
  }, [isManager]);
  return { employees, priv, error };
}

const ROLE_SUGGESTIONS = ['Cuoco', 'Aiuto cuoco', 'Lavapiatti', 'Barista', 'Cameriere', 'Reception', 'Pulizie / Housekeeping', 'Manutentore', 'Animatore', 'Bagnino', 'Altro'];
const padSlots = (rs) => {
  const c = cleanRanges(rs);
  return [c[0] || { from: '', to: '' }, c[1] || { from: '', to: '' }];
};

function EmployeeModal({ initial, initialPriv, onClose }) {
  const [firstName, setFirstName] = useState(initial ? initial.firstName || '' : '');
  const [lastName, setLastName] = useState(initial ? initial.lastName || '' : '');
  const [role, setRole] = useState(initial ? initial.role || '' : '');
  const [type, setType] = useState(initial ? initial.type || 'fisso' : 'fisso');
  const [active, setActive] = useState(initial ? initial.active !== false : true);
  const [weeklyHours, setWeeklyHours] = useState(initialPriv && initialPriv.weeklyHours ? String(initialPriv.weeklyHours) : '');
  const [phone, setPhone] = useState(initialPriv ? initialPriv.phone || '' : '');
  const [schedule, setSchedule] = useState(() => {
    const s = {};
    for (let i = 0; i < 7; i++) s[i] = padSlots(initial && initial.schedule ? initial.schedule[i] || initial.schedule[String(i)] : []);
    return s;
  });
  const [busy, setBusy] = useState(false);

  const setSlot = (dow, slot, key, val) =>
    setSchedule((prev) => {
      const day = prev[dow].map((x) => ({ ...x }));
      day[slot][key] = val;
      return { ...prev, [dow]: day };
    });

  const copyMonToWeekdays = () =>
    setSchedule((prev) => {
      const next = { ...prev };
      for (let i = 1; i <= 4; i++) next[i] = prev[0].map((x) => ({ ...x }));
      return next;
    });
  const clearAll = () => setSchedule(() => { const s = {}; for (let i = 0; i < 7; i++) s[i] = padSlots([]); return s; });

  const weekTotal = r2([0, 1, 2, 3, 4, 5, 6].reduce((s, i) => s + sumHours(schedule[i]), 0));
  const W = parseFloat(String(weeklyHours).replace(',', '.')) || 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!firstName.trim() && !lastName.trim()) return;
    setBusy(true);
    try {
      const id = initial ? initial.id : doc(collection(db, 'employees')).id;
      const cleaned = {};
      for (let i = 0; i < 7; i++) cleaned[i] = cleanRanges(schedule[i]);
      const batch = writeBatch(db);
      batch.set(doc(db, 'employees', id), {
        firstName: firstName.trim(), lastName: lastName.trim(), role: role.trim(), type, active,
        schedule: cleaned, updatedAt: new Date().toISOString()
      });
      batch.set(doc(db, 'employeesPrivate', id), { weeklyHours: W, phone: phone.trim() });
      await batch.commit();
      onClose();
    } catch (err) { alert('Errore: ' + err.message); setBusy(false); }
  };

  return (
    <Modal onClose={onClose} size="max-w-2xl" z="z-[450]">
      <ModalHeader title={initial ? 'Modifica dipendente' : 'Nuovo dipendente'} subtitle="Anagrafica e orario di lavoro" onClose={onClose} />
      <form onSubmit={submit} className="p-5 sm:p-6 space-y-5 overflow-y-auto">
        <div className="grid grid-cols-2 gap-3">
          <div><label className={LABEL}>Nome</label><input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={INPUT} /></div>
          <div><label className={LABEL}>Cognome</label><input value={lastName} onChange={(e) => setLastName(e.target.value)} className={INPUT} /></div>
        </div>
        <div>
          <label className={LABEL}>Ruolo</label>
          <input value={role} onChange={(e) => setRole(e.target.value)} list="role-suggestions" placeholder="Es. Cameriere" className={INPUT} />
          <datalist id="role-suggestions">{ROLE_SUGGESTIONS.map((r) => <option key={r} value={r} />)}</datalist>
        </div>
        <div>
          <label className={LABEL}>Tipo di contratto</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setType('fisso')} className={`py-4 rounded-2xl font-black text-xs uppercase transition-all ${type === 'fisso' ? 'bg-slate-900 text-white shadow-lg' : 'bg-slate-50 text-slate-500 border-2 border-slate-100'}`}>Orario fisso</button>
            <button type="button" onClick={() => setType('chiamata')} className={`py-4 rounded-2xl font-black text-xs uppercase transition-all ${type === 'chiamata' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-slate-50 text-slate-500 border-2 border-slate-100'}`}>A chiamata</button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>{type === 'fisso' ? 'Ore a settimana (contratto)' : 'Soglia ore/sett. (facoltativa)'}</label>
            <input inputMode="decimal" value={weeklyHours} onChange={(e) => setWeeklyHours(e.target.value)} placeholder="Es. 40" className={INPUT} />
          </div>
          <div>
            <label className={LABEL}>Telefono (per WhatsApp)</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="333 1234567" className={INPUT} />
          </div>
        </div>
        {type === 'chiamata' && (
          <p className="bg-indigo-50 text-indigo-800 text-xs font-bold p-3 rounded-xl">Nessun orario fisso: gli orari si inseriscono ogni settimana nei Turni. Se indichi una soglia settimanale, le ore oltre la soglia risultano come straordinario nel LUL; se la lasci vuota tutte le ore sono ordinarie.</p>
        )}

        {type === 'fisso' && (
          <div className="space-y-3">
            <div className="flex justify-between items-end">
              <label className={`${LABEL} !mb-0`}>Orario standard della settimana</label>
              <span className={`text-xs font-black ${W > 0 && Math.abs(weekTotal - W) > 0.01 ? 'text-orange-600' : 'text-slate-500'}`}>
                Totale {fmtNum(weekTotal)} h{W > 0 ? ` / contratto ${fmtNum(W)} h` : ''}
              </span>
            </div>
            {W > 0 && Math.abs(weekTotal - W) > 0.01 && weekTotal > 0 && (
              <p className="bg-orange-50 text-orange-800 text-xs font-bold p-3 rounded-xl">L'orario inserito ({fmtNum(weekTotal)} h) non coincide con le ore di contratto ({fmtNum(W)} h). Nel LUL le ore previste verranno riproporzionate sul contratto.</p>
            )}
            {[0, 1, 2, 3, 4, 5, 6].map((dow) => (
              <div key={dow} className="bg-slate-50 rounded-2xl p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-black uppercase text-sm text-slate-700">{DAYS_LONG[dow]}</span>
                  <span className="text-xs font-black text-slate-400">{sumHours(schedule[dow]) ? `${fmtNum(sumHours(schedule[dow]))} h` : 'Riposo'}</span>
                </div>
                {[0, 1].map((slot) => (
                  <div key={slot} className="flex items-center gap-2">
                    <input type="time" value={schedule[dow][slot].from} onChange={(ev) => setSlot(dow, slot, 'from', ev.target.value)} className={INPUT_SM} />
                    <span className="font-black text-slate-400">–</span>
                    <input type="time" value={schedule[dow][slot].to} onChange={(ev) => setSlot(dow, slot, 'to', ev.target.value)} className={INPUT_SM} />
                  </div>
                ))}
              </div>
            ))}
            <div className="flex gap-2">
              <button type="button" onClick={copyMonToWeekdays} className={`${BTN_SOFT} flex-1`}><Icon name="copy" size={14} /> Copia lunedì su mar–ven</button>
              <button type="button" onClick={clearAll} className={BTN_SOFT}><Icon name="trash" size={14} /></button>
            </div>
          </div>
        )}

        <label className="flex items-center gap-3 font-black uppercase text-xs text-slate-600 cursor-pointer">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="w-6 h-6" />
          In servizio (se tolto, non compare più in turni e LUL)
        </label>
        <button type="submit" disabled={busy} className={BTN_PRIMARY}>{initial ? 'Salva modifiche' : 'Aggiungi dipendente'}</button>
      </form>
    </Modal>
  );
}

function EmployeesTab({ employees, priv }) {
  const [editing, setEditing] = useState(null);
  const sorted = useMemo(() => [...employees].sort(empSort), [employees]);

  const remove = async (e) => {
    if (!confirm(`Eliminare ${empName(e)}? Sparirà da turni e LUL. (Per tenerlo in archivio basta toglierlo dal servizio.)`)) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'employees', e.id));
      batch.delete(doc(db, 'employeesPrivate', e.id));
      await batch.commit();
    } catch (err) { alert('Errore: ' + err.message); }
  };

  return (
    <div className="space-y-4">
      <button onClick={() => setEditing('new')} className={BTN_PRIMARY}><Icon name="user-plus" size={22} className="inline mr-2 -mt-1" /> Nuovo dipendente</button>
      {sorted.length === 0 && <Empty>Nessun dipendente inserito</Empty>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sorted.map((e) => {
          const p = priv[e.id] || {};
          const days = [0, 1, 2, 3, 4, 5, 6].filter((i) => fmtRanges(e.schedule && (e.schedule[i] || e.schedule[String(i)])));
          return (
            <div key={e.id} className={`bg-white rounded-[2rem] shadow-xl border-4 border-white p-5 space-y-3 ${e.active === false ? 'opacity-60' : ''}`}>
              <div className="flex justify-between items-start gap-2">
                <div className="min-w-0">
                  <h3 className="text-xl font-black leading-tight text-slate-900 truncate">{empName(e)}</h3>
                  <p className="text-[11px] font-black uppercase text-slate-400 tracking-wide">{e.role || 'Senza ruolo'}</p>
                </div>
                <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase flex-shrink-0 ${e.type === 'chiamata' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'}`}>{e.type === 'chiamata' ? 'A chiamata' : 'Fisso'}</span>
              </div>
              <div className="text-sm font-bold text-slate-600 space-y-1">
                <p>{p.weeklyHours ? `${fmtNum(p.weeklyHours)} ore a settimana` : <span className="text-orange-600">Ore settimanali non impostate</span>}</p>
                {p.phone && <p className="text-slate-400">📞 {p.phone}</p>}
                {e.type !== 'chiamata' && (
                  days.length === 0 ? <p className="text-orange-600">Orario standard non impostato</p> : (
                    <div className="text-xs text-slate-500 space-y-0.5 pt-1">
                      {days.map((i) => <p key={i}><b className="text-slate-700">{DAYS_SHORT[i]}</b> {fmtRanges(e.schedule[i] || e.schedule[String(i)])}</p>)}
                    </div>
                  )
                )}
                {e.active === false && <p className="text-red-600 uppercase text-[10px] font-black">Non in servizio</p>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditing(e)} className={`${BTN_SOFT} flex-1`}><Icon name="pencil" size={14} /> Modifica</button>
                <button onClick={() => remove(e)} className="px-4 py-3 rounded-2xl bg-red-50 text-red-600 border-2 border-red-100 active:scale-95"><Icon name="trash" size={16} /></button>
              </div>
            </div>
          );
        })}
      </div>
      {editing && <EmployeeModal initial={editing === 'new' ? null : editing} initialPriv={editing === 'new' ? null : priv[editing.id]} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ============================================================
//  TURNI DELLA SETTIMANA
//  shifts/{lunedì-della-settimana}  ->  assignments: { [idDipendente]: { 0..6: [{from,to}] } }
//  cella non presente = "—" (non assegnato), cella [] = "Riposo"
// ============================================================
const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (err) { /* ignore */ }
    document.body.removeChild(ta);
  }
  alert('Copiato negli appunti ✓');
};

function ShiftCellModal({ emp, dow, date, current, standard, onSave, onClose }) {
  const [slots, setSlots] = useState(() => padSlots(current));
  const setVal = (i, key, v) => setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, [key]: v } : s)));
  const std = cleanRanges(standard);
  return (
    <Modal onClose={onClose} z="z-[450]">
      <ModalHeader title={empName(emp)} subtitle={`${DAYS_LONG[dow]} ${fmtDayMonth(date)}`} onClose={onClose} />
      <div className="p-5 sm:p-6 space-y-4 overflow-y-auto">
        {slots.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="time" value={s.from} onChange={(e) => setVal(i, 'from', e.target.value)} className={INPUT} />
            <span className="font-black text-slate-400">–</span>
            <input type="time" value={s.to} onChange={(e) => setVal(i, 'to', e.target.value)} className={INPUT} />
          </div>
        ))}
        <p className="text-xs font-black text-slate-400 uppercase text-center">Totale giornata: {fmtNum(sumHours(slots))} h</p>
        <div className="grid grid-cols-2 gap-2">
          {std.length > 0 && <button type="button" onClick={() => setSlots(padSlots(std))} className={BTN_SOFT}>Orario standard</button>}
          <button type="button" onClick={() => onSave([])} className={BTN_SOFT}>Riposo</button>
          <button type="button" onClick={() => onSave(undefined)} className={BTN_SOFT}>Svuota cella</button>
        </div>
        <button type="button" onClick={() => onSave(cleanRanges(slots))} className={BTN_PRIMARY}>Salva</button>
      </div>
    </Modal>
  );
}

function ShiftsPage({ isManager, today, onBack }) {
  const { employees, priv, error } = useEmployees(isManager);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(today));
  const weekKey = toISODate(weekStart);
  const [shift, setShift] = useState(null);
  const [view, setView] = useState('grid');
  const [cell, setCell] = useState(null);
  const [showEmployees, setShowEmployees] = useState(false);
  const [readError, setReadError] = useState('');

  useEffect(() => {
    setShift(null);
    const unsub = onSnapshot(
      doc(db, 'shifts', weekKey),
      (s) => setShift(s.exists() ? s.data() : {}),
      (e) => setReadError(e.message)
    );
    return () => unsub();
  }, [weekKey]);

  const active = useMemo(() => employees.filter((e) => e.active !== false).sort(empSort), [employees]);
  const assignments = (shift && shift.assignments) || {};
  const getCell = (empId, dow) => {
    const a = assignments[empId];
    if (!a) return undefined;
    return a[dow] !== undefined ? a[dow] : a[String(dow)];
  };
  const weekTotal = (empId) => r2([0, 1, 2, 3, 4, 5, 6].reduce((s, d) => s + sumHours(getCell(empId, d)), 0));
  const dates = [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(weekStart, i));
  const isCurrentWeek = weekKey === toISODate(startOfWeek(today));
  const todayDow = dowMon0(today);
  const weekLabel = `${fmtDayMonth(weekStart)} – ${fmtDayMonth(addDays(weekStart, 6))} ${addDays(weekStart, 6).getFullYear()}`;

  const writeCell = async (empId, dow, value) => {
    try {
      await setDoc(doc(db, 'shifts', weekKey), {
        weekStart: weekKey,
        assignments: { [empId]: { [String(dow)]: value === undefined ? deleteField() : value } },
        updatedAt: new Date().toISOString()
      }, { merge: true });
      setCell(null);
    } catch (e) { alert('Errore: ' + e.message); }
  };

  const prefill = async () => {
    const fixed = active.filter((e) => e.type !== 'chiamata');
    if (!fixed.length) { alert('Nessun dipendente a orario fisso. Inserisci prima i dipendenti.'); return; }
    const add = {};
    fixed.forEach((e) => {
      for (let d = 0; d < 7; d++) {
        if (getCell(e.id, d) === undefined) {
          const std = cleanRanges(e.schedule && (e.schedule[d] || e.schedule[String(d)]));
          if (!add[e.id]) add[e.id] = {};
          add[e.id][String(d)] = std;
        }
      }
    });
    if (!Object.keys(add).length) { alert('Le celle sono già tutte compilate.'); return; }
    try {
      await setDoc(doc(db, 'shifts', weekKey), { weekStart: weekKey, assignments: add, updatedAt: new Date().toISOString() }, { merge: true });
    } catch (e) { alert('Errore: ' + e.message); }
  };

  const copyPrev = async () => {
    const prevKey = toISODate(addDays(weekStart, -7));
    try {
      const snap = await getDoc(doc(db, 'shifts', prevKey));
      if (!snap.exists() || !snap.data().assignments) { alert('La settimana precedente è vuota.'); return; }
      if (Object.keys(assignments).length && !confirm('Questa settimana ha già dei turni: verranno sostituiti da quelli della settimana precedente. Continuare?')) return;
      await setDoc(doc(db, 'shifts', weekKey), { weekStart: weekKey, assignments: snap.data().assignments, updatedAt: new Date().toISOString() });
    } catch (e) { alert('Errore: ' + e.message); }
  };

  const clearWeek = async () => {
    if (!Object.keys(assignments).length || !confirm('Svuotare tutti i turni di questa settimana?')) return;
    try { await deleteDoc(doc(db, 'shifts', weekKey)); } catch (e) { alert('Errore: ' + e.message); }
  };

  const buildMessage = (emp) => {
    const lines = [`Ciao ${emp.firstName || ''}, ecco i tuoi turni da lunedì ${fmtDayMonth(weekStart)} a domenica ${fmtDayMonth(addDays(weekStart, 6))}:`.replace('  ', ' ')];
    for (let d = 0; d < 7; d++) {
      const rs = getCell(emp.id, d);
      const txt = rs === undefined ? '—' : fmtRanges(rs) || 'Riposo';
      lines.push(`${DAYS_SHORT[d]} ${fmtDayMonth(dates[d])}: ${txt}`);
    }
    lines.push(`Totale: ${fmtNum(weekTotal(emp.id))} ore`);
    return lines.join('\n');
  };
  const hasShifts = (empId) => [0, 1, 2, 3, 4, 5, 6].some((d) => cleanRanges(getCell(empId, d)).length > 0);
  const withShifts = active.filter((e) => hasShifts(e.id));

  const sendWhatsApp = (emp) => {
    const num = waNumber(priv[emp.id] && priv[emp.id].phone);
    const url = `https://wa.me/${num}?text=${encodeURIComponent(buildMessage(emp))}`;
    window.open(url, '_blank', 'noopener');
  };

  const copyAll = () => {
    const parts = [`TURNI SETTIMANA ${weekLabel}`, ''];
    withShifts.forEach((e) => {
      parts.push(`${empName(e)}${e.role ? ` (${e.role})` : ''}`);
      for (let d = 0; d < 7; d++) {
        const rs = getCell(e.id, d);
        if (rs === undefined) continue;
        parts.push(`  ${DAYS_SHORT[d]} ${fmtDayMonth(dates[d])}: ${fmtRanges(rs) || 'Riposo'}`);
      }
      parts.push('');
    });
    copyText(parts.join('\n').trim());
  };

  const noPhone = withShifts.filter((e) => !(priv[e.id] && priv[e.id].phone)).length;

  return (
    <PageShell
      title="Turni"
      subtitle={isManager ? 'Pianifica e comunica' : 'Turni della settimana'}
      onBack={onBack}
      wide
      right={isManager ? <button onClick={() => setShowEmployees(true)} className="bg-yellow-400 text-black px-4 py-3 rounded-full font-black text-[11px] uppercase flex items-center gap-2 active:scale-95 flex-shrink-0"><Icon name="user-plus" size={16} /> Dipendenti</button> : null}
    >
      {(error || readError) && <div className="bg-red-100 text-red-800 p-3 rounded-xl text-xs font-bold">Errore di lettura: {error || readError}</div>}

      <div className="flex items-center justify-between gap-2 bg-white rounded-3xl p-3 shadow-md">
        <button onClick={() => setWeekStart(addDays(weekStart, -7))} className="bg-slate-100 p-3 rounded-2xl active:scale-95"><Icon name="chevron-left" size={22} /></button>
        <div className="text-center">
          <p className="font-black text-lg sm:text-xl text-slate-900 leading-tight">{weekLabel}</p>
          {!isCurrentWeek && <button onClick={() => setWeekStart(startOfWeek(today))} className="text-[10px] font-black uppercase text-blue-600">Torna a questa settimana</button>}
          {isCurrentWeek && <p className="text-[10px] font-black uppercase text-green-600">Settimana corrente</p>}
        </div>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} className="bg-slate-100 p-3 rounded-2xl active:scale-95"><Icon name="chevron-right" size={22} /></button>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar items-center">
        <Chip active={view === 'grid'} onClick={() => setView('grid')} color="bg-cyan-700"><Icon name="calendar" size={14} /> Settimana</Chip>
        {isManager && <Chip active={view === 'msgs'} onClick={() => setView('msgs')} color="bg-green-600"><Icon name="whatsapp" size={14} /> Comunica</Chip>}
        <div className="flex-1"></div>
        <button onClick={doPrint} className={BTN_SOFT}><Icon name="printer" size={14} /> Stampa / PDF</button>
      </div>

      {active.length === 0 ? (
        <Empty>{isManager ? 'Inserisci i dipendenti con il tasto «Dipendenti» in alto' : 'Nessun dipendente inserito'}</Empty>
      ) : view === 'grid' ? (
        <>
          {isManager && (
            <div className="flex flex-wrap gap-2">
              <button onClick={prefill} className={BTN_SOFT}><Icon name="refresh" size={14} /> Precompila da orari standard</button>
              <button onClick={copyPrev} className={BTN_SOFT}><Icon name="copy" size={14} /> Copia settimana precedente</button>
              <button onClick={clearWeek} className={BTN_SOFT}><Icon name="trash" size={14} /> Svuota settimana</button>
            </div>
          )}
          <div className="overflow-x-auto bg-white rounded-3xl shadow-xl border-4 border-white">
            <table className="w-full border-collapse text-sm min-w-[780px]">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="sticky left-0 z-10 bg-slate-900 p-3 text-left text-[11px] font-black uppercase min-w-[10rem]">Dipendente</th>
                  {dates.map((d, i) => (
                    <th key={i} className={`p-3 text-[11px] font-black uppercase ${isCurrentWeek && i === todayDow ? 'bg-yellow-400 text-black' : ''}`}>
                      {DAYS_SHORT[i]}<br /><span className="font-bold opacity-70">{fmtDayMonth(d)}</span>
                    </th>
                  ))}
                  <th className="p-3 text-[11px] font-black uppercase">Ore</th>
                </tr>
              </thead>
              <tbody>
                {active.map((e) => {
                  const tot = weekTotal(e.id);
                  const W = priv[e.id] && priv[e.id].weeklyHours;
                  return (
                    <tr key={e.id} className="border-t border-slate-100">
                      <td className="sticky left-0 z-10 bg-white p-3 border-r border-slate-100">
                        <p className="font-black text-slate-900 leading-tight">{empName(e)}</p>
                        <p className="text-[10px] font-bold uppercase text-slate-400">{e.role}{e.type === 'chiamata' ? ' · chiamata' : ''}</p>
                      </td>
                      {dates.map((d, i) => {
                        const rs = getCell(e.id, i);
                        const txt = rs === undefined ? null : fmtRanges(rs);
                        return (
                          <td
                            key={i}
                            onClick={() => isManager && setCell({ emp: e, dow: i })}
                            className={`p-2 text-center align-middle ${isManager ? 'cursor-pointer hover:bg-yellow-50' : ''} ${isCurrentWeek && i === todayDow ? 'bg-yellow-50/60' : ''}`}
                          >
                            {rs === undefined ? <span className="text-slate-300 font-black">—</span>
                              : txt ? <span className="font-black text-slate-800 text-xs leading-snug block">{cleanRanges(rs).map((r, k) => <span key={k} className="block whitespace-nowrap">{r.from}–{r.to}</span>)}</span>
                                : <span className="text-[10px] font-black uppercase text-slate-400 italic">Riposo</span>}
                          </td>
                        );
                      })}
                      <td className="p-3 text-center">
                        <span className="font-black text-slate-900">{fmtNum(tot)}</span>
                        {isManager && W > 0 && (
                          <span className={`block text-[10px] font-black ${tot > W + 0.01 ? 'text-red-600' : tot < W - 0.01 && e.type !== 'chiamata' ? 'text-orange-500' : 'text-slate-400'}`}>
                            su {fmtNum(W)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {isManager && <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest text-center">Tocca una cella per modificare · — = non assegnato</p>}
        </>
      ) : (
        <div className="space-y-4">
          {withShifts.length === 0 ? (
            <Empty>Nessun turno inserito in questa settimana</Empty>
          ) : (
            <>
              <button onClick={copyAll} className={`${BTN_SOFT} w-full`}><Icon name="copy" size={14} /> Copia il riepilogo di tutti</button>
              {noPhone > 0 && <p className="bg-orange-50 text-orange-800 text-xs font-bold p-3 rounded-xl">{noPhone} dipendent{noPhone === 1 ? 'e' : 'i'} senza telefono: WhatsApp si aprirà senza destinatario e potrai sceglierlo tu.</p>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {withShifts.map((e) => (
                  <div key={e.id} className="bg-white rounded-[2rem] shadow-xl border-4 border-white p-5 space-y-3">
                    <div>
                      <h3 className="text-xl font-black text-slate-900 leading-tight">{empName(e)}</h3>
                      <p className="text-[10px] font-black uppercase text-slate-400">{e.role}</p>
                    </div>
                    <pre className="bg-slate-50 rounded-2xl p-3 text-sm font-medium text-slate-700 whitespace-pre-wrap font-sans">{buildMessage(e)}</pre>
                    <div className="flex gap-2">
                      <button onClick={() => sendWhatsApp(e)} className="flex-1 bg-green-600 text-white py-3 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 active:scale-95"><Icon name="whatsapp" size={16} /> WhatsApp</button>
                      <button onClick={() => copyText(buildMessage(e))} className={BTN_SOFT}><Icon name="copy" size={14} /> Copia</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {cell && (
        <ShiftCellModal
          emp={cell.emp}
          dow={cell.dow}
          date={dates[cell.dow]}
          current={getCell(cell.emp.id, cell.dow)}
          standard={cell.emp.schedule && (cell.emp.schedule[cell.dow] || cell.emp.schedule[String(cell.dow)])}
          onSave={(v) => writeCell(cell.emp.id, cell.dow, v)}
          onClose={() => setCell(null)}
        />
      )}
      {showEmployees && (
        <Modal onClose={() => setShowEmployees(false)} size="max-w-3xl" z="z-[400]">
          <ModalHeader title="Dipendenti" subtitle="Anagrafica e orario standard" onClose={() => setShowEmployees(false)} />
          <div className="p-5 sm:p-6 overflow-y-auto"><EmployeesTab employees={employees} priv={priv} /></div>
        </Modal>
      )}

      <PrintSheet landscape>
        <h1>Turni settimana {weekLabel}</h1>
        <p>Lucciole nella Nebbia</p>
        <table>
          <thead>
            <tr>
              <th className="l">Dipendente</th>
              {dates.map((d, i) => <th key={i}>{DAYS_SHORT[i]} {fmtDayMonth(d)}</th>)}
              <th>Ore</th>
            </tr>
          </thead>
          <tbody>
            {active.map((e) => (
              <tr key={e.id}>
                <td className="l"><b>{empName(e)}</b><br />{e.role}</td>
                {dates.map((d, i) => {
                  const rs = getCell(e.id, i);
                  return <td key={i}>{rs === undefined ? '—' : cleanRanges(rs).length ? cleanRanges(rs).map((r, k) => <div key={k}>{r.from}–{r.to}</div>) : 'Riposo'}</td>;
                })}
                <td><b>{fmtNum(weekTotal(e.id))}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </PrintSheet>
    </PageShell>
  );
}

// ============================================================
//  ECONOMIA  (solo admin e superadmin)
//  - Scadenze con promemoria
//  - Dipendenti
//  - LUL mensile con calcolo straordinari ed esportazione PDF
// ============================================================
function DeadlineModal({ initial, employees, onClose }) {
  const [title, setTitle] = useState(initial ? initial.title : '');
  const [category, setCategory] = useState(initial ? initial.category : DEADLINE_CATEGORIES[0]);
  const [employeeId, setEmployeeId] = useState(initial ? initial.employeeId || '' : '');
  const [dueDate, setDueDate] = useState(initial ? initial.dueDate : '');
  const [remindDays, setRemindDays] = useState(initial && initial.remindDays !== undefined ? String(initial.remindDays) : '30');
  const [notes, setNotes] = useState(initial ? initial.notes || '' : '');
  const [busy, setBusy] = useState(false);
  const sorted = useMemo(() => [...employees].sort(empSort), [employees]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;
    setBusy(true);
    try {
      const data = {
        title: title.trim(), category, employeeId: employeeId || null, dueDate,
        remindDays: Math.max(0, parseInt(remindDays, 10) || 0), notes: notes.trim(), updatedAt: new Date().toISOString()
      };
      if (initial) await updateDoc(doc(db, 'deadlines', initial.id), data);
      else await addDoc(collection(db, 'deadlines'), { ...data, createdAt: new Date().toISOString() });
      onClose();
    } catch (err) { alert('Errore: ' + err.message); setBusy(false); }
  };

  return (
    <Modal onClose={onClose}>
      <ModalHeader title={initial ? 'Modifica scadenza' : 'Nuova scadenza'} subtitle="Scadenziario" onClose={onClose} />
      <form onSubmit={submit} className="p-5 sm:p-6 space-y-5 overflow-y-auto">
        <div>
          <label className={LABEL}>Cosa scade</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Es. Corso sicurezza / Visita medica / Assicurazione" className={INPUT} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Tipo</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={INPUT}>
              {DEADLINE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={LABEL}>Dipendente</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={INPUT}>
              <option value="">— Generale —</option>
              {sorted.map((e) => <option key={e.id} value={e.id}>{empName(e)}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className={LABEL}>Scade il</label><input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={INPUT} /></div>
          <div><label className={LABEL}>Avvisa (giorni prima)</label><input type="number" min="0" value={remindDays} onChange={(e) => setRemindDays(e.target.value)} className={INPUT} /></div>
        </div>
        <div>
          <label className={LABEL}>Note (facoltativo)</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${INPUT} resize-none`}></textarea>
        </div>
        <button type="submit" disabled={busy} className={BTN_PRIMARY}>{initial ? 'Salva modifiche' : 'Aggiungi scadenza'}</button>
      </form>
    </Modal>
  );
}

function DeadlinesTab({ deadlines, employees, today }) {
  const [editing, setEditing] = useState(null);
  const [renewing, setRenewing] = useState(null);
  const [newDate, setNewDate] = useState('');
  const byId = useMemo(() => { const o = {}; employees.forEach((e) => { o[e.id] = e; }); return o; }, [employees]);

  const list = useMemo(
    () => deadlines.map((d) => ({ ...d, st: deadlineStatus(d, today) })).sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || '')),
    [deadlines, today]
  );

  const style = {
    expired: { bar: 'border-red-600', tag: 'bg-red-600 text-white' },
    soon: { bar: 'border-orange-500', tag: 'bg-orange-500 text-white' },
    ok: { bar: 'border-white', tag: 'bg-green-100 text-green-800' }
  };
  const label = (d) => {
    if (d.st.state === 'expired') return `Scaduta da ${-d.st.daysLeft} ${-d.st.daysLeft === 1 ? 'giorno' : 'giorni'}`;
    if (d.st.daysLeft === 0) return 'Scade oggi';
    return `Scade tra ${d.st.daysLeft} ${d.st.daysLeft === 1 ? 'giorno' : 'giorni'}`;
  };

  const remove = async (d) => {
    if (!confirm(`Eliminare «${d.title}»?`)) return;
    try { await deleteDoc(doc(db, 'deadlines', d.id)); } catch (e) { alert('Errore: ' + e.message); }
  };
  const doRenew = async () => {
    if (!newDate) return;
    try {
      await updateDoc(doc(db, 'deadlines', renewing.id), { dueDate: newDate, renewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
      setRenewing(null);
    } catch (e) { alert('Errore: ' + e.message); }
  };

  return (
    <div className="space-y-4">
      <button onClick={() => setEditing('new')} className={BTN_PRIMARY}><Icon name="plus" size={22} className="inline mr-2 -mt-1" /> Nuova scadenza</button>
      {list.length === 0 && <Empty>Nessuna scadenza inserita</Empty>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {list.map((d) => {
          const s = style[d.st.state];
          const emp = d.employeeId ? byId[d.employeeId] : null;
          return (
            <div key={d.id} className={`bg-white rounded-[2rem] shadow-xl border-4 ${s.bar} p-5 space-y-3`}>
              <div className="flex justify-between items-start gap-2">
                <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase">{d.category}</span>
                <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${s.tag}`}>{label(d)}</span>
              </div>
              <div>
                <h3 className="text-xl font-black leading-tight text-slate-900">{d.title}</h3>
                <p className="text-[11px] font-black uppercase text-slate-400 tracking-wide">{emp ? `👤 ${empName(emp)} · ` : ''}{d.dueDate ? fmtDateIT(parseISODate(d.dueDate)) : ''}</p>
              </div>
              {d.notes && <p className="text-sm font-medium text-slate-500 whitespace-pre-wrap">{d.notes}</p>}
              <div className="flex gap-2">
                <button onClick={() => { setRenewing(d); setNewDate(d.dueDate ? toISODate(addMonths(parseISODate(d.dueDate), 12)) : ''); }} className="flex-1 bg-green-600 text-white py-3 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 active:scale-95"><Icon name="refresh" size={14} /> Rinnovato</button>
                <button onClick={() => setEditing(d)} className={BTN_SOFT}><Icon name="pencil" size={14} /></button>
                <button onClick={() => remove(d)} className="px-4 py-3 rounded-2xl bg-red-50 text-red-600 border-2 border-red-100 active:scale-95"><Icon name="trash" size={16} /></button>
              </div>
            </div>
          );
        })}
      </div>
      {editing && <DeadlineModal initial={editing === 'new' ? null : editing} employees={employees} onClose={() => setEditing(null)} />}
      {renewing && (
        <Modal onClose={() => setRenewing(null)}>
          <ModalHeader title="Rinnovato" subtitle={renewing.title} onClose={() => setRenewing(null)} />
          <div className="p-6 space-y-4">
            <label className={LABEL}>Nuova scadenza</label>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={INPUT} />
            <button onClick={doRenew} className={BTN_PRIMARY}>Conferma</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ---------- LUL ----------
function LulCell({ value, tone, onCommit }) {
  const show = (v) => (v === undefined || v === null ? '' : String(v).replace('.', ','));
  const [text, setText] = useState(show(value));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setText(show(value)); }, [value]);
  const commit = () => {
    focused.current = false;
    const p = parseCell(text);
    if (p === undefined) { setText(show(value)); return; } // valore non valido: torna come prima
    const cur = value === undefined ? null : value;
    if (p === cur) { setText(show(value)); return; }
    onCommit(p);
  };
  return (
    <input
      value={text}
      inputMode="decimal"
      onFocus={(e) => { focused.current = true; e.target.select(); }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      className={`w-10 h-10 text-center text-xs font-black rounded-lg border outline-none focus:ring-2 focus:ring-slate-900 ${tone}`}
    />
  );
}

function CloseMonthModal({ monthLabel, monthKey, hasData, onClose }) {
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const reset = async () => {
    if (!confirm(`Cancellare TUTTE le ore di ${monthLabel}? L'operazione non si può annullare.`)) return;
    setBusy(true);
    try {
      await deleteDoc(doc(db, 'lul', monthKey));
      onClose();
    } catch (e) { alert('Errore: ' + e.message); setBusy(false); }
  };
  return (
    <Modal onClose={onClose} z="z-[450]">
      <ModalHeader title="Chiudi mese" subtitle={monthLabel} onClose={onClose} />
      <div className="p-6 space-y-5 overflow-y-auto">
        <p className="font-medium text-slate-600">Azzera le ore inserite per <b>{monthLabel}</b>. Gli orari standard e i dati dei dipendenti <b>non vengono toccati</b>.</p>
        <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
          <p className="font-black uppercase text-xs text-slate-500">1. Salva prima il PDF del mese</p>
          <button onClick={doPrint} className={`${BTN_SOFT} w-full`}><Icon name="printer" size={16} /> Esporta PDF</button>
          <p className="text-[11px] font-bold text-slate-400">Nella finestra di stampa scegli «Salva come PDF».</p>
        </div>
        <div className="bg-red-50 rounded-2xl p-4 space-y-3">
          <p className="font-black uppercase text-xs text-red-600">2. Azzera le ore</p>
          <label className="flex items-center gap-3 font-bold text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="w-6 h-6" /> Ho salvato il PDF del mese
          </label>
          <button onClick={reset} disabled={!saved || busy || !hasData} className="w-full bg-red-600 text-white py-4 rounded-2xl font-black uppercase active:scale-95 disabled:opacity-40">
            {hasData ? `Azzera ore di ${monthLabel}` : 'Nessuna ora da azzerare'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function LulTab({ employees, priv, today }) {
  const [monthDate, setMonthDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const monthKey = `${year}-${pad2(month + 1)}`;
  const monthLabel = `${MONTHS[month]} ${year}`;
  const dim = new Date(year, month + 1, 0).getDate();
  const [entries, setEntries] = useState({});
  const [err, setErr] = useState('');
  const [showClose, setShowClose] = useState(false);

  useEffect(() => {
    setEntries({});
    const unsub = onSnapshot(
      doc(db, 'lul', monthKey),
      (s) => setEntries(s.exists() ? s.data().entries || {} : {}),
      (e) => setErr(e.message)
    );
    return () => unsub();
  }, [monthKey]);

  const rows = useMemo(() => {
    const list = employees.filter((e) => e.active !== false || (entries[e.id] && Object.keys(entries[e.id]).length));
    return list.sort(empSort).map((e) => ({ emp: e, calc: computeLul(e, priv[e.id], entries[e.id], year, month, today) }));
  }, [employees, priv, entries, year, month, today]);

  const hasData = Object.keys(entries).some((id) => entries[id] && Object.keys(entries[id]).length);

  const commit = async (empId, day, value) => {
    try {
      await setDoc(doc(db, 'lul', monthKey), {
        entries: { [empId]: { [String(day)]: value === null ? deleteField() : value } },
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) { alert('Errore salvataggio: ' + e.message); }
  };

  const tone = (calc, day) => {
    const we = day.dow >= 5;
    if (day.isAbs) return 'bg-sky-100 border-sky-300 text-sky-800';
    if (!day.filled) return we ? 'bg-slate-100 border-slate-200' : 'bg-white border-slate-200';
    if (calc.isCall) return 'bg-indigo-50 border-indigo-200 text-indigo-900';
    const delta = day.worked - day.full;
    if (delta > 0.01) return 'bg-orange-100 border-orange-300 text-orange-900';
    if (delta < -0.01) return 'bg-yellow-100 border-yellow-300 text-yellow-900';
    return 'bg-green-100 border-green-300 text-green-900';
  };

  const absText = (c) => ABSENCE_CODES.filter((k) => c.absCount[k]).map((k) => `${k}${c.absCount[k]}`).join(' ') || '—';
  const dayNums = Array.from({ length: dim }, (_, i) => i + 1);
  const dayInfo = dayNums.map((d) => { const dt = new Date(year, month, d); return { d, dow: dowMon0(dt) }; });

  return (
    <div className="space-y-5">
      {err && <div className="bg-red-100 text-red-800 p-3 rounded-xl text-xs font-bold">Errore di lettura: {err}</div>}

      <div className="flex items-center justify-between gap-2 bg-white rounded-3xl p-3 shadow-md">
        <button onClick={() => setMonthDate(new Date(year, month - 1, 1))} className="bg-slate-100 p-3 rounded-2xl active:scale-95"><Icon name="chevron-left" size={22} /></button>
        <p className="font-black text-xl text-slate-900 uppercase italic tracking-tighter">{monthLabel}</p>
        <button onClick={() => setMonthDate(new Date(year, month + 1, 1))} className="bg-slate-100 p-3 rounded-2xl active:scale-95"><Icon name="chevron-right" size={22} /></button>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={doPrint} className={BTN_SOFT}><Icon name="printer" size={14} /> Esporta PDF</button>
        <button onClick={() => setShowClose(true)} className="px-4 py-3 rounded-2xl font-black text-xs uppercase tracking-wide bg-red-600 text-white active:scale-95 flex items-center gap-2"><Icon name="refresh" size={14} /> Chiudi mese / Reset</button>
      </div>

      {rows.length === 0 ? (
        <Empty>Inserisci prima i dipendenti (scheda «Dipendenti»)</Empty>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase">
            <span className="px-3 py-1 rounded-lg bg-green-100 text-green-900 border border-green-300">= previsto</span>
            <span className="px-3 py-1 rounded-lg bg-orange-100 text-orange-900 border border-orange-300">▲ più del previsto</span>
            <span className="px-3 py-1 rounded-lg bg-yellow-100 text-yellow-900 border border-yellow-300">▼ meno del previsto</span>
            <span className="px-3 py-1 rounded-lg bg-sky-100 text-sky-800 border border-sky-300">F ferie · M malattia · P permesso</span>
            <span className="px-3 py-1 rounded-lg bg-indigo-50 text-indigo-900 border border-indigo-200">a chiamata</span>
          </div>

          <div className="overflow-x-auto bg-white rounded-3xl shadow-xl border-4 border-white">
            <table className="border-collapse text-xs">
              <thead>
                <tr className="bg-slate-900 text-white">
                  <th className="sticky left-0 z-10 bg-slate-900 p-2 text-left text-[10px] font-black uppercase min-w-[9rem]">Dipendente</th>
                  {dayInfo.map(({ d, dow }) => (
                    <th key={d} className={`p-1 text-[10px] font-black ${dow >= 5 ? 'bg-slate-700' : ''}`}>{d}<br /><span className="opacity-60">{DAYS_SHORT[dow][0]}</span></th>
                  ))}
                  <th className="p-2 text-[10px] font-black uppercase">Tot</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ emp, calc }) => (
                  <tr key={emp.id} className="border-t border-slate-100">
                    <td className="sticky left-0 z-10 bg-white p-2 border-r border-slate-100">
                      <p className="font-black text-slate-900 leading-tight">{empName(emp)}</p>
                      <p className="text-[9px] font-bold uppercase text-slate-400">{emp.type === 'chiamata' ? 'a chiamata' : 'fisso'}{emp.active === false ? ' · non in servizio' : ''}</p>
                    </td>
                    {calc.days.map((day) => (
                      <td key={day.d} className="p-0.5">
                        <LulCell value={day.v} tone={tone(calc, day)} onCommit={(v) => commit(emp.id, day.d, v)} />
                      </td>
                    ))}
                    <td className="p-2 text-center font-black text-slate-900">{fmtNum(calc.totals.worked)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">Scrivi le ore del giorno (es. 8 oppure 7,5) oppure F / M / P. Si salva da solo quando esci dalla casella.</p>

          <div className="overflow-x-auto bg-white rounded-3xl shadow-xl border-4 border-white">
            <table className="w-full border-collapse text-sm min-w-[680px]">
              <thead>
                <tr className="bg-slate-100 text-slate-500 text-[10px] font-black uppercase">
                  <th className="p-3 text-left">Riepilogo mese</th>
                  <th className="p-3">Contratto/sett.</th>
                  <th className="p-3">Previste</th>
                  <th className="p-3">Lavorate</th>
                  <th className="p-3">Ordinarie</th>
                  <th className="p-3 text-orange-600">Straordinario</th>
                  <th className="p-3">Mancanti</th>
                  <th className="p-3">Assenze</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ emp, calc }) => (
                  <tr key={emp.id} className="border-t border-slate-100 text-center">
                    <td className="p-3 text-left font-black text-slate-900">{empName(emp)}</td>
                    <td className="p-3 font-bold text-slate-500">{calc.weeklyHours ? fmtNum(calc.weeklyHours) : '—'}</td>
                    <td className="p-3 font-bold text-slate-500">{calc.isCall || calc.noBaseline ? '—' : fmtNum(calc.totals.expected)}</td>
                    <td className="p-3 font-black text-slate-900">{fmtNum(calc.totals.worked)}</td>
                    <td className="p-3 font-bold text-slate-700">{calc.noBaseline ? '—' : fmtNum(calc.totals.ordinary)}</td>
                    <td className={`p-3 font-black ${calc.totals.overtime > 0 ? 'text-orange-600' : 'text-slate-300'}`}>{calc.noBaseline ? '—' : fmtNum(calc.totals.overtime)}</td>
                    <td className="p-3 font-bold text-slate-500">{calc.isCall || calc.noBaseline ? '—' : fmtNum(calc.totals.deficit)}</td>
                    <td className="p-3 font-bold text-sky-700">{absText(calc)}</td>
                  </tr>
                ))}
                {rows.some((r) => r.calc.noBaseline) && (
                  <tr><td colSpan={8} className="p-3 text-xs font-bold text-orange-700 bg-orange-50">Per i dipendenti con «—» imposta orario standard o ore settimanali nella scheda Dipendenti, per calcolare gli straordinari.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs font-medium text-slate-400 leading-relaxed">
            Come si calcola: per ogni settimana (lun–dom) le ore lavorate oltre a quelle previste dall'orario standard sono straordinario; le ore in meno di un giorno si compensano con quelle in più della stessa settimana. Ferie, malattia e permessi coprono le ore previste del giorno. Per gli «a chiamata» lo straordinario scatta solo se hai indicato una soglia settimanale. Le settimane a cavallo di due mesi sono calcolate per la sola parte del mese. È un supporto interno: conferma i criteri con il consulente del lavoro.
          </p>
        </>
      )}

      {showClose && <CloseMonthModal monthLabel={monthLabel} monthKey={monthKey} hasData={hasData} onClose={() => setShowClose(false)} />}

      <PrintSheet landscape>
        <h1>LUL — {monthLabel}</h1>
        <p>Lucciole nella Nebbia · ore lavorate per giorno · stampato il {fmtDateIT(new Date())}</p>
        <table>
          <thead>
            <tr>
              <th className="l">Dipendente</th>
              {dayInfo.map(({ d, dow }) => <th key={d} className={dow >= 5 ? 'we' : ''}>{d}<br />{DAYS_SHORT[dow][0]}</th>)}
              <th>Tot</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ emp, calc }) => (
              <tr key={emp.id}>
                <td className="l"><b>{empName(emp)}</b></td>
                {calc.days.map((day) => <td key={day.d} className={day.dow >= 5 ? 'we' : ''}>{day.v === undefined ? '' : String(day.v).replace('.', ',')}</td>)}
                <td><b>{fmtNum(calc.totals.worked)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>Riepilogo</h2>
        <table>
          <thead>
            <tr><th className="l">Dipendente</th><th>Contratto/sett.</th><th>Previste</th><th>Lavorate</th><th>Ordinarie</th><th>Straordinario</th><th>Mancanti</th><th>Assenze</th></tr>
          </thead>
          <tbody>
            {rows.map(({ emp, calc }) => (
              <tr key={emp.id}>
                <td className="l"><b>{empName(emp)}</b> {emp.role ? `(${emp.role})` : ''}</td>
                <td>{calc.weeklyHours ? fmtNum(calc.weeklyHours) : '—'}</td>
                <td>{calc.isCall || calc.noBaseline ? '—' : fmtNum(calc.totals.expected)}</td>
                <td>{fmtNum(calc.totals.worked)}</td>
                <td>{calc.noBaseline ? '—' : fmtNum(calc.totals.ordinary)}</td>
                <td className="ot">{calc.noBaseline ? '—' : fmtNum(calc.totals.overtime)}</td>
                <td>{calc.isCall || calc.noBaseline ? '—' : fmtNum(calc.totals.deficit)}</td>
                <td>{absText(calc)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: '4mm' }}>F = ferie · M = malattia · P = permesso. Straordinario calcolato per settimana (lun–dom) rispetto all'orario standard.</p>
      </PrintSheet>
    </div>
  );
}

function EconomiaPage({ deadlines, today, onBack }) {
  const { employees, priv, error } = useEmployees(true);
  const [tab, setTab] = useState('scadenze');
  const alertCount = useMemo(() => deadlines.filter((d) => deadlineStatus(d, today).state !== 'ok').length, [deadlines, today]);

  return (
    <PageShell title="Economia" subtitle="Scadenze · Dipendenti · LUL" onBack={onBack} wide>
      {error && <div className="bg-red-100 text-red-800 p-3 rounded-xl text-xs font-bold">Errore di lettura: {error}</div>}
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <Chip active={tab === 'scadenze'} onClick={() => setTab('scadenze')} color="bg-orange-600"><Icon name="bell" size={14} /> Scadenze{alertCount > 0 ? ` (${alertCount})` : ''}</Chip>
        <Chip active={tab === 'dipendenti'} onClick={() => setTab('dipendenti')} color="bg-slate-800"><Icon name="users" size={14} /> Dipendenti</Chip>
        <Chip active={tab === 'lul'} onClick={() => setTab('lul')} color="bg-blue-700"><Icon name="file-text" size={14} /> LUL</Chip>
      </div>
      {tab === 'scadenze' && <DeadlinesTab deadlines={deadlines} employees={employees} today={today} />}
      {tab === 'dipendenti' && <EmployeesTab employees={employees} priv={priv} />}
      {tab === 'lul' && <LulTab employees={employees} priv={priv} today={today} />}
    </PageShell>
  );
}

// ============================================================
//  HOME  (grandi tasti, uno per sezione)
// ============================================================
function Home({ role, sections, badges, onOpen, onLogout, dataError }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white p-5 sm:p-6 shadow-xl">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black uppercase italic tracking-tighter text-yellow-400 leading-none">Lucciole</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">nella Nebbia · {role}</p>
          </div>
          <button onClick={onLogout} className="bg-red-50 text-red-600 px-4 py-2 rounded-full border border-red-100 hover:bg-red-100 font-black text-[10px] uppercase tracking-widest transition-all shadow-md active:scale-95">Esci</button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5">
        {dataError && (
          <div className="bg-red-100 text-red-800 p-4 rounded-2xl text-xs font-bold">
            Errore di lettura dati: {dataError}. Se hai appena cambiato le regole di Firestore, controlla che siano quelle giuste.
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {sections.map((s) => {
            const badge = badges[s.id] || 0;
            return (
              <button
                key={s.id}
                onClick={() => onOpen(s.id)}
                className={`${s.tile} relative text-white rounded-[2.5rem] p-5 sm:p-7 min-h-[11rem] sm:min-h-[15rem] flex flex-col justify-between text-left shadow-xl border-b-8 border-black/25 active:scale-95 hover:-translate-y-1 transition-all`}
              >
                <div className="flex justify-between items-start">
                  <div className="bg-white/20 p-3 sm:p-4 rounded-2xl"><Icon name={s.icon} size={34} /></div>
                  {badge > 0 && <span className="bg-red-600 text-white min-w-[2.25rem] h-9 px-2 rounded-full flex items-center justify-center font-black text-sm shadow-lg ring-4 ring-white/30">{badge}</span>}
                </div>
                <div>
                  <h2 className="text-xl sm:text-3xl font-black uppercase italic tracking-tighter leading-none">{s.label}</h2>
                  <p className="text-[10px] sm:text-xs font-bold uppercase tracking-widest opacity-70 mt-2">{s.sub}</p>
                </div>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}

// ============================================================
//  APP
// ============================================================
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState('');
  const [section, setSection] = useState(null);
  const [works, setWorks] = useState([]);
  const [checks, setChecks] = useState([]);
  const [meetingItems, setMeetingItems] = useState([]);
  const [deadlines, setDeadlines] = useState([]);
  const [dataError, setDataError] = useState('');
  const today = useToday();

  const role = user ? EMAIL_TO_ROLE[(user.email || '').toLowerCase()] || null : null;
  const isManager = MANAGERS.includes(role);
  const sections = useMemo(() => (role ? SECTIONS.filter((s) => s.roles.includes(role)) : []), [role]);
  const singleSection = sections.length === 1 ? sections[0].id : null; // es. il cuoco va diretto alla lista spesa
  const activeSection = singleSection || section;

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setLoading(false); if (!u) setSection(null); });
    return () => unsub();
  }, []);

  // Dati condivisi: ogni ruolo legge solo ciò che può vedere
  useEffect(() => {
    setDataError('');
    if (!role) { setWorks([]); setChecks([]); setMeetingItems([]); setDeadlines([]); return undefined; }
    const unsubs = [];
    const sub = (name, setter) => {
      unsubs.push(onSnapshot(
        collection(db, name),
        (s) => setter(s.docs.map((d) => ({ id: d.id, ...d.data() }))),
        (e) => { console.error(name, e); setDataError(`${name}: ${e.message}`); }
      ));
    };
    if (STAFF.includes(role)) { sub('works', setWorks); sub('checks', setChecks); sub('meetingItems', setMeetingItems); }
    if (MANAGERS.includes(role)) sub('deadlines', setDeadlines);
    return () => unsubs.forEach((u) => u());
  }, [role]);

  // Tasto "indietro" del tablet/telefono: dalla sezione torna alla home
  useEffect(() => {
    const onPop = () => setSection(null);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const openSection = (id) => { setSection(id); window.history.pushState({ section: id }, ''); };
  const goHome = () => {
    if (window.history.state && window.history.state.section) window.history.back();
    else setSection(null);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    const u = e.target.username.value.trim().toLowerCase();
    const p = e.target.password.value;
    const email = USERNAME_TO_EMAIL[u];
    if (!email) { setLoginError('Utente non riconosciuto.'); return; }
    try {
      await signInWithEmailAndPassword(auth, email, p);
    } catch (err) {
      setLoginError('Accesso fallito. Verifica la password.');
    }
  };
  const handleLogout = () => signOut(auth);

  const badges = useMemo(() => ({
    riunione: meetingItems.filter((i) => !i.done).length,
    lavori: works.filter((w) => w.status !== 'done').length,
    checklist: checks.filter((c) => { const s = checkStatus(c, today).state; return s === 'due' || s === 'overdue'; }).length,
    economia: deadlines.filter((d) => deadlineStatus(d, today).state !== 'ok').length
  }), [meetingItems, works, checks, deadlines, today]);

  if (loading) return <div className="app-root min-h-screen bg-slate-900 flex items-center justify-center text-white font-black italic">CARICAMENTO...</div>;

  if (!user) return (
    <div className="app-root min-h-screen flex flex-col items-center justify-center p-6 bg-slate-900">
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

  if (!role) return (
    <div className="app-root min-h-screen flex flex-col items-center justify-center p-6 bg-slate-900 text-center space-y-6">
      <p className="text-white font-black text-xl">Questo utente non è abilitato all'uso dell'app.</p>
      <button onClick={handleLogout} className="bg-white text-slate-900 px-8 py-4 rounded-2xl font-black uppercase">Esci</button>
    </div>
  );

  const back = singleSection ? undefined : goHome;
  let page;
  switch (activeSection) {
    case 'spesa': page = <ShoppingPage role={role} onBack={back} onLogout={handleLogout} />; break;
    case 'riunione': page = <MeetingPage items={meetingItems} role={role} onBack={back} />; break;
    case 'lavori': page = <WorksPage works={works} role={role} isManager={isManager} onBack={back} />; break;
    case 'turni': page = <ShiftsPage isManager={isManager} today={today} onBack={back} />; break;
    case 'checklist': page = <ChecklistPage checks={checks} role={role} isManager={isManager} today={today} onBack={back} />; break;
    case 'economia': page = isManager ? <EconomiaPage deadlines={deadlines} today={today} onBack={back} /> : null; break;
    default: page = <Home role={role} sections={sections} badges={badges} onOpen={openSection} onLogout={handleLogout} dataError={dataError} />;
  }
  return <div className="app-root">{page}</div>;
}
