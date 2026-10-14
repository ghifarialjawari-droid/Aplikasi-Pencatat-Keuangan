import React, { useId } from 'react';

/* Logo aplikasi (sama dengan public/favicon.svg), inline agar ringan dan tajam di semua ukuran. */
export default function Logo({ size = 40, className = '' }) {
  const id = 'lg' + useId().replace(/:/g, '');
  const ref = (n) => `url(#${id}-${n})`;
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" className={className} role="img" aria-label="Logo Pencatat Keuangan">
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1e40af" /><stop offset=".55" stopColor="#2563eb" /><stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx=".25" cy=".12" r=".85">
          <stop offset="0" stopColor="#fff" stopOpacity=".38" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fef08a" /><stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <linearGradient id={`${id}-bar`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#2563eb" /><stop offset="1" stopColor="#38bdf8" />
        </linearGradient>
        <linearGradient id={`${id}-wall`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#dbeafe" />
        </linearGradient>
        <filter id={`${id}-sh`} x="-25%" y="-25%" width="150%" height="160%">
          <feDropShadow dx="0" dy="14" stdDeviation="14" floodColor="#0b1e5b" floodOpacity=".38" />
        </filter>
      </defs>
      <rect width="512" height="512" rx="116" fill={ref('bg')} />
      <rect width="512" height="512" rx="116" fill={ref('glow')} />
      <g transform="translate(256 256) scale(1) translate(-270 -270)">
        <g filter={ref('sh')}><circle cx="196" cy="170" r="58" fill={ref('gold')} /></g>
        <circle cx="196" cy="170" r="42" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="6" />
        <path d="M176 182l20-22 20 22" fill="none" stroke="#b45309" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
        <g filter={ref('sh')}><rect x="76" y="196" width="360" height="232" rx="56" fill={ref('wall')} /></g>
        <rect x="124" y="334" width="40" height="54" rx="12" fill={ref('bar')} opacity=".55" />
        <rect x="180" y="306" width="40" height="82" rx="12" fill={ref('bar')} opacity=".8" />
        <rect x="236" y="272" width="40" height="116" rx="12" fill={ref('bar')} />
        <rect x="332" y="272" width="132" height="92" rx="46" fill="#1d4ed8" />
        <circle cx="386" cy="318" r="22" fill={ref('gold')} />
        <path d="M410 100l8 22 22 8-22 8-8 22-8-22-22-8 22-8z" fill="#fff" fillOpacity=".95" />
      </g>
    </svg>
  );
}
