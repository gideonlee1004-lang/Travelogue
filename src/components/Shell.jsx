import React from 'react';
import { Home, Bookmark, CalendarDays, Plane, User, Bell, ChevronRight } from 'lucide-react';

export const NAV_ITEMS = [
  { key: 'overview', label: 'Overview', Icon: Home },
  { key: 'saved', label: 'Saved Places', mobileLabel: 'Saved', Icon: Bookmark },
  { key: 'itinerary', label: 'Itinerary', Icon: CalendarDays },
  { key: 'flights', label: 'Flights', Icon: Plane },
  { key: 'profile', label: 'Profile', Icon: User }
];

/* ---------- Brand mark: two soft mountain strokes ---------- */
export function BrandMark({ className = 'w-9 h-9' }) {
  return (
    <svg viewBox="0 0 48 40" className={className} aria-hidden="true">
      <path d="M4 32 L20 10 L30 24 L36 17 L46 32 Z" fill="none" stroke="#d9823b" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M12 32 L24 18 L34 32" fill="none" stroke="#6f7f5c" strokeWidth="3.2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/* ---------- Top navigation ---------- */
export function TopNav({ page, onNavigate, user, avatar, notifications = 0, onBell, onAvatar }) {
  const initial = user?.name ? user.name[0].toUpperCase() : 'U';
  return (
    <>
    <header className="sticky top-0 z-40 bg-cream/90 backdrop-blur border-b border-line">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center gap-3 sm:gap-6">
        <button onClick={() => onNavigate('overview')} className="flex items-center gap-2 shrink-0 cursor-pointer">
          <BrandMark />
          <span className="font-serif text-[22px] sm:text-2xl tracking-tight text-ink">Travelogue</span>
        </button>
        <span className="hidden lg:block h-7 w-px bg-line-2" />

        <nav className="hidden lg:flex items-center gap-1 flex-1 justify-center">
          {NAV_ITEMS.map(({ key, label, Icon }) => {
            const active = page === key;
            return (
              <button
                key={key}
                onClick={() => onNavigate(key)}
                className={`flex items-center gap-2 px-4 h-10 rounded-full text-[15px] transition-colors cursor-pointer ${
                  active ? 'bg-sage-soft text-ink font-medium' : 'text-ink-2 hover:bg-cream-2'
                }`}
              >
                <Icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          <span className="hidden lg:block h-7 w-px bg-line-2" />
          <button onClick={onBell} className="relative p-2 rounded-full hover:bg-cream-2 cursor-pointer" title="Notifications">
            <Bell className="w-5 h-5 text-ink-2" strokeWidth={1.8} />
            {notifications > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-clay ring-2 ring-cream" />}
          </button>
          <button onClick={onAvatar} className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-sage to-sage-deep text-white font-serif text-lg flex items-center justify-center ring-2 ring-paper shadow-sm cursor-pointer" title={user?.name}>
            {avatar ? <img src={avatar} alt="Your profile" className="w-full h-full object-cover" /> : initial}
          </button>
        </div>
      </div>

    </header>
      {/* Mobile navigation stays within thumb reach, without squeezing the header. */}
      <nav aria-label="Mobile navigation" className="lg:hidden fixed bottom-0 left-0 right-0 z-50 grid grid-cols-5 gap-0.5 border-t border-line bg-paper/95 backdrop-blur px-1 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] shadow-[0_-6px_25px_rgba(45,41,36,0.06)]">
        {NAV_ITEMS.map(({ key, label, mobileLabel, Icon }) => {
          const active = page === key;
          return (
            <button key={key} onClick={() => onNavigate(key)} aria-current={active ? 'page' : undefined}
              className={`min-w-0 min-h-12 flex flex-col items-center justify-center gap-1 px-1 rounded-xl text-[10px] cursor-pointer ${active ? 'bg-sage-soft text-ink font-semibold' : 'text-ink-2'}`}>
              <Icon className="w-[19px] h-[19px] shrink-0" strokeWidth={1.8} />
              <span className="truncate max-w-full">{mobileLabel || label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

/* ---------- Hero artwork: ink-wash hills, sun, blossom branch ---------- */
export function HeroArt({ className = '' }) {
  const blossoms = [
    [1140, 54, 9], [1172, 38, 8], [1204, 70, 10], [1236, 46, 8], [1262, 82, 9], [1292, 60, 8],
    [1318, 96, 9], [1350, 72, 10], [1120, 92, 7], [1196, 110, 8], [1280, 122, 7], [1340, 130, 8]
  ];
  return (
    <svg viewBox="0 0 1400 200" preserveAspectRatio="xMidYMid slice" className={`absolute inset-0 w-full h-full ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id="hero-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbf8f1" />
          <stop offset="1" stopColor="#f3eee2" />
        </linearGradient>
        <radialGradient id="hero-sun" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#e9a070" stopOpacity="0.95" />
          <stop offset="0.7" stopColor="#e7a476" stopOpacity="0.85" />
          <stop offset="1" stopColor="#e7a476" stopOpacity="0.3" />
        </radialGradient>
        <filter id="hero-blur"><feGaussianBlur stdDeviation="0.6" /></filter>
      </defs>
      <rect width="1400" height="200" fill="url(#hero-bg)" />

      {/* distant hills */}
      <path d="M-20 170 C120 120 220 150 330 118 C420 92 500 130 600 108 C690 90 760 140 860 118 C960 96 1040 150 1160 120 C1260 96 1340 130 1420 118 L1420 200 L-20 200 Z" fill="#c9d3bd" opacity="0.4" filter="url(#hero-blur)" />
      <path d="M-20 185 C100 150 200 170 300 150 C400 130 470 175 580 150 C690 126 760 170 880 148 C980 130 1060 175 1180 150 C1280 130 1340 165 1420 150 L1420 200 L-20 200 Z" fill="#b2bfa3" opacity="0.4" />
      <path d="M-20 200 C120 178 220 190 340 176 C440 164 540 190 640 176 C740 162 820 192 940 176 C1040 164 1140 190 1240 176 C1320 166 1380 184 1420 178 L1420 200 Z" fill="#9aa889" opacity="0.35" />
      {/* faint far ridge */}
      <path d="M520 110 C600 70 680 90 760 72 C830 58 880 90 960 80" fill="none" stroke="#b9c3ab" strokeWidth="6" strokeLinecap="round" opacity="0.5" filter="url(#hero-blur)" />

      {/* sun */}
      <circle cx="690" cy="62" r="34" fill="url(#hero-sun)" />

      {/* blossom branch */}
      <g>
        <path d="M1400 20 C1330 28 1290 60 1250 70 C1210 80 1160 60 1110 86" fill="none" stroke="#7a5a44" strokeWidth="4" strokeLinecap="round" />
        <path d="M1310 46 C1290 70 1300 100 1278 128" fill="none" stroke="#7a5a44" strokeWidth="3" strokeLinecap="round" />
        <path d="M1225 76 C1210 96 1190 104 1180 130" fill="none" stroke="#7a5a44" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M1350 40 C1340 58 1352 84 1334 108" fill="none" stroke="#7a5a44" strokeWidth="2.5" strokeLinecap="round" />
        {blossoms.map(([x, y, r], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            {[0, 72, 144, 216, 288].map(a => (
              <ellipse key={a} cx="0" cy={-r * 0.55} rx={r * 0.42} ry={r * 0.62} fill={i % 3 === 0 ? '#e58a63' : '#ee9f7a'} transform={`rotate(${a})`} />
            ))}
            <circle r={r * 0.22} fill="#f6d9c3" />
          </g>
        ))}
      </g>
    </svg>
  );
}

/* ---------- Hero band ---------- */
export function Hero({ eyebrow, title, subtitle, children, className = '', compact = false }) {
  return (
    <section className={`relative overflow-hidden rounded-2xl border border-line ${compact ? 'min-h-[150px]' : 'min-h-[190px]'} ${className}`}>
      <HeroArt />
      <div className="relative z-10 p-6 sm:p-8 max-w-[640px]">
        {eyebrow && <p className="text-[11px] tracking-[0.22em] uppercase text-ink-3 font-medium mb-2">{eyebrow}</p>}
        {title && <h1 className="font-serif text-[34px] sm:text-[44px] leading-[1.05] text-ink">{title}</h1>}
        {subtitle && <p className="mt-3 text-[15px] text-ink-2 max-w-[520px]">{subtitle}</p>}
        {children}
      </div>
    </section>
  );
}

/* ---------- Primitives ---------- */
export function Card({ className = '', children, ...rest }) {
  return <div className={`tl-card ${className}`} {...rest}>{children}</div>;
}

export function SectionTitle({ icon: Icon, title, count, subtitle, action, onAction }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="flex items-start gap-3 min-w-0">
        {Icon && <span className="mt-1 w-8 h-8 rounded-lg bg-clay-soft text-clay flex items-center justify-center shrink-0"><Icon className="w-4 h-4" /></span>}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-serif text-[22px] text-ink leading-tight">{title}</h2>
            {count != null && <span className="text-[11px] px-2 py-0.5 rounded-full bg-cream-2 border border-line text-ink-2">{count}</span>}
          </div>
          {subtitle && <p className="text-[13px] text-ink-3 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action && (
        <button onClick={onAction} className="text-[13px] font-medium text-clay hover:text-clay-deep flex items-center gap-1 shrink-0 cursor-pointer">
          {action} <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export function Chip({ active, icon: Icon, children, onClick, className = '' }) {
  return (
    <button onClick={onClick}
      className={`inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-[13px] whitespace-nowrap transition-colors cursor-pointer ${
        active ? 'bg-sage-soft border-sage/40 text-ink font-medium' : 'bg-paper border-line text-ink-2 hover:border-line-2 hover:bg-cream-2'
      } ${className}`}>
      {Icon && <Icon className="w-4 h-4" strokeWidth={1.8} />}
      <span>{children}</span>
    </button>
  );
}

export function Btn({ variant = 'primary', icon: Icon, children, className = '', ...rest }) {
  const base = 'inline-flex items-center justify-center gap-2 h-10 px-4 rounded-full text-[13px] font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-default';
  const styles = {
    primary: 'bg-sage-deep text-white hover:bg-[#46553a] shadow-sm',
    clay: 'bg-clay text-white hover:bg-clay-deep shadow-sm',
    soft: 'bg-sage-soft text-ink hover:bg-[#d8dfc9] border border-sage/20',
    outline: 'bg-paper text-ink border border-line hover:border-line-2 hover:bg-cream-2',
    ghost: 'text-ink-2 hover:bg-cream-2',
    danger: 'bg-paper text-red-600 border border-red-200 hover:bg-red-50'
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {Icon && <Icon className="w-4 h-4" strokeWidth={1.9} />}
      {children}
    </button>
  );
}

export function IconBadge({ icon: Icon, tone = 'sage', className = '' }) {
  const tones = {
    sage: 'bg-sage-soft text-sage-deep',
    clay: 'bg-clay-soft text-clay-deep',
    sky: 'bg-sky-soft text-[#5a7386]',
    sand: 'bg-sand text-[#9a7a3a]'
  };
  return <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tones[tone]} ${className}`}><Icon className="w-[18px] h-[18px]" strokeWidth={1.8} /></span>;
}

export function Stat({ icon: Icon, value, label, tone = 'clay' }) {
  const color = tone === 'clay' ? 'text-clay' : tone === 'sage' ? 'text-sage' : 'text-[#5a7386]';
  return (
    <div className="flex flex-col items-center text-center px-2">
      {Icon && <Icon className={`w-5 h-5 ${color} mb-1`} strokeWidth={1.8} />}
      <span className="font-serif text-2xl text-ink leading-none">{value}</span>
      <span className="text-[11px] text-ink-3 mt-1">{label}</span>
    </div>
  );
}

export function Tag({ icon: Icon, children }) {
  return (
    <span className="inline-flex items-center gap-1 h-6 px-2 rounded-full bg-cream-2 border border-line text-[11px] text-ink-2">
      {Icon && <Icon className="w-3 h-3" strokeWidth={1.8} />}{children}
    </span>
  );
}

export function EmptyNote({ children, action, onAction }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-2 bg-cream-2/60 p-6 text-center text-[13px] text-ink-3">
      <p>{children}</p>
      {action && <button onClick={onAction} className="mt-3 text-clay font-medium cursor-pointer">{action}</button>}
    </div>
  );
}

export function WavesFooter({ className = '' }) {
  return <div className={`tl-waves h-24 rounded-b-2xl ${className}`} />;
}
