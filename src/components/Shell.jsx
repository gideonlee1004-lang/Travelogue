import React from 'react';
import { Home, Bookmark, CalendarDays, Plane, User, Bell, ChevronRight } from 'lucide-react';
import heroArt from '../assets/hero.webp';
import bambooArt from '../assets/bamboo.webp';

export const NAV_ITEMS = [
  { key: 'overview', label: 'Overview', Icon: Home },
  { key: 'saved', label: 'Saved Places', short: 'Saved', Icon: Bookmark },
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

/* ---------- Avatar: uploaded photo, or the first letter of the name ---------- */
export function Avatar({ user, className = 'w-10 h-10 text-lg' }) {
  const photo = user?.profile?.avatar;
  const initial = user?.name ? user.name[0].toUpperCase() : 'U';
  return photo ? (
    <img src={photo} alt="" className={`rounded-full object-cover bg-cream-2 ${className}`} />
  ) : (
    <span className={`rounded-full bg-gradient-to-br from-sage to-sage-deep text-white font-serif flex items-center justify-center ${className}`}>{initial}</span>
  );
}

/* ---------- Navigation: top bar everywhere, plus a bottom tab bar on phones ---------- */
export function TopNav({ page, onNavigate, user, notifications = 0, onBell, onAvatar }) {
  return (
    <>
      <header className="sticky top-0 z-40 bg-cream/90 backdrop-blur border-b border-line">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 lg:h-16 flex items-center gap-3 sm:gap-6">
          <button onClick={() => onNavigate('overview')} className="flex items-center gap-2 shrink-0 cursor-pointer">
            <BrandMark className="w-8 h-8 lg:w-9 lg:h-9" />
            <span className="font-serif text-[21px] sm:text-2xl tracking-tight text-ink">Travelogue</span>
          </button>
          <span className="hidden lg:block h-7 w-px bg-line-2" />

          <nav className="hidden lg:flex items-center gap-1 flex-1 justify-center">
            {NAV_ITEMS.map(({ key, label, Icon }) => {
              const active = page === key;
              return (
                <button
                  key={key}
                  onClick={() => onNavigate(key)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex items-center gap-2 px-3 xl:px-4 h-10 rounded-full text-[14px] xl:text-[15px] transition-colors cursor-pointer ${
                    active ? 'bg-sage-soft text-ink font-medium' : 'text-ink-2 hover:bg-cream-2'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px]" strokeWidth={1.8} />
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2 sm:gap-4">
            <span className="hidden lg:block h-7 w-px bg-line-2" />
            <button onClick={onBell} className="relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-cream-2 cursor-pointer" title="Flight updates" aria-label="Flight updates">
              <Bell className="w-5 h-5 text-ink-2" strokeWidth={1.8} />
              {notifications > 0 && <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-clay ring-2 ring-cream" />}
            </button>
            <button onClick={onAvatar} className="rounded-full ring-2 ring-paper shadow-sm cursor-pointer" title={user?.name} aria-label="Profile">
              <Avatar user={user} className="w-9 h-9 lg:w-10 lg:h-10 text-lg" />
            </button>
          </div>
        </div>
      </header>

      {/* Phone: tabs sit under the thumb */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-paper/95 backdrop-blur border-t border-line tl-safe-bottom">
        <div className="grid grid-cols-5 px-1 max-w-xl mx-auto">
          {NAV_ITEMS.map(({ key, label, short, Icon }) => {
            const active = page === key;
            return (
              <button key={key} onClick={() => onNavigate(key)} aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 h-14 text-[10.5px] cursor-pointer ${active ? 'text-sage-deep font-semibold' : 'text-ink-3'}`}>
                <span className={`w-12 h-7 rounded-full flex items-center justify-center ${active ? 'bg-sage-soft' : ''}`}><Icon className="w-5 h-5" strokeWidth={active ? 2 : 1.8} /></span>
                <span>{short || label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}

/* ---------- Hero artwork: the painted hills, sun and blossom branch ---------- */
// Fills its parent. The painting keeps its upper band (blossoms, sun, ridgelines) in view at
// any shape of card; `veil` lays a soft wash under the left side so headings stay readable.
export function HeroArt({ className = '', veil = true }) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      <img src={heroArt} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover select-none" style={{ objectPosition: '72% 12%' }} />
      {veil && <div className="absolute inset-0 tl-hero-veil" />}
    </div>
  );
}

/* ---------- Bamboo: a corner ornament. Position and size it with classes. ---------- */
// Add `isolate` to the card it sits in; the bamboo then stays behind the card's content.
export function Bamboo({ className = '' }) {
  return <img src={bambooArt} alt="" aria-hidden="true" draggable={false} className={`absolute -z-10 pointer-events-none select-none ${className}`} />;
}

/* ---------- Hero band ---------- */
export function Hero({ eyebrow, title, subtitle, children, className = '', compact = false }) {
  return (
    <section className={`relative overflow-hidden rounded-2xl border border-line ${compact ? 'min-h-[120px] sm:min-h-[150px]' : 'min-h-[150px] sm:min-h-[190px]'} ${className}`}>
      <HeroArt />
      <div className="relative z-10 p-5 sm:p-8 max-w-[640px]">
        {eyebrow && <p className="text-[11px] tracking-[0.22em] uppercase text-ink-3 font-medium mb-2">{eyebrow}</p>}
        {title && <h1 className="font-serif text-[30px] sm:text-[44px] leading-[1.05] text-ink">{title}</h1>}
        {subtitle && <p className="mt-2 sm:mt-3 text-[14px] sm:text-[15px] text-ink-2 max-w-[520px]">{subtitle}</p>}
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
