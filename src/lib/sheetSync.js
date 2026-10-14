import { useCallback, useEffect, useRef, useState } from 'react';

/* Sinkronisasi dengan Google Spreadsheet lewat Google Apps Script Web App.
   Aplikasi tetap "local-first": data selalu tersimpan di perangkat, lalu disalin ke Sheet. */

const URL_PATTERN = /^https:\/\/script\.google(usercontent)?\.com\/macros\/s\/[\w-]+\/exec$/;
export const isValidUrl = (u) => URL_PATTERN.test((u || '').trim());

async function call(cfg, action, extra = {}) {
  const res = await fetch(cfg.url.trim(), {
    method: 'POST',
    // text/plain = "simple request": tidak memicu preflight CORS yang tidak didukung Apps Script
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: cfg.token || '', action, ...extra }),
  });
  if (!res.ok) throw new Error(`Server membalas ${res.status}`);
  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error('Balasan bukan data yang valid. Pastikan URL Web App benar dan akses diset "Siapa saja".');
  }
  if (!data.ok) throw new Error(data.error || 'Permintaan ditolak');
  return data;
}

export const ping = (cfg) => call(cfg, 'ping');
export const pull = (cfg) => call(cfg, 'pull').then((d) => d.snapshot);
export const push = (cfg, snapshot) => call(cfg, 'push', { snapshot });

const friendly = (e) =>
  e instanceof TypeError
    ? 'Tidak bisa terhubung. Periksa internet, URL Web App, dan akses "Siapa saja".'
    : e.message || 'Terjadi kesalahan';

export const hasData = (s) =>
  s.transactions.length > 0 || s.wallets.length > 1 || Boolean(s.wallets[0]?.initial) || Object.keys(s.budgets).length > 0;

/**
 * snapshot : { updatedAt, transactions, categories, wallets, budgets } (terbaru)
 * onRemote : (snapshot) => void   dipanggil saat data dari Sheet lebih baru
 * onStamp  : (updatedAt) => void  dipanggil saat data lokal perlu diberi cap waktu
 */
export function useSheetSync({ cfg, snapshot, onRemote, onStamp }) {
  const enabled = isValidUrl(cfg.url); // kode rahasia (token) bersifat opsional
  const [state, setState] = useState({ status: enabled ? 'idle' : 'off', message: '', last: null });

  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  const cbRef = useRef({ onRemote, onStamp });
  cbRef.current = { onRemote, onStamp };
  const busy = useRef(false);
  const lastSynced = useRef(snapshot.updatedAt); // cap waktu terakhir yang sudah sama dengan Sheet
  const lastRun = useRef(0);

  const sync = useCallback(async (mode = 'auto') => {
    if (!enabled || busy.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setState((s) => ({ ...s, status: 'error', message: 'Sedang offline. Akan disinkron saat online lagi.' }));
      return;
    }
    busy.current = true;
    lastRun.current = Date.now();
    setState((s) => ({ ...s, status: 'syncing', message: '' }));

    const pushLocal = async () => {
      let local = snapRef.current;
      if (!local.updatedAt) {
        local = { ...local, updatedAt: Date.now() };
        cbRef.current.onStamp(local.updatedAt);
      }
      await push(cfg, local);
      lastSynced.current = local.updatedAt;
    };

    try {
      if (mode === 'push') {
        await pushLocal();
      } else {
        const remote = await pull(cfg);
        const rTime = remote?.updatedAt || 0;
        const local = snapRef.current;
        if (mode === 'pull') {
          if (!rTime) throw new Error('Sheet masih kosong, belum ada data untuk diambil.');
          lastSynced.current = rTime;
          cbRef.current.onRemote(remote);
        } else if (rTime > local.updatedAt) {
          lastSynced.current = rTime;
          cbRef.current.onRemote(remote);
        } else if (local.updatedAt > rTime || (!rTime && hasData(local))) {
          await pushLocal();
        }
      }
      setState({ status: 'ok', message: '', last: Date.now() });
    } catch (e) {
      setState((s) => ({ ...s, status: 'error', message: friendly(e) }));
    } finally {
      busy.current = false;
    }
  }, [cfg, enabled]);

  // Saat dibuka / kembali ke aplikasi / kembali online
  useEffect(() => {
    if (!enabled) { setState({ status: 'off', message: '', last: null }); return undefined; }
    sync('auto');
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun.current > 20000) sync('auto');
    };
    const onOnline = () => sync('auto');
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [enabled, sync]);

  // Kirim otomatis 1,5 detik setelah ada perubahan data
  useEffect(() => {
    if (!enabled || !snapshot.updatedAt || snapshot.updatedAt === lastSynced.current) return undefined;
    const t = setTimeout(() => sync('auto'), 1500);
    return () => clearTimeout(t);
  }, [enabled, snapshot.updatedAt, sync]);

  return { ...state, enabled, sync };
}
