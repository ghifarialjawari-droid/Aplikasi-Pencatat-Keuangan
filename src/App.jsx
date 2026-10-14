import React, { useState, useMemo, useEffect, useRef } from 'react';
import Logo from './components/Logo.jsx';
import { speak, stopSpeaking, speechSupported, greetingWord, greetingText } from './lib/speech.js';
import { usePwaInstall } from './lib/pwa.js';
import { useSheetSync, isValidUrl, ping } from './lib/sheetSync.js';

/* =============================================================================
   KONSTANTA
   Palet: Biru→Sky (aksen) + Slate (netral) + Emerald (masuk) + Rose (keluar) + Amber (peringatan)
   ============================================================================= */

const USER_NAME = 'Tuan Ghifari Ganteng';

const KEYS = {
  trx: 'pembukuan_data_v4',
  cat: 'pembukuan_categories_v4',
  hide: 'pembukuan_hide_v1',
  wal: 'pembukuan_wallets_v1',
  bud: 'pembukuan_budget_v1',
  meta: 'pembukuan_meta_v1',
  sync: 'pembukuan_sync_v1',
};

const IN = 'pemasukan';
const OUT = 'pengeluaran';
const TR = 'transfer';
const ALL = 'semua';
const TOTAL_KEY = '__total'; // kunci anggaran total bulanan

const DEFAULT_CATEGORIES = {
  [IN]: ['Gaji', 'Bonus', 'Bisnis', 'Investasi', 'Lainnya'],
  [OUT]: ['Makanan', 'Transportasi', 'Belanja', 'Tagihan', 'Kesehatan', 'Hiburan', 'Edukasi', 'Lainnya'],
};

const DEFAULT_WALLETS = [{ id: 'utama', name: 'Dompet Utama', emoji: '👛', initial: 0 }];
const WALLET_EMOJI = ['👛', '🏦', '📱', '💳', '🐷', '🏠', '🎯', '✈️'];

const EMOJI = {
  Gaji: '💼', Bonus: '🎁', Bisnis: '🏪', Investasi: '📈', Lainnya: '✨',
  Makanan: '🍜', Transportasi: '🚌', Belanja: '🛍️', Tagihan: '🧾',
  Kesehatan: '💊', Hiburan: '🎮', Edukasi: '📚',
};
const emojiOf = (c) => EMOJI[c] || '🏷️';

const SEGMENT_COLORS = ['#2563eb', '#0ea5e9', '#06b6d4', '#14b8a6', '#fbbf24', '#fb923c', '#fb7185', '#94a3b8'];
const QUICK_AMOUNTS = [10000, 20000, 50000, 100000];

/* =============================================================================
   HELPER
   ============================================================================= */

const rupiah = (n) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
const compactRp = (n) => (n >= 1000 ? `${Math.round(n / 1000)}rb` : String(n));

const pad = (n) => String(n).padStart(2, '0');
const dateStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthStr = (d = new Date()) => dateStr(d).slice(0, 7);
const parseMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1);
};
const shiftMonth = (ym, delta) => {
  const d = parseMonth(ym);
  d.setMonth(d.getMonth() + delta);
  return monthStr(d);
};
const monthName = (ym) => parseMonth(ym).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
const dayLabel = (ds) => {
  if (ds === dateStr()) return 'Hari ini';
  if (ds === dateStr(new Date(Date.now() - 864e5))) return 'Kemarin';
  return new Date(`${ds}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
};

// Transaksi lama (sebelum fitur kantong) otomatis masuk "Dompet Utama"
const walletOf = (t) => t.wallet || 'utama';

// Transfer tidak dihitung sebagai pemasukan/pengeluaran
const totals = (list) =>
  list.reduce(
    (a, t) => {
      if (t.type === IN) a.income += t.amount;
      else if (t.type === OUT) a.expense += t.amount;
      return a;
    },
    { income: 0, expense: 0 }
  );

const walletBalances = (wallets, transactions) => {
  const bal = {};
  wallets.forEach((w) => (bal[w.id] = w.initial || 0));
  transactions.forEach((t) => {
    if (t.type === TR) {
      if (t.from in bal) bal[t.from] -= t.amount;
      if (t.to in bal) bal[t.to] += t.amount;
    } else {
      const id = walletOf(t);
      if (id in bal) bal[id] += t.type === IN ? t.amount : -t.amount;
    }
  });
  return bal;
};

const budgetTone = (ratio) =>
  ratio >= 1 ? 'bg-rose-500' : ratio >= 0.75 ? 'bg-amber-400' : 'bg-emerald-500';

/* Lapisan penyimpanan: pakai localStorage bila tersedia; kalau diblokir
   (mis. iframe ber-sandbox) jatuh ke memori supaya aplikasi tetap bisa dipakai. */
const memoryStore = {};
const storage = (() => {
  try {
    const k = '__cek_storage__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return { ok: true, get: (x) => window.localStorage.getItem(x), set: (x, v) => window.localStorage.setItem(x, v) };
  } catch {
    return { ok: false, get: (x) => (x in memoryStore ? memoryStore[x] : null), set: (x, v) => { memoryStore[x] = v; } };
  }
})();

// Bersihkan data tersimpan agar data lama/rusak tidak bisa membuat aplikasi error
const clean = {
  trx: (v) => (Array.isArray(v)
    ? v.filter((t) => t && typeof t.amount === 'number' && typeof t.date === 'string' && typeof t.type === 'string')
    : []),
  cat: (v) => ({
    [IN]: Array.isArray(v?.[IN]) && v[IN].length ? v[IN] : DEFAULT_CATEGORIES[IN],
    [OUT]: Array.isArray(v?.[OUT]) && v[OUT].length ? v[OUT] : DEFAULT_CATEGORIES[OUT],
  }),
  wal: (v) => {
    const list = Array.isArray(v) ? v.filter((w) => w && w.id && w.name) : [];
    return list.some((w) => w.id === 'utama') ? list : [...DEFAULT_WALLETS, ...list];
  },
  bud: (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {}),
  hide: (v) => Boolean(v),
  meta: (v) => ({ updatedAt: Number(v?.updatedAt) || 0 }),
  sync: (v) => ({ url: typeof v?.url === 'string' ? v.url : '', token: typeof v?.token === 'string' ? v.token : '' }),
};

function useLocalStorage(key, initial, sanitize = (v) => v) {
  const [value, setValue] = useState(() => {
    try {
      const raw = storage.get(key);
      return raw ? sanitize(JSON.parse(raw)) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      storage.set(key, JSON.stringify(value));
    } catch { /* penyimpanan penuh */ }
  }, [key, value]);
  return [value, setValue];
}

/* =============================================================================
   IKON
   ============================================================================= */

const PATHS = {
  left: 'M15.75 19.5L8.25 12l7.5-7.5',
  right: 'M8.25 4.5l7.5 7.5-7.5 7.5',
  plus: 'M12 4.5v15m7.5-7.5h-15',
  x: 'M6 18L18 6M6 6l12 12',
  trash: 'M14.74 9l-.35 9m-4.78 0L9.26 9m9.97-3.21c.34.05.68.11 1.02.17m-1.02-.17L18.16 19.67a2.25 2.25 0 01-2.24 2.08H8.08a2.25 2.25 0 01-2.24-2.08L4.77 5.79m14.46 0a48.1 48.1 0 00-3.48-.4m-12 .56c.34-.06.68-.12 1.02-.17m0 0a48.1 48.1 0 013.48-.4m7.5 0v-.92c0-1.18-.91-2.16-2.09-2.2a51.96 51.96 0 00-3.32 0c-1.18.04-2.09 1.02-2.09 2.2v.92m7.5 0a48.67 48.67 0 00-7.5 0',
  eye: 'M2.04 12.32a1.01 1.01 0 010-.64C3.42 7.51 7.36 4.5 12 4.5s8.58 3.01 9.96 7.18c.07.21.07.43 0 .64C20.58 16.49 16.64 19.5 12 19.5s-8.58-3.01-9.96-7.18zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  eyeOff: 'M3.98 8.22A10.48 10.48 0 001.93 12C3.23 16.34 7.24 19.5 12 19.5c.99 0 1.95-.14 2.86-.4M6.23 6.23A10.45 10.45 0 0112 4.5c4.76 0 8.77 3.16 10.07 7.5a10.52 10.52 0 01-4.29 5.77M6.23 6.23L3 3m3.23 3.23l3.65 3.65m7.89 7.89L21 21m-3.23-3.23l-3.65-3.65m0 0a3 3 0 10-4.24-4.24m4.24 4.24L9.88 9.88',
  down: 'M19.5 4.5l-15 15m0 0h11.25m-11.25 0V8.25',
  up: 'M4.5 19.5l15-15m0 0H8.25m11.25 0v11.25',
  check: 'M4.5 12.75l6 6 9-13.5',
  speaker: 'M19.11 5.64a9 9 0 010 12.72M16.46 8.29a5.25 5.25 0 010 7.42M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.7-.51-1.94-1.35A9 9 0 012.25 12c0-.83.11-1.63.32-2.4.24-.85 1.06-1.35 1.94-1.35h2.24z',
  sliders: 'M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75',
  cloud: 'M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.33-7.26 3 3 0 00-3.76-3.85 5.25 5.25 0 00-10.23 2.33A4.5 4.5 0 002.25 15z',
  install: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3',
  swap: 'M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5',
  home: 'M2.25 12l8.95-8.96a1.13 1.13 0 011.59 0L21.75 12M4.5 9.75v10.13c0 .62.5 1.12 1.13 1.12H9.75v-4.88c0-.62.5-1.12 1.13-1.12h2.25c.62 0 1.12.5 1.12 1.12V21h4.13c.62 0 1.12-.5 1.12-1.13V9.75M8.25 21h8.25',
  pie: 'M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z',
  doc: 'M19.5 14.25v-2.63a3.38 3.38 0 00-3.38-3.37h-1.5A1.13 1.13 0 0113.5 7.13v-1.5a3.38 3.38 0 00-3.38-3.38H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.63c-.62 0-1.13.5-1.13 1.13v17.25c0 .62.5 1.12 1.13 1.12h12.75c.62 0 1.12-.5 1.12-1.12V11.25a9 9 0 00-9-9z',
  edit: 'M16.86 4.49l1.69-1.69a1.88 1.88 0 112.65 2.65L6.83 19.82a4.5 4.5 0 01-1.9 1.13L6 20.25l.75-3.07a4.5 4.5 0 011.13-1.9L16.86 4.49zm0 0L19.5 7.13',
  wallet: 'M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3',
};

const Icon = ({ name, size = 20, sw = 2, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
       strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d={PATHS[name]} />
  </svg>
);

/* =============================================================================
   KOMPONEN UMUM
   ============================================================================= */

const field = 'w-full bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:bg-white transition';
const label = 'block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5';
const primaryBtn = 'w-full py-3.5 rounded-2xl font-black text-white bg-gradient-to-r from-blue-600 to-sky-500 shadow-md shadow-blue-500/25 active:scale-[0.98] transition disabled:opacity-40 disabled:shadow-none';

function MoneyInput({ value, onChange, placeholder = '0', className = field }) {
  const n = parseInt(value || '0', 10);
  return (
    <input type="text" inputMode="numeric" placeholder={placeholder}
      value={n ? n.toLocaleString('id-ID') : ''}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 12))}
      className={className} />
  );
}

function Chip({ active, onClick, children, dark }) {
  const on = dark ? 'bg-slate-800 text-white border-slate-800' : 'bg-blue-600 text-white border-blue-600';
  return (
    <button type="button" onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap active:scale-95 transition ${
        active ? on : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'}`}>
      {children}
    </button>
  );
}

function Shell({ title, onClose, onSubmit, children }) {
  // Enter di kolom input = simpan (tanpa <form>, agar tetap jalan di lingkungan yang memblokir form)
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
      e.preventDefault();
      onSubmit?.();
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-slate-900/40 animate-fade" onClick={onClose} />
      <div role="dialog" aria-label={title} onKeyDown={onKeyDown}
        className="relative w-full max-w-[420px] max-h-[92dvh] overflow-y-auto no-scrollbar bg-white rounded-t-[32px] px-5 pt-3 pb-6 animate-sheet">
        <div className="w-10 h-1 rounded-full bg-slate-200 mx-auto mb-4" />
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black text-slate-800">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Tutup"
            className="w-9 h-9 grid place-items-center rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-90 transition">
            <Icon name="x" size={18} sw={2.5} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function WalletChips({ wallets, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {wallets.map((w) => (
        <button key={w.id} type="button" onClick={() => onChange(w.id)}
          className={`px-3 py-2 rounded-2xl text-xs font-bold border active:scale-95 transition ${
            value === w.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
          {w.emoji} {w.name}
        </button>
      ))}
    </div>
  );
}

/* =============================================================================
   HEADER, SALDO, NAVIGASI
   ============================================================================= */

function TopBar({ month, onPrev, onNext, showMonth, greeting, speaking, onSpeak, onSettings, syncStatus }) {
  const nav = 'w-9 h-9 grid place-items-center rounded-full text-slate-500 hover:bg-blue-50 hover:text-blue-600 active:scale-90 transition';
  const dot = { syncing: 'bg-amber-400 animate-pulse', ok: 'bg-emerald-500', error: 'bg-rose-500' }[syncStatus];
  return (
    <header className="sticky top-0 z-20 bg-slate-50 px-5 pt-5 pb-3">
      <div className="flex items-center gap-3">
        <Logo size={42} className="shrink-0 drop-shadow-sm" />
        <button onClick={onSpeak} aria-label="Dengarkan sapaan" title="Ketuk untuk mendengar sapaan"
          className="flex-1 min-w-0 text-left active:scale-[0.98] transition">
          <p className="text-xs text-slate-400">{greeting} 👋</p>
          <p className="flex items-center gap-1.5 text-base font-extrabold text-slate-800 leading-tight">
            <span className="truncate">{USER_NAME}</span>
            <span className={`shrink-0 ${speaking ? 'text-blue-600 animate-pulse' : 'text-slate-300'}`}>
              <Icon name="speaker" size={16} sw={2} />
            </span>
          </p>
        </button>
        <button onClick={onSettings} aria-label="Pengaturan"
          className="relative w-10 h-10 grid place-items-center rounded-full bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-300 active:scale-90 transition">
          <Icon name="sliders" size={18} />
          {dot && <span className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ${dot}`} />}
        </button>
      </div>
      {showMonth && (
        <div className="flex items-center justify-between bg-white rounded-full border border-slate-200 p-1 mt-3">
          <button onClick={onPrev} aria-label="Bulan sebelumnya" className={nav}><Icon name="left" size={16} sw={2.5} /></button>
          <span className="text-sm font-bold text-slate-700 capitalize">{monthName(month)}</span>
          <button onClick={onNext} aria-label="Bulan berikutnya" className={nav}><Icon name="right" size={16} sw={2.5} /></button>
        </div>
      )}
    </header>
  );
}

function BalanceCard({ balance, income, expense, hidden, onToggle }) {
  const mask = (v) => (hidden ? 'Rp ••••••' : rupiah(v));
  return (
    <section className="mx-5 rounded-3xl p-5 text-white bg-gradient-to-br from-blue-600 to-sky-500 shadow-lg shadow-blue-500/20">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-sky-100">Total saldo semua kantong</p>
        <button onClick={onToggle} aria-label={hidden ? 'Tampilkan saldo' : 'Sembunyikan saldo'}
          className="w-8 h-8 grid place-items-center rounded-full bg-white/15 hover:bg-white/25 active:scale-90 transition">
          <Icon name={hidden ? 'eyeOff' : 'eye'} size={16} />
        </button>
      </div>
      <p className="text-3xl font-black tracking-tight mt-1 mb-5">{mask(balance)}</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/15 rounded-2xl px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-sky-100"><Icon name="down" size={12} sw={3} /> Pemasukan</p>
          <p className="text-sm font-bold mt-0.5">{mask(income)}</p>
        </div>
        <div className="bg-white/15 rounded-2xl px-3 py-2.5">
          <p className="flex items-center gap-1 text-[11px] font-semibold text-sky-100"><Icon name="up" size={12} sw={3} /> Pengeluaran</p>
          <p className="text-sm font-bold mt-0.5">{mask(expense)}</p>
        </div>
      </div>
    </section>
  );
}

function BottomNav({ tab, onTab }) {
  const items = [['home', 'home', 'Beranda'], ['report', 'doc', 'Laporan'], ['budget', 'pie', 'Anggaran'], ['wallets', 'wallet', 'Kantong']];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex justify-center">
      <div className="w-full max-w-[420px] grid grid-cols-4 bg-white border-t border-slate-100 pb-[env(safe-area-inset-bottom)]">
        {items.map(([id, icon, text]) => (
          <button key={id} onClick={() => onTab(id)}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-bold active:scale-95 transition ${
              tab === id ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
            <Icon name={icon} size={22} sw={tab === id ? 2.4 : 1.8} />
            {text}
          </button>
        ))}
      </div>
    </nav>
  );
}

/* =============================================================================
   BERANDA: RINCIAN & RIWAYAT
   ============================================================================= */

function Breakdown({ data, total, activeCategory, onPick }) {
  return (
    <section className="mx-5 mt-6">
      <h2 className="text-sm font-extrabold text-slate-800 mb-3">Pengeluaran per kategori</h2>
      <div className="bg-white rounded-3xl border border-slate-100 p-4">
        {data.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-6">Belum ada pengeluaran bulan ini 🎉</p>
        ) : (
          <>
            <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100 mb-4">
              {data.map((d, i) => (
                <div key={d.name} className="h-full transition-all duration-500"
                  style={{ width: `${(d.value / total) * 100}%`, background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
              ))}
            </div>
            <ul className="space-y-1">
              {data.map((d, i) => {
                const active = activeCategory === d.name;
                return (
                  <li key={d.name}>
                    <button onClick={() => onPick(d.name)}
                      className={`w-full flex items-center gap-3 p-2 rounded-2xl text-left transition active:scale-[0.98] ${
                        active ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-slate-50'}`}>
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
                      <span className="text-base">{emojiOf(d.name)}</span>
                      <span className="flex-1 text-sm font-semibold text-slate-700">{d.name}</span>
                      <span className="text-[11px] font-bold text-slate-400">{Math.round((d.value / total) * 100)}%</span>
                      <span className="text-sm font-bold text-slate-800 w-24 text-right">{rupiah(d.value)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function TransactionRow({ trx, wmap, showWallet, onDelete }) {
  const delBtn = (
    <button onClick={() => onDelete(trx.id)} aria-label="Hapus transaksi"
      className="w-8 h-8 grid place-items-center rounded-full text-slate-300 hover:bg-rose-50 hover:text-rose-500 active:scale-90 transition">
      <Icon name="trash" size={16} />
    </button>
  );

  if (trx.type === TR) {
    const from = wmap[trx.from];
    const to = wmap[trx.to];
    return (
      <div className="flex items-center gap-3 bg-white rounded-2xl border border-slate-100 p-3 animate-rise">
        <div className="w-11 h-11 rounded-2xl grid place-items-center bg-sky-50 text-sky-600"><Icon name="swap" size={20} /></div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800">Transfer</p>
          <p className="text-xs text-slate-400 truncate">
            {from ? `${from.emoji} ${from.name}` : '?'} → {to ? `${to.emoji} ${to.name}` : '?'}
          </p>
        </div>
        <p className="text-sm font-extrabold text-sky-600">{rupiah(trx.amount).replace('Rp', '').trim()}</p>
        {delBtn}
      </div>
    );
  }

  const isIn = trx.type === IN;
  const w = wmap[walletOf(trx)];
  const sub = [trx.note || 'Tanpa catatan', showWallet && w ? `${w.emoji} ${w.name}` : null].filter(Boolean).join(' · ');
  return (
    <div className="flex items-center gap-3 bg-white rounded-2xl border border-slate-100 p-3 animate-rise">
      <div className={`w-11 h-11 rounded-2xl grid place-items-center text-xl ${isIn ? 'bg-emerald-50' : 'bg-blue-50'}`}>
        {emojiOf(trx.category)}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-800">{trx.category}</p>
        <p className="text-xs text-slate-400 truncate">{sub}</p>
      </div>
      <p className={`text-sm font-extrabold ${isIn ? 'text-emerald-600' : 'text-rose-500'}`}>
        {isIn ? '+' : '-'}{rupiah(trx.amount).replace('Rp', '').trim()}
      </p>
      {delBtn}
    </div>
  );
}

/* =============================================================================
   TAB ANGGARAN
   ============================================================================= */

function BudgetBar({ emoji, name, spent, limit, onClick }) {
  const ratio = spent / limit;
  const left = limit - spent;
  return (
    <button onClick={onClick} className="w-full text-left bg-white rounded-2xl border border-slate-100 p-4 active:scale-[0.99] hover:border-blue-200 transition">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold text-slate-800">{emoji} {name}</p>
        <p className={`text-xs font-extrabold ${ratio >= 1 ? 'text-rose-500' : ratio >= 0.75 ? 'text-amber-500' : 'text-emerald-600'}`}>
          {Math.round(ratio * 100)}%
        </p>
      </div>
      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${budgetTone(ratio)}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      <div className="flex items-center justify-between mt-2 text-xs">
        <span className="text-slate-400">{rupiah(spent)} dari {rupiah(limit)}</span>
        <span className={`font-bold ${left < 0 ? 'text-rose-500' : 'text-slate-600'}`}>
          {left < 0 ? `Lebih ${rupiah(-left)}` : `Sisa ${rupiah(left)}`}
        </span>
      </div>
    </button>
  );
}

function BudgetTab({ budgets, spentByCat, totalSpent, onEdit }) {
  const totalLimit = budgets[TOTAL_KEY];
  const rows = Object.entries(budgets)
    .filter(([k]) => k !== TOTAL_KEY)
    .map(([name, limit]) => ({ name, limit, spent: spentByCat[name] || 0 }))
    .sort((a, b) => b.spent / b.limit - a.spent / a.limit);
  const empty = !totalLimit && rows.length === 0;

  return (
    <section className="mx-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-extrabold text-slate-800">Anggaran bulan ini</h2>
        <button onClick={() => onEdit(null)}
          className="px-3.5 py-1.5 rounded-full bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 active:scale-95 transition">
          + Tambah anggaran
        </button>
      </div>

      {empty ? (
        <div className="text-center py-12 text-sm text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
          <p className="text-3xl mb-2">🎯</p>
          Belum ada anggaran.<br />Tentukan batas belanja agar pengeluaran tetap terkendali.
        </div>
      ) : (
        <div className="space-y-3">
          {totalLimit > 0 && <BudgetBar emoji="🧮" name="Anggaran total" spent={totalSpent} limit={totalLimit} onClick={() => onEdit(TOTAL_KEY)} />}
          {rows.map((r) => (
            <BudgetBar key={r.name} emoji={emojiOf(r.name)} name={r.name} spent={r.spent} limit={r.limit} onClick={() => onEdit(r.name)} />
          ))}
          <p className="text-[11px] text-slate-400 text-center pt-1">Ketuk anggaran untuk mengubah · Hijau aman · Kuning ≥ 75% · Merah melebihi batas</p>
        </div>
      )}
    </section>
  );
}

/* Form pendek: pilih target (total / kategori) lalu isi batas. Tombol simpan selalu terlihat. */
function BudgetSheet({ budgets, categories, initialKey, onClose, onSave, onRemove }) {
  const [key, setKey] = useState(initialKey || TOTAL_KEY);
  const [amountStr, setAmountStr] = useState(() => (budgets[initialKey || TOTAL_KEY] ? String(budgets[initialKey || TOTAL_KEY]) : ''));

  const pick = (k) => { setKey(k); setAmountStr(budgets[k] ? String(budgets[k]) : ''); };
  const amount = parseInt(amountStr || '0', 10);
  const exists = Boolean(budgets[key]);
  const targets = [[TOTAL_KEY, '🧮 Total bulanan'], ...categories[OUT].map((c) => [c, `${emojiOf(c)} ${c}`])];

  const submit = () => {
    if (amount > 0) onSave(key, amount);
  };

  return (
    <Shell title={exists ? 'Ubah anggaran' : 'Tambah anggaran'} onClose={onClose} onSubmit={submit}>
      <label className={label}>Untuk</label>
      <div className="flex flex-wrap gap-2 mb-5">
        {targets.map(([k, text]) => (
          <button key={k} type="button" onClick={() => pick(k)}
            className={`px-3 py-2 rounded-2xl text-xs font-bold border active:scale-95 transition ${
              key === k ? 'bg-blue-600 text-white border-blue-600'
                : budgets[k] ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
            {text}{budgets[k] && key !== k ? ' ✓' : ''}
          </button>
        ))}
      </div>

      <label className={label}>Batas per bulan</label>
      <div className="flex items-baseline gap-2 border-b-2 border-slate-200 focus-within:border-blue-500 transition pb-1 mb-3">
        <span className="text-xl font-bold text-slate-300">Rp</span>
        <MoneyInput value={amountStr} onChange={setAmountStr}
          className="w-full text-3xl font-black text-slate-800 bg-transparent focus:outline-none placeholder-slate-200" />
      </div>
      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar">
        {[500000, 1000000, 2000000, 5000000].map((q) => (
          <button key={q} type="button" onClick={() => setAmountStr(String(q))}
            className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 text-xs font-bold whitespace-nowrap hover:bg-blue-100 active:scale-95 transition">
            {rupiah(q).replace('Rp', '').trim()}
          </button>
        ))}
      </div>

      <div className="flex gap-3">
        {exists && (
          <button type="button" onClick={() => onRemove(key)}
            className="px-5 py-3.5 rounded-2xl font-bold text-rose-500 bg-rose-50 hover:bg-rose-100 active:scale-95 transition">Hapus</button>
        )}
        <button type="button" onClick={submit} disabled={!amount} className={primaryBtn}>Simpan anggaran</button>
      </div>
    </Shell>
  );
}

/* =============================================================================
   TAB KANTONG
   ============================================================================= */

function WalletsTab({ wallets, balances, hidden, onPick, onTransfer, onAdd, onEdit }) {
  const mask = (v) => (hidden ? 'Rp ••••' : rupiah(v));
  return (
    <section className="mx-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-extrabold text-slate-800">Kantong saya</h2>
        <div className="flex gap-2">
          <button onClick={onTransfer} disabled={wallets.length < 2}
            className="px-3.5 py-1.5 rounded-full bg-blue-50 text-blue-600 text-xs font-bold hover:bg-blue-100 active:scale-95 transition disabled:opacity-40">
            ⇄ Transfer
          </button>
          <button onClick={onAdd}
            className="px-3.5 py-1.5 rounded-full bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 active:scale-95 transition">
            + Tambah kantong
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {wallets.map((w) => (
          <div key={w.id} className="relative bg-white rounded-3xl border border-slate-100 hover:border-blue-200 hover:shadow-sm transition animate-rise">
            <button onClick={() => onPick(w.id)} className="w-full text-left p-4 active:scale-[0.98] transition">
              <span className="w-10 h-10 rounded-2xl bg-blue-50 grid place-items-center text-xl mb-3">{w.emoji}</span>
              <p className="text-xs font-semibold text-slate-400 truncate pr-6">{w.name}</p>
              <p className={`text-base font-black mt-0.5 ${balances[w.id] < 0 ? 'text-rose-500' : 'text-slate-800'}`}>{mask(balances[w.id] || 0)}</p>
            </button>
            <button onClick={() => onEdit(w)} aria-label={`Ubah ${w.name}`}
              className="absolute top-3 right-3 w-8 h-8 grid place-items-center rounded-full text-slate-300 hover:bg-blue-50 hover:text-blue-600 active:scale-90 transition">
              <Icon name="edit" size={15} />
            </button>
          </div>
        ))}
        <button onClick={onAdd}
          className="rounded-3xl border-2 border-dashed border-blue-200 text-blue-500 p-4 min-h-[124px] grid place-items-center text-xs font-bold hover:bg-blue-50 active:scale-[0.98] transition">
          <span><span className="block text-2xl mb-1">＋</span>Kantong baru</span>
        </button>
      </div>
      <p className="text-[11px] text-slate-400 text-center mt-4">Ketuk kantong untuk melihat riwayat · ✎ untuk mengubah</p>
    </section>
  );
}

/* Tambah / ubah satu kantong (form pendek, tidak perlu scroll) */
function WalletSheet({ wallet, balance, canDelete, onClose, onSave, onDelete }) {
  const editing = Boolean(wallet);
  const [name, setName] = useState(wallet?.name || '');
  const [emoji, setEmoji] = useState(wallet?.emoji || WALLET_EMOJI[1]);
  const [initial, setInitial] = useState(wallet?.initial ? String(wallet.initial) : '');

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      id: wallet?.id || `w${Date.now()}`,
      name: name.trim(),
      emoji,
      initial: parseInt(initial || '0', 10),
    });
  };

  return (
    <Shell title={editing ? 'Ubah kantong' : 'Tambah kantong'} onClose={onClose} onSubmit={submit}>
      <label className={label}>Ikon</label>
      <div className="flex flex-wrap gap-2 mb-4">
        {WALLET_EMOJI.map((e) => (
          <button key={e} type="button" onClick={() => setEmoji(e)}
            className={`w-11 h-11 rounded-2xl text-xl grid place-items-center border active:scale-90 transition ${
              emoji === e ? 'bg-blue-50 border-blue-500' : 'bg-white border-slate-200'}`}>{e}</button>
        ))}
      </div>

      <label className={label}>Nama kantong</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="cth. Tabungan, Bank BCA, GoPay" className={`${field} mb-4`} />

      <label className={label}>Saldo awal</label>
      <MoneyInput value={initial} onChange={setInitial} placeholder="0" className={`${field} mb-1`} />
      {editing && <p className="text-[11px] text-slate-400 mb-4">Saldo saat ini {rupiah(balance || 0)} (saldo awal + semua transaksi)</p>}
      {!editing && <div className="mb-4" />}

      <div className="flex gap-3 mt-2">
        {editing && (
          <button type="button" disabled={!canDelete} onClick={() => onDelete(wallet.id)}
            title={canDelete ? 'Hapus kantong' : 'Tidak bisa dihapus: sudah punya transaksi'}
            className="px-5 py-3.5 rounded-2xl font-bold text-rose-500 bg-rose-50 hover:bg-rose-100 active:scale-95 transition disabled:opacity-40">Hapus</button>
        )}
        <button type="button" onClick={submit} disabled={!name.trim()} className={primaryBtn}>{editing ? 'Simpan perubahan' : 'Tambah kantong'}</button>
      </div>
      {editing && !canDelete && (
        <p className="text-[11px] text-slate-400 text-center mt-3">
          {wallet.id === 'utama' ? 'Dompet Utama tidak bisa dihapus.' : 'Kantong yang sudah punya transaksi tidak bisa dihapus.'}
        </p>
      )}
    </Shell>
  );
}

function TransferSheet({ wallets, balances, onClose, onSave }) {
  const [from, setFrom] = useState(wallets[0].id);
  const [to, setTo] = useState(wallets[1].id);
  const [amountStr, setAmountStr] = useState('');
  const [date, setDate] = useState(() => dateStr());
  const [note, setNote] = useState('');

  const amount = parseInt(amountStr || '0', 10);
  const insufficient = amount > (balances[from] || 0);
  const invalid = !amount || from === to || insufficient;

  const pickFrom = (id) => { setFrom(id); if (id === to) setTo(wallets.find((w) => w.id !== id).id); };
  const pickTo = (id) => { setTo(id); if (id === from) setFrom(wallets.find((w) => w.id !== id).id); };

  const submit = () => {
    if (invalid) return;
    onSave({ from, to, amount, date, note: note.trim() });
  };

  return (
    <Shell title="Transfer antar kantong" onClose={onClose} onSubmit={submit}>
      <label className={label}>Dari</label>
      <div className="mb-4"><WalletChips wallets={wallets} value={from} onChange={pickFrom} /></div>
      <label className={label}>Ke</label>
      <div className="mb-5"><WalletChips wallets={wallets} value={to} onChange={pickTo} /></div>

      <label className={label}>Jumlah</label>
      <div className="flex items-baseline gap-2 border-b-2 border-slate-200 focus-within:border-blue-500 transition pb-1">
        <span className="text-xl font-bold text-slate-300">Rp</span>
        <MoneyInput value={amountStr} onChange={setAmountStr}
          className="w-full text-3xl font-black text-slate-800 bg-transparent focus:outline-none placeholder-slate-200" />
      </div>
      <p className={`text-xs mt-2 mb-5 font-semibold ${insufficient ? 'text-rose-500' : 'text-slate-400'}`}>
        {insufficient ? 'Saldo kantong asal tidak cukup' : `Saldo tersedia ${rupiah(balances[from] || 0)}`}
      </p>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div><label className={label}>Tanggal</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={field} /></div>
        <div><label className={label}>Catatan</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsional" className={field} /></div>
      </div>
      <button type="button" onClick={submit} disabled={invalid} className={primaryBtn}>Transfer {amount ? rupiah(amount) : ''}</button>
    </Shell>
  );
}

/* =============================================================================
   TAB LAPORAN BULANAN
   ============================================================================= */

const pctChange = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

function Delta({ cur, prev, goodWhenUp }) {
  const p = pctChange(cur, prev);
  if (p === null) return <span className="text-[11px] text-slate-400">Belum ada data bulan lalu</span>;
  if (Math.abs(p) < 0.5) return <span className="text-[11px] text-slate-400">Sama seperti bulan lalu</span>;
  const up = p > 0;
  const good = up === goodWhenUp;
  return (
    <span className={`text-[11px] font-bold ${good ? 'text-emerald-600' : 'text-rose-500'}`}>
      {up ? '▲' : '▼'} {Math.abs(Math.round(p))}% vs bulan lalu
    </span>
  );
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function ReportTab({ month, transactions, wmap, onMonth }) {
  const [copied, setCopied] = useState(false);

  const r = useMemo(() => {
    const monthTrx = transactions.filter((t) => t.date.startsWith(month));
    const cur = totals(monthTrx);
    const prev = totals(transactions.filter((t) => t.date.startsWith(shiftMonth(month, -1))));

    const [y, m] = month.split('-').map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const daily = Array(daysInMonth).fill(0);
    const byCat = {};
    let biggest = null;
    monthTrx.forEach((t) => {
      if (t.type !== OUT) return;
      daily[Number(t.date.slice(8, 10)) - 1] += t.amount;
      byCat[t.category] = (byCat[t.category] || 0) + t.amount;
      if (!biggest || t.amount > biggest.amount) biggest = t;
    });

    const now = new Date();
    const isCurrent = month === monthStr(now);
    const isFuture = month > monthStr(now);
    const divisor = isCurrent ? now.getDate() : isFuture ? 1 : daysInMonth;
    const maxDay = Math.max(...daily);

    const trend = Array.from({ length: 6 }, (_, i) => {
      const ym = shiftMonth(month, i - 5);
      return { ym, ...totals(transactions.filter((t) => t.date.startsWith(ym))) };
    });

    return {
      monthTrx, cur, prev, daily, maxDay, trend,
      maxDayIndex: maxDay > 0 ? daily.indexOf(maxDay) + 1 : null,
      top: Object.entries(byCat).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5),
      biggest,
      avg: cur.expense / divisor,
      net: cur.income - cur.expense,
      count: monthTrx.filter((t) => t.type !== TR).length,
    };
  }, [month, transactions]);

  const trendMax = Math.max(1, ...r.trend.flatMap((t) => [t.income, t.expense]));
  const saveRate = r.cur.income > 0 ? Math.round((r.net / r.cur.income) * 100) : null;

  const summaryText = () =>
    [
      `Laporan Keuangan ${monthName(month)}`,
      `Pemasukan: ${rupiah(r.cur.income)}`,
      `Pengeluaran: ${rupiah(r.cur.expense)}`,
      `${r.net >= 0 ? 'Surplus' : 'Defisit'}: ${rupiah(Math.abs(r.net))}`,
      `Rata-rata pengeluaran/hari: ${rupiah(Math.round(r.avg))}`,
      r.top.length ? `Kategori teratas: ${r.top.map((c) => `${c.name} (${rupiah(c.value)})`).join(', ')}` : null,
    ].filter(Boolean).join('\n');

  const copy = async () => {
    const text = summaryText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadCsv = () => {
    const rows = [['Tanggal', 'Jenis', 'Kategori', 'Kantong', 'Catatan', 'Jumlah']];
    [...r.monthTrx].sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((t) => {
      if (t.type === TR) {
        rows.push([t.date, 'Transfer', `${wmap[t.from]?.name || '?'} → ${wmap[t.to]?.name || '?'}`, '', t.note, t.amount]);
      } else {
        rows.push([t.date, t.type, t.category, wmap[walletOf(t)]?.name || '', t.note, t.amount]);
      }
    });
    const csv = '\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-${month}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const hasData = r.monthTrx.length > 0;

  return (
    <section className="mx-5 space-y-5">
      {/* Ringkasan utama */}
      <div className="rounded-3xl p-5 text-white bg-gradient-to-br from-blue-600 to-sky-500 shadow-lg shadow-blue-500/20">
        <p className="text-xs font-semibold text-sky-100">Laporan {monthName(month)}</p>
        <p className="text-[11px] text-sky-100 mt-3">{r.net >= 0 ? 'Surplus' : 'Defisit'} bulan ini</p>
        <p className="text-3xl font-black tracking-tight">{r.net < 0 ? '-' : ''}{rupiah(Math.abs(r.net))}</p>
        <p className="text-xs text-sky-100 mt-2">
          {r.cur.income === 0 && r.cur.expense === 0
            ? 'Belum ada transaksi di bulan ini.'
            : saveRate === null
              ? 'Belum ada pemasukan tercatat.'
              : saveRate >= 0
                ? `Kamu menyisihkan ${saveRate}% dari pemasukan.`
                : 'Pengeluaran melebihi pemasukan bulan ini.'}
        </p>
      </div>

      {/* Kartu statistik */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Pemasukan</p>
          <p className="text-base font-black text-emerald-600 mt-1">{rupiah(r.cur.income)}</p>
          <Delta cur={r.cur.income} prev={r.prev.income} goodWhenUp />
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Pengeluaran</p>
          <p className="text-base font-black text-rose-500 mt-1">{rupiah(r.cur.expense)}</p>
          <Delta cur={r.cur.expense} prev={r.prev.expense} goodWhenUp={false} />
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Rata-rata / hari</p>
          <p className="text-base font-black text-slate-800 mt-1">{rupiah(Math.round(r.avg))}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Transaksi</p>
          <p className="text-base font-black text-slate-800 mt-1">{r.count}</p>
        </div>
      </div>

      {/* Tren 6 bulan */}
      <div className="bg-white rounded-3xl border border-slate-100 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-extrabold text-slate-800">Tren 6 bulan</h3>
          <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-400">
            <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Masuk</span>
            <span className="flex items-center gap-1"><i className="w-2 h-2 rounded-full bg-rose-400 inline-block" />Keluar</span>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-2">
          {r.trend.map((t) => {
            const active = t.ym === month;
            return (
              <button key={t.ym} onClick={() => onMonth(t.ym)} aria-label={`Lihat ${monthName(t.ym)}`}
                className={`flex flex-col items-center gap-1.5 rounded-xl py-1 active:scale-95 transition ${active ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                <div className="flex items-end gap-[3px] h-24">
                  <div className="w-2.5 rounded-t bg-emerald-500 transition-all duration-500" style={{ height: `${Math.max(2, (t.income / trendMax) * 100)}%` }} />
                  <div className="w-2.5 rounded-t bg-rose-400 transition-all duration-500" style={{ height: `${Math.max(2, (t.expense / trendMax) * 100)}%` }} />
                </div>
                <span className={`text-[10px] font-bold ${active ? 'text-blue-600' : 'text-slate-400'}`}>
                  {parseMonth(t.ym).toLocaleDateString('id-ID', { month: 'short' })}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pengeluaran harian */}
      <div className="bg-white rounded-3xl border border-slate-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-extrabold text-slate-800">Pengeluaran harian</h3>
          {r.maxDayIndex && <span className="text-[11px] font-semibold text-slate-400">Terboros: tgl {r.maxDayIndex}</span>}
        </div>
        <div className="flex items-end gap-[2px] h-20">
          {r.daily.map((v, i) => (
            <div key={i} title={`Tgl ${i + 1}: ${rupiah(v)}`}
              className={`flex-1 rounded-t transition-all duration-500 ${v === r.maxDay && v > 0 ? 'bg-blue-600' : 'bg-blue-200'}`}
              style={{ height: `${v > 0 ? Math.max(6, (v / r.maxDay) * 100) : 3}%`, opacity: v > 0 ? 1 : 0.4 }} />
          ))}
        </div>
        <div className="flex justify-between text-[10px] text-slate-400 font-semibold mt-1.5">
          <span>1</span><span>{Math.ceil(r.daily.length / 2)}</span><span>{r.daily.length}</span>
        </div>
      </div>

      {/* Kategori teratas */}
      <div className="bg-white rounded-3xl border border-slate-100 p-4">
        <h3 className="text-sm font-extrabold text-slate-800 mb-3">Kategori teratas</h3>
        {r.top.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">Belum ada pengeluaran.</p>
        ) : (
          <ul className="space-y-3">
            {r.top.map((c, i) => (
              <li key={c.name}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-semibold text-slate-700">{emojiOf(c.name)} {c.name}</span>
                  <span className="font-bold text-slate-800">{rupiah(c.value)}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${(c.value / r.cur.expense) * 100}%`, background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
                </div>
              </li>
            ))}
          </ul>
        )}
        {r.biggest && (
          <p className="text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5 mt-4">
            💸 Pengeluaran terbesar: <b className="text-slate-700">{r.biggest.category}</b> {rupiah(r.biggest.amount)}
            {r.biggest.note ? ` (${r.biggest.note})` : ''} pada {dayLabel(r.biggest.date).toLowerCase()}.
          </p>
        )}
      </div>

      {/* Aksi */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={copy} disabled={!hasData}
          className="py-3 rounded-2xl text-sm font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-95 transition disabled:opacity-40">
          {copied ? 'Tersalin ✓' : 'Salin ringkasan'}
        </button>
        <button onClick={downloadCsv} disabled={!hasData}
          className="py-3 rounded-2xl text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 active:scale-95 transition disabled:opacity-40">
          Unduh CSV
        </button>
      </div>
    </section>
  );
}

/* =============================================================================
   SHEET TRANSAKSI
   ============================================================================= */

function TransactionSheet({ categories, wallets, defaultWallet, budgets, transactions, onClose, onSave, onAddCategory }) {
  const [type, setType] = useState(OUT);
  const [amountStr, setAmountStr] = useState('');
  const [category, setCategory] = useState(categories[OUT][0]);
  const [wallet, setWallet] = useState(defaultWallet);
  const [date, setDate] = useState(() => dateStr());
  const [note, setNote] = useState('');
  const [adding, setAdding] = useState(false);
  const [newCat, setNewCat] = useState('');

  const amount = parseInt(amountStr || '0', 10);
  const isIn = type === IN;

  // Sisa anggaran kategori untuk bulan tanggal yang dipilih
  const limit = !isIn && !adding ? budgets[category] : 0;
  const spent = useMemo(
    () => (limit
      ? transactions
          .filter((t) => t.type === OUT && t.category === category && t.date.startsWith(date.slice(0, 7)))
          .reduce((a, t) => a + t.amount, 0)
      : 0),
    [limit, transactions, category, date]
  );
  const remaining = limit - spent - amount;

  const changeType = (t) => { setType(t); setCategory(categories[t][0]); setAdding(false); setNewCat(''); };

  const confirmNewCat = () => {
    const n = newCat.trim();
    if (!n) return;
    onAddCategory(type, n);
    setCategory(n); setAdding(false); setNewCat('');
  };

  const submit = () => {
    const finalCat = adding ? newCat.trim() : category;
    if (!amount || !finalCat) return;
    onSave({ type, amount, category: finalCat, wallet, date, note: note.trim() });
  };

  return (
    <Shell title="Catat transaksi" onClose={onClose} onSubmit={submit}>
      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-2xl mb-5">
        <button type="button" onClick={() => changeType(OUT)}
          className={`py-2.5 rounded-xl text-sm font-bold active:scale-95 transition ${
            !isIn ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30' : 'bg-rose-50 text-rose-500 hover:bg-rose-100'}`}>
          Pengeluaran
        </button>
        <button type="button" onClick={() => changeType(IN)}
          className={`py-2.5 rounded-xl text-sm font-bold active:scale-95 transition ${
            isIn ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
          Pemasukan
        </button>
      </div>

      <label className={label}>Jumlah</label>
      <div className="flex items-baseline gap-2 border-b-2 border-slate-200 focus-within:border-blue-500 transition pb-1">
        <span className="text-xl font-bold text-slate-300">Rp</span>
        <MoneyInput value={amountStr} onChange={setAmountStr}
          className="w-full text-3xl font-black text-slate-800 bg-transparent focus:outline-none placeholder-slate-200" />
      </div>
      <div className="flex gap-2 mt-3 mb-5 overflow-x-auto no-scrollbar">
        {QUICK_AMOUNTS.map((q) => (
          <button key={q} type="button" onClick={() => setAmountStr(String(amount + q))}
            className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-600 text-xs font-bold whitespace-nowrap hover:bg-blue-100 active:scale-95 transition">
            +{compactRp(q)}
          </button>
        ))}
        {amount > 0 && (
          <button type="button" onClick={() => setAmountStr('')}
            className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-500 text-xs font-bold hover:bg-slate-200 active:scale-95 transition">Reset</button>
        )}
      </div>

      <label className={label}>Kategori</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {categories[type].map((c) => (
          <button key={c} type="button" onClick={() => { setCategory(c); setAdding(false); }}
            className={`px-3 py-2 rounded-2xl text-xs font-bold border active:scale-95 transition ${
              !adding && category === c ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'}`}>
            {emojiOf(c)} {c}
          </button>
        ))}
        {adding ? (
          <div className="flex items-center gap-1 animate-fade">
            <input autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nama kategori"
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); confirmNewCat(); } }}
              className="w-36 bg-blue-50 border border-blue-200 rounded-2xl px-3 py-2 text-xs font-bold text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <button type="button" onClick={confirmNewCat} aria-label="Simpan kategori"
              className="w-8 h-8 grid place-items-center rounded-xl bg-blue-600 text-white active:scale-90 transition">
              <Icon name="check" size={16} sw={3} />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setAdding(true)}
            className="px-3 py-2 rounded-2xl text-xs font-bold border border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 active:scale-95 transition">+ Baru</button>
        )}
      </div>

      {/* Info sisa anggaran (muncul jika kategori punya anggaran) */}
      {limit > 0 && (
        <p className={`text-xs font-bold mt-2 px-3 py-2 rounded-xl ${remaining < 0 ? 'bg-rose-50 text-rose-500' : 'bg-emerald-50 text-emerald-600'}`}>
          {remaining < 0
            ? `⚠️ Melebihi anggaran ${category} sebesar ${rupiah(-remaining)}`
            : `Sisa anggaran ${category}: ${rupiah(remaining)}`}
        </p>
      )}

      {wallets.length > 1 && (
        <>
          <label className={`${label} mt-5`}>Kantong</label>
          <WalletChips wallets={wallets} value={wallet} onChange={setWallet} />
        </>
      )}

      <div className="grid grid-cols-2 gap-3 my-5">
        <div><label className={label}>Tanggal</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={field} /></div>
        <div><label className={label}>Catatan</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Opsional" className={field} /></div>
      </div>

      <button type="button" onClick={submit} disabled={!amount} className={primaryBtn}>
        Simpan {amount ? rupiah(amount) : 'transaksi'}
      </button>
    </Shell>
  );
}

/* =============================================================================
   PENGATURAN: Google Sheets, instal aplikasi, suara
   ============================================================================= */

const statusText = { off: 'Belum terhubung', idle: 'Siap', syncing: 'Menyinkronkan…', ok: 'Tersinkron ✓', error: 'Gagal' };
const statusTone = {
  off: 'bg-slate-100 text-slate-500', idle: 'bg-slate-100 text-slate-500', syncing: 'bg-amber-50 text-amber-600',
  ok: 'bg-emerald-50 text-emerald-600', error: 'bg-rose-50 text-rose-500',
};

// Tombol aksi berbahaya: ketuk dua kali agar tidak tertimpa tanpa sengaja
function ConfirmButton({ children, onConfirm, className }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button type="button" className={className}
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}>
      {armed ? 'Yakin? Ketuk lagi' : children}
    </button>
  );
}

function SettingsSheet({ cfg, onSaveCfg, sync, onClose, onSpeak, onNotice }) {
  const pwa = usePwaInstall();
  const [url, setUrl] = useState(cfg.url);
  const [token, setToken] = useState(cfg.token);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState(null); // { ok, text }

  const connected = sync.enabled;
  const urlOk = isValidUrl(url);
  const lastText = sync.last
    ? `Terakhir: ${new Date(sync.last).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`
    : '';

  const connect = async () => {
    const next = { url: url.trim(), token: token.trim() };
    setTesting(true);
    setTestMsg(null);
    try {
      const res = await ping(next);
      onSaveCfg(next);
      setTestMsg({ ok: true, text: `Terhubung ke "${res.name}"` });
      onNotice('Google Sheets terhubung');
    } catch (e) {
      setTestMsg({
        ok: false,
        text: e instanceof TypeError
          ? 'Tidak bisa terhubung. Periksa internet dan URL Web App.'
          : e.message,
      });
    } finally {
      setTesting(false);
    }
  };

  const disconnect = () => {
    onSaveCfg({ url: '', token: '' });
    setUrl(''); setToken(''); setTestMsg(null);
    onNotice('Sinkronisasi diputus. Data tetap ada di perangkat.');
  };

  const section = 'rounded-3xl border border-slate-100 bg-slate-50 p-4 mb-4';
  const ghost = 'py-2.5 rounded-2xl text-xs font-bold bg-white border border-slate-200 text-slate-600 hover:border-blue-300 hover:text-blue-600 active:scale-95 transition disabled:opacity-40';

  return (
    <Shell title="Pengaturan" onClose={onClose}>
      {/* Google Sheets */}
      <div className={section}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-extrabold text-slate-800 flex items-center gap-2"><Icon name="cloud" size={18} /> Database Google Sheets</p>
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${statusTone[sync.status]}`}>{statusText[sync.status]}</span>
        </div>

        <label className={label}>URL Web App</label>
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://script.google.com/macros/s/…/exec"
          autoCapitalize="off" autoCorrect="off" spellCheck={false} className={`${field} mb-1`} />
        {url && !urlOk && <p className="text-[11px] text-rose-500 mb-2">URL harus diawali https://script.google.com/macros/s/ dan diakhiri /exec</p>}

        <label className={`${label} mt-3`}>Kode rahasia</label>
        <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="Sama dengan TOKEN di Apps Script" type="password"
          autoCapitalize="off" autoCorrect="off" spellCheck={false} className={`${field} mb-3`} />

        <button type="button" onClick={connect} disabled={!urlOk || !token.trim() || testing} className={primaryBtn}>
          {testing ? 'Menguji koneksi…' : connected ? 'Simpan & uji ulang' : 'Sambungkan'}
        </button>
        {testMsg && (
          <p className={`text-xs font-semibold mt-3 px-3 py-2 rounded-xl ${testMsg.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'}`}>
            {testMsg.ok ? '✓ ' : '⚠️ '}{testMsg.text}
          </p>
        )}

        {connected && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            {sync.status === 'error' && sync.message && (
              <p className="text-xs font-semibold text-rose-500 bg-rose-50 rounded-xl px-3 py-2 mb-3">⚠️ {sync.message}</p>
            )}
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button type="button" onClick={() => sync.sync('auto')} disabled={sync.status === 'syncing'} className={`${ghost} col-span-2`}>
                ⟳ Sinkron sekarang {lastText && <span className="font-medium text-slate-400">· {lastText}</span>}
              </button>
              <ConfirmButton onConfirm={() => sync.sync('push')} className={ghost}>↑ Kirim ke Sheet</ConfirmButton>
              <ConfirmButton onConfirm={() => sync.sync('pull')} className={ghost}>↓ Ambil dari Sheet</ConfirmButton>
            </div>
            <p className="text-[11px] text-slate-400 mb-3">Kirim/Ambil akan menimpa data di sisi tujuan.</p>
            <ConfirmButton onConfirm={disconnect} className="text-xs font-bold text-rose-500 hover:underline">Putuskan sambungan</ConfirmButton>
          </div>
        )}

        <details className="mt-4 text-xs text-slate-500">
          <summary className="cursor-pointer font-bold text-blue-600">Cara membuat database di Google Sheets</summary>
          <ol className="list-decimal pl-5 mt-2 space-y-1">
            <li>Buat Google Spreadsheet baru.</li>
            <li>Menu <b>Extensions → Apps Script</b>, tempel isi file <code>Code.gs</code>, ganti <code>TOKEN</code>.</li>
            <li><b>Deploy → New deployment → Web app</b>: Execute as <i>Me</i>, access <i>Anyone</i>.</li>
            <li>Salin URL Web App (berakhiran <code>/exec</code>) ke kolom di atas, isi kode rahasia yang sama.</li>
          </ol>
          <p className="mt-2">Panduan bergambar ada di file <code>PANDUAN-GOOGLE-SHEETS.md</code>.</p>
        </details>
      </div>

      {/* Instal */}
      <div className={section}>
        <p className="text-sm font-extrabold text-slate-800 flex items-center gap-2 mb-2"><Icon name="install" size={18} /> Instal aplikasi</p>
        {pwa.installed ? (
          <p className="text-xs font-semibold text-emerald-600">✓ Aplikasi sudah terpasang di perangkat ini.</p>
        ) : pwa.canInstall ? (
          <>
            <p className="text-xs text-slate-500 mb-3">Pasang di PC atau HP agar terbuka seperti aplikasi biasa dan bisa dipakai offline.</p>
            <button type="button" onClick={async () => { if (await pwa.install()) onNotice('Aplikasi terpasang'); }} className={primaryBtn}>Instal sekarang</button>
          </>
        ) : pwa.ios ? (
          <p className="text-xs text-slate-500">Di iPhone/iPad: buka lewat <b>Safari</b>, ketuk tombol <b>Bagikan</b> lalu pilih <b>Tambah ke Layar Utama</b>.</p>
        ) : (
          <p className="text-xs text-slate-500">
            Di Chrome/Edge: klik ikon <b>Instal</b> di kolom alamat, atau menu ⋮ → <b>Instal aplikasi</b> / <b>Tambahkan ke layar utama</b>.
          </p>
        )}
      </div>

      {/* Suara */}
      <div className={`${section} mb-0`}>
        <p className="text-sm font-extrabold text-slate-800 flex items-center gap-2 mb-2"><Icon name="speaker" size={18} /> Suara sapaan</p>
        <p className="text-xs text-slate-500 mb-3">
          Ketuk nama di bagian atas Beranda untuk mendengar sapaan sesuai jam.
          {!speechSupported() && ' Browser ini belum mendukung suara.'}
        </p>
        <button type="button" onClick={onSpeak} disabled={!speechSupported()} className={`${ghost} w-full`}>🔊 Coba dengarkan</button>
      </div>
    </Shell>
  );
}

/* =============================================================================
   APP
   ============================================================================= */

function MainApp() {
  const [transactions, setTransactions] = useLocalStorage(KEYS.trx, [], clean.trx);
  const [categories, setCategories] = useLocalStorage(KEYS.cat, DEFAULT_CATEGORIES, clean.cat);
  const [wallets, setWallets] = useLocalStorage(KEYS.wal, DEFAULT_WALLETS, clean.wal);
  const [budgets, setBudgets] = useLocalStorage(KEYS.bud, {}, clean.bud);
  const [hidden, setHidden] = useLocalStorage(KEYS.hide, false, clean.hide);
  const [meta, setMeta] = useLocalStorage(KEYS.meta, { updatedAt: 0 }, clean.meta);
  const [syncCfg, setSyncCfg] = useLocalStorage(KEYS.sync, { url: '', token: '' }, clean.sync);

  const [tab, setTab] = useState('home');
  const [month, setMonth] = useState(() => monthStr());
  const [typeFilter, setTypeFilter] = useState(ALL);
  const [catFilter, setCatFilter] = useState(ALL);
  const [walletFilter, setWalletFilter] = useState(ALL);
  const [sheet, setSheet] = useState(null); // 'trx' | 'transfer' | 'budget' | 'wallet' | 'settings' | null
  const [budgetKey, setBudgetKey] = useState(null);
  const [walletEdit, setWalletEdit] = useState(null);
  const [undo, setUndo] = useState(null);
  const [notice, setNotice] = useState(null);
  const [now, setNow] = useState(() => new Date());
  const [speaking, setSpeaking] = useState(false);
  const historyRef = useRef(null);

  useEffect(() => { window.scrollTo(0, 0); }, [tab]);

  // Sapaan mengikuti jam (diperbarui tiap menit dan saat aplikasi dibuka kembali)
  useEffect(() => {
    const tick = () => setNow(new Date());
    const id = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); stopSpeaking(); };
  }, []);

  // Cap waktu "terakhir diubah" setiap data berubah (dipakai untuk sinkron Google Sheets)
  const dataSig = useMemo(
    () => JSON.stringify([transactions, categories, wallets, budgets]),
    [transactions, categories, wallets, budgets]
  );
  const sigRef = useRef(dataSig);
  const skipTouch = useRef(false);
  useEffect(() => {
    if (sigRef.current === dataSig) return;
    sigRef.current = dataSig;
    if (skipTouch.current) { skipTouch.current = false; return; }
    setMeta({ updatedAt: Date.now() });
  }, [dataSig, setMeta]);

  const applyRemote = (s) => {
    const next = {
      trx: clean.trx(s.transactions), cat: clean.cat(s.categories), wal: clean.wal(s.wallets), bud: clean.bud(s.budgets),
    };
    // hanya lewati satu "cap waktu" jika data memang berubah, agar perubahan berikutnya tidak ikut terlewat
    skipTouch.current = JSON.stringify([next.trx, next.cat, next.wal, next.bud]) !== sigRef.current;
    setTransactions(next.trx); setCategories(next.cat); setWallets(next.wal); setBudgets(next.bud);
    setMeta({ updatedAt: Number(s.updatedAt) || 0 });
  };

  const snapshot = useMemo(
    () => ({ updatedAt: meta.updatedAt, transactions, categories, wallets, budgets }),
    [meta.updatedAt, transactions, categories, wallets, budgets]
  );
  const sync = useSheetSync({
    cfg: syncCfg, snapshot, onRemote: applyRemote, onStamp: (t) => setMeta({ updatedAt: t }),
  });

  const sayHello = () => {
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    const ok = speak(greetingText(USER_NAME, new Date()), {
      onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false),
    });
    if (!ok) setNotice('⚠️ Browser ini belum mendukung suara');
  };

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 2200);
    return () => clearTimeout(t);
  }, [notice]);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 4000);
    return () => clearTimeout(t);
  }, [undo]);

  /* ---------- Data turunan ---------- */
  const wmap = useMemo(() => Object.fromEntries(wallets.map((w) => [w.id, w])), [wallets]);
  const balances = useMemo(() => walletBalances(wallets, transactions), [wallets, transactions]);
  const totalBalance = useMemo(() => Object.values(balances).reduce((a, b) => a + b, 0), [balances]);

  const usedWalletIds = useMemo(() => {
    const s = new Set();
    transactions.forEach((t) => (t.type === TR ? (s.add(t.from), s.add(t.to)) : s.add(walletOf(t))));
    return s;
  }, [transactions]);

  const monthTrx = useMemo(() => transactions.filter((t) => t.date.startsWith(month)), [transactions, month]);
  const monthTotals = useMemo(() => totals(monthTrx), [monthTrx]);

  const spentByCat = useMemo(() => {
    const map = {};
    monthTrx.forEach((t) => { if (t.type === OUT) map[t.category] = (map[t.category] || 0) + t.amount; });
    return map;
  }, [monthTrx]);

  const breakdown = useMemo(
    () => Object.entries(spentByCat).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value),
    [spentByCat]
  );

  const history = useMemo(() => {
    const list = monthTrx
      .filter((t) => {
        if (t.type === TR) {
          return typeFilter === ALL && catFilter === ALL &&
            (walletFilter === ALL || t.from === walletFilter || t.to === walletFilter);
        }
        return (typeFilter === ALL || t.type === typeFilter) &&
          (catFilter === ALL || t.category === catFilter) &&
          (walletFilter === ALL || walletOf(t) === walletFilter);
      })
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));

    const byDay = [];
    list.forEach((t) => {
      const last = byDay[byDay.length - 1];
      if (last && last.date === t.date) last.items.push(t);
      else byDay.push({ date: t.date, items: [t] });
    });
    return { byDay, count: list.length, ...totals(list) };
  }, [monthTrx, typeFilter, catFilter, walletFilter]);

  const hasFilter = typeFilter !== ALL || catFilter !== ALL || walletFilter !== ALL;

  /* ---------- Aksi ---------- */
  const addCategory = (type, name) =>
    setCategories((p) => (p[type].includes(name) ? p : { ...p, [type]: [...p[type], name] }));

  const closeSheet = () => setSheet(null);

  const saveTrx = ({ type, amount, category, wallet, date, note }) => {
    addCategory(type, category);
    setTransactions((p) => [{ id: Date.now(), type, amount, category, wallet, date, note }, ...p]);
    setMonth(date.slice(0, 7));
    closeSheet();
    setNotice(type === IN ? 'Pemasukan tersimpan' : 'Pengeluaran tersimpan');
  };

  const saveTransfer = ({ from, to, amount, date, note }) => {
    setTransactions((p) => [{ id: Date.now(), type: TR, from, to, amount, date, note }, ...p]);
    setMonth(date.slice(0, 7));
    closeSheet();
    setTab('home');
    setNotice('Transfer tersimpan');
  };

  const saveBudget = (key, amount) => { setBudgets((p) => ({ ...p, [key]: amount })); closeSheet(); setNotice('Anggaran tersimpan'); };
  const removeBudget = (key) => {
    setBudgets((p) => { const n = { ...p }; delete n[key]; return n; });
    closeSheet();
  };
  const openBudget = (key) => { setBudgetKey(key); setSheet('budget'); };

  const saveWallet = (w) => {
    setWallets((p) => (p.some((x) => x.id === w.id) ? p.map((x) => (x.id === w.id ? w : x)) : [...p, w]));
    closeSheet();
    setNotice('Kantong tersimpan');
  };
  const deleteWallet = (id) => {
    setWallets((p) => p.filter((w) => w.id !== id));
    if (walletFilter === id) setWalletFilter(ALL);
    closeSheet();
  };
  const openWallet = (w) => { setWalletEdit(w); setSheet('wallet'); };

  const removeTrx = (id) => {
    const trx = transactions.find((t) => t.id === id);
    setTransactions((p) => p.filter((t) => t.id !== id));
    setUndo({ trx });
  };

  const restore = () => { setTransactions((p) => [undo.trx, ...p]); setUndo(null); };

  const scrollToHistory = () => setTimeout(() => historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);

  const pickCategory = (name) => {
    const same = catFilter === name && typeFilter === OUT;
    setTypeFilter(same ? ALL : OUT);
    setCatFilter(same ? ALL : name);
    if (!same) scrollToHistory();
  };

  const pickWallet = (id) => {
    setWalletFilter(id);
    setTypeFilter(ALL);
    setCatFilter(ALL);
    setTab('home');
    scrollToHistory();
  };

  const changeType = (t) => { setTypeFilter(t); setCatFilter(ALL); };

  /* ---------- Render ---------- */
  return (
    <div className="min-h-screen bg-slate-200 sm:py-6 font-sans selection:bg-blue-200">
      <div className="relative mx-auto w-full max-w-[420px] min-h-[100dvh] sm:min-h-[820px] bg-slate-50 sm:rounded-[32px] sm:shadow-xl pb-40">
        <TopBar month={month} showMonth={tab !== 'wallets'}
          greeting={`Selamat ${greetingWord(now)}`} speaking={speaking} onSpeak={sayHello}
          onSettings={() => setSheet('settings')} syncStatus={sync.status}
          onPrev={() => setMonth((m) => shiftMonth(m, -1))} onNext={() => setMonth((m) => shiftMonth(m, 1))} />

        {!storage.ok && (
          <div className="mx-5 mb-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold px-4 py-3">
            ⚠️ Penyimpanan browser tidak tersedia di tempat aplikasi ini berjalan, jadi data hanya bertahan sampai halaman
            di-refresh. Jalankan di browser biasa (mis. proyek Vite/CRA) agar data tersimpan permanen.
          </div>
        )}

        {tab === 'home' && (
          <>
            <BalanceCard balance={totalBalance} income={monthTotals.income} expense={monthTotals.expense}
              hidden={hidden} onToggle={() => setHidden((h) => !h)} />

            <Breakdown data={breakdown} total={monthTotals.expense} activeCategory={catFilter} onPick={pickCategory} />

            <section ref={historyRef} className="mx-5 mt-6 scroll-mt-20">
              <h2 className="text-sm font-extrabold text-slate-800 mb-3">Riwayat transaksi</h2>

              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
                {[ALL, IN, OUT].map((f) => (
                  <Chip key={f} active={typeFilter === f} onClick={() => changeType(f)}><span className="capitalize">{f}</span></Chip>
                ))}
                {catFilter !== ALL && <Chip active dark onClick={() => setCatFilter(ALL)}>{emojiOf(catFilter)} {catFilter} ✕</Chip>}
              </div>

              {wallets.length > 1 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-3">
                  <Chip active={walletFilter === ALL} onClick={() => setWalletFilter(ALL)}>Semua kantong</Chip>
                  {wallets.map((w) => (
                    <Chip key={w.id} active={walletFilter === w.id} onClick={() => setWalletFilter(w.id)}>{w.emoji} {w.name}</Chip>
                  ))}
                </div>
              )}

              {hasFilter && (
                <div className="flex items-center justify-between bg-blue-50 rounded-2xl px-4 py-3 mb-3 animate-fade">
                  <p className="text-xs font-bold text-blue-700">{history.count} transaksi</p>
                  <div className="text-right text-sm font-extrabold">
                    {history.income > 0 && <p className="text-emerald-600">+{rupiah(history.income)}</p>}
                    {history.expense > 0 && <p className="text-rose-500">-{rupiah(history.expense)}</p>}
                    {history.income === 0 && history.expense === 0 && <p className="text-slate-400">Rp 0</p>}
                  </div>
                </div>
              )}

              {history.byDay.length === 0 ? (
                <div className="text-center py-12 text-sm text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200">
                  <p className="text-3xl mb-2">🫙</p>
                  Belum ada transaksi.<br />Tekan tombol <b className="text-blue-600">+</b> untuk mulai mencatat.
                </div>
              ) : (
                history.byDay.map((g) => (
                  <div key={g.date} className="mb-4">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">{dayLabel(g.date)}</p>
                    <div className="space-y-2">
                      {g.items.map((t) => (
                        <TransactionRow key={t.id} trx={t} wmap={wmap} showWallet={wallets.length > 1} onDelete={removeTrx} />
                      ))}
                    </div>
                  </div>
                ))
              )}
            </section>
          </>
        )}

        {tab === 'report' && <ReportTab month={month} transactions={transactions} wmap={wmap} onMonth={setMonth} />}

        {tab === 'budget' && (
          <BudgetTab budgets={budgets} spentByCat={spentByCat} totalSpent={monthTotals.expense} onEdit={openBudget} />
        )}

        {tab === 'wallets' && (
          <>
            <div className="mx-5 mb-5 rounded-3xl p-5 text-white bg-gradient-to-br from-blue-600 to-sky-500 shadow-lg shadow-blue-500/20">
              <p className="text-xs font-semibold text-sky-100">Total semua kantong</p>
              <p className="text-3xl font-black tracking-tight mt-1">{hidden ? 'Rp ••••••' : rupiah(totalBalance)}</p>
            </div>
            <WalletsTab wallets={wallets} balances={balances} hidden={hidden} onPick={pickWallet}
              onTransfer={() => setSheet('transfer')} onAdd={() => openWallet(null)} onEdit={openWallet} />
          </>
        )}
      </div>

      {/* Toast urungkan */}
      {undo && (
        <div className="fixed inset-x-0 bottom-36 z-40 flex justify-center px-5 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-4 bg-slate-800 text-white text-sm font-semibold rounded-full pl-5 pr-2 py-2 shadow-lg animate-rise">
            {undo.trx.type === TR ? 'Transfer dihapus' : 'Transaksi dihapus'}
            <button onClick={restore} className="px-3 py-1.5 rounded-full bg-white/15 text-sky-200 font-bold hover:bg-white/25 active:scale-95 transition">Urungkan</button>
          </div>
        </div>
      )}

      {notice && !undo && (
        <div className="fixed inset-x-0 bottom-36 z-40 flex justify-center px-5 pointer-events-none">
          <div className={`text-white text-sm font-bold rounded-full px-5 py-2.5 shadow-lg animate-rise ${notice.startsWith('⚠') ? 'bg-amber-500' : 'bg-emerald-600'}`}>
            {notice.startsWith('⚠') ? notice : `✓ ${notice}`}
          </div>
        </div>
      )}

      {/* FAB */}
      <div className="fixed inset-x-0 bottom-20 z-30 flex justify-center pointer-events-none">
        <div className="w-full max-w-[420px] px-6 flex justify-end">
          <button onClick={() => setSheet('trx')} aria-label="Tambah transaksi"
            className="pointer-events-auto w-14 h-14 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-blue-600 to-sky-500 shadow-lg shadow-blue-500/30 hover:scale-105 active:scale-90 transition">
            <Icon name="plus" size={26} sw={2.5} />
          </button>
        </div>
      </div>

      <BottomNav tab={tab} onTab={setTab} />

      {sheet === 'trx' && (
        <TransactionSheet categories={categories} wallets={wallets} budgets={budgets} transactions={transactions}
          defaultWallet={walletFilter !== ALL && wmap[walletFilter] ? walletFilter : wallets[0].id}
          onClose={closeSheet} onSave={saveTrx} onAddCategory={addCategory} />
      )}
      {sheet === 'budget' && (
        <BudgetSheet budgets={budgets} categories={categories} initialKey={budgetKey} onClose={closeSheet} onSave={saveBudget} onRemove={removeBudget} />
      )}
      {sheet === 'settings' && (
        <SettingsSheet cfg={syncCfg} onSaveCfg={setSyncCfg} sync={sync} onClose={closeSheet}
          onSpeak={sayHello} onNotice={setNotice} />
      )}
      {sheet === 'transfer' && <TransferSheet wallets={wallets} balances={balances} onClose={closeSheet} onSave={saveTransfer} />}
      {sheet === 'wallet' && (
        <WalletSheet wallet={walletEdit} balance={walletEdit ? balances[walletEdit.id] : 0}
          canDelete={Boolean(walletEdit) && walletEdit.id !== 'utama' && !usedWalletIds.has(walletEdit.id)}
          onClose={closeSheet} onSave={saveWallet} onDelete={deleteWallet} />
      )}

      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes sheet { from { transform: translateY(100%); } to { transform: none; } }
        @keyframes fade  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes rise  { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .animate-sheet { animation: sheet .3s cubic-bezier(.16,1,.3,1); }
        .animate-fade  { animation: fade .2s ease-out; }
        .animate-rise  { animation: rise .25s ease-out; }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
      `}</style>
    </div>
  );
}

/* Tampilkan pesan error di layar (bukan layar putih) supaya mudah dilaporkan */
class ErrorBoundary extends React.Component {
  state = { fatal: null, soft: null };
  static getDerivedStateFromError(error) { return { fatal: error }; }
  componentDidMount() {
    this.onErr = (ev) => this.setState({ soft: ev.error?.message || ev.reason?.message || ev.message || 'Terjadi kesalahan' });
    window.addEventListener('error', this.onErr);
    window.addEventListener('unhandledrejection', this.onErr);
  }
  componentWillUnmount() {
    window.removeEventListener('error', this.onErr);
    window.removeEventListener('unhandledrejection', this.onErr);
  }
  render() {
    if (this.state.fatal) {
      return (
        <div className="min-h-screen grid place-items-center bg-slate-100 p-6">
          <div className="max-w-sm bg-white rounded-3xl p-6 shadow-lg text-center">
            <p className="text-3xl mb-2">😵</p>
            <p className="font-extrabold text-slate-800 mb-1">Aplikasi mengalami error</p>
            <p className="text-xs text-rose-500 font-mono break-words mb-4">{String(this.state.fatal.message || this.state.fatal)}</p>
            <button onClick={() => window.location.reload()} className="px-5 py-2.5 rounded-full bg-blue-600 text-white text-sm font-bold">Muat ulang</button>
          </div>
        </div>
      );
    }
    return (
      <>
        {this.state.soft && (
          <div className="fixed top-0 inset-x-0 z-[60] bg-rose-600 text-white text-xs font-semibold px-4 py-2 flex items-center justify-between gap-3">
            <span>⚠️ {this.state.soft}</span>
            <button onClick={() => this.setState({ soft: null })} className="underline shrink-0">Tutup</button>
          </div>
        )}
        {this.props.children}
      </>
    );
  }
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
