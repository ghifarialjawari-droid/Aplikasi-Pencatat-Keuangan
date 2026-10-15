import React from 'react';

/* Lingkaran berisi huruf pertama nama akun, dengan warna khas tiap akun. */
export default function Avatar({ account, size = 40, className = '' }) {
  return (
    <span
      className={`inline-grid place-items-center rounded-full bg-gradient-to-br ${account.warna} text-white font-black shadow-sm shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {account.nama.charAt(0).toUpperCase()}
    </span>
  );
}
