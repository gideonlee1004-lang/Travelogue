import React, { useEffect, useMemo, useState } from 'react';
import {
  User, Settings, Bell, Lock, CreditCard, Languages, HelpCircle, ChevronRight, Camera, BadgeCheck, Briefcase, Globe2, Bookmark, Users,
  CalendarDays, MapPin, BedDouble, Gauge, Heart, Sun, Hourglass, Pen, LogOut, Database, Mail, Check, X, Mountain
} from 'lucide-react';
import { HeroArt, Card, Btn, EmptyNote, Tag, WavesFooter } from '../components/Shell.jsx';
import { CoverImage, PlacePhoto } from '../components/PlacePhoto.jsx';
import { INTEREST_CHIPS, cityOf } from '../theme.js';
import { formatRange } from '../lib/helpers.js';

const MENU = [
  { key: 'profile', label: 'My Profile', Icon: User },
  { key: 'account', label: 'Account Settings', Icon: Settings },
  { key: 'notifications', label: 'Notifications', Icon: Bell },
  { key: 'privacy', label: 'Privacy & Security', Icon: Lock },
  { key: 'billing', label: 'Payments & Billing', Icon: CreditCard },
  { key: 'language', label: 'Language', sub: 'English (US)', Icon: Languages },
  { key: 'help', label: 'Help & Support', Icon: HelpCircle }
];

const DEFAULT_PROFILE = {
  bio: 'Traveler, planner, and slow explorer ✦\nCollecting meaningful places, good food, and mindful journeys.',
  interests: ['Slow Travel', 'Culture', 'Nature', 'Food', 'Wellness'],
  prefs: { comfort: 'Boutique & thoughtful stays', pace: 'Relaxed & immersive', companions: 'Mix of solo & friends', interests: 'Culture, nature, food, wellness', season: 'Spring & autumn', length: '5 – 12 days' },
  notifications: { flights: true, shared: true, reminders: false }
};

function useLocalProfile(userId) {
  const key = `tl_profile_${userId || 'guest'}`;
  const [profile, setProfile] = useState(() => {
    try { return { ...DEFAULT_PROFILE, ...(JSON.parse(localStorage.getItem(key) || '{}')) }; } catch { return DEFAULT_PROFILE; }
  });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(profile)); } catch { /* ignore */ } }, [key, profile]);
  return [profile, setProfile];
}

export default function ProfilePage(ctx) {
  const { user, trips, activeTrip, sharedMeta, navigate, setActiveTripId, setActiveDay, handleLogout, isDbSyncing, dbError } = ctx;
  const [profile, setProfile] = useLocalProfile(user?.id);
  const [section, setSection] = useState('profile');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile);

  const handle = (user?.email || 'traveler').split('@')[0].replace(/[^a-z0-9_]/gi, '').toLowerCase();
  const stats = useMemo(() => {
    const saved = trips.reduce((s, t) => s + (t.savedPlaces || []).length, 0);
    const countries = new Set(trips.map(t => (t.japaneseSub || t.name || '').trim()).filter(Boolean)).size;
    const friends = new Set(trips.flatMap(t => t.sharedId ? (sharedMeta?.[t.sharedId]?.members || []).map(m => m.email) : [])).size;
    return { trips: trips.length, countries, saved, friends: Math.max(0, friends - (friends ? 1 : 0)) };
  }, [trips, sharedMeta]);

  const upcoming = useMemo(() => [...trips].sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '')), [trips]);
  const next = upcoming.find(t => t.id === activeTrip?.id) || upcoming[0];
  const sharedTrips = trips.filter(t => t.sharedId);
  const memories = useMemo(() => trips.flatMap(t => [...(t.savedPlaces || []), ...Object.values(t.schedule || {}).flat().filter(s => !s.isFlight)]).slice(0, 7), [trips]);
  const points = trips.length * 500 + stats.saved * 25 + trips.reduce((s, t) => s + Object.values(t.schedule || {}).flat().length, 0) * 40;
  const tier = points >= 15000 ? ['Platinum Explorer', 30000] : points >= 5000 ? ['Gold Explorer', 15000] : ['Silver Explorer', 5000];

  const saveDraft = () => { setProfile(draft); setEditing(false); };
  const openEdit = () => { setDraft(profile); setEditing(true); };

  const menuPanel = {
    account: (
      <Card className="p-5 space-y-4">
        <h2 className="font-serif text-[24px] text-ink">Account Settings</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-[13px]">
          <div className="rounded-xl bg-cream-2 border border-line p-3"><p className="text-[11px] uppercase tracking-wider text-ink-3 flex items-center gap-1"><User className="w-3 h-3" />Name</p><p className="font-medium mt-1">{user?.name}</p></div>
          <div className="rounded-xl bg-cream-2 border border-line p-3"><p className="text-[11px] uppercase tracking-wider text-ink-3 flex items-center gap-1"><Mail className="w-3 h-3" />Email</p><p className="font-medium mt-1 break-all">{user?.email}</p></div>
          <div className="rounded-xl bg-cream-2 border border-line p-3 sm:col-span-2"><p className="text-[11px] uppercase tracking-wider text-ink-3 flex items-center gap-1"><Database className="w-3 h-3" />Storage</p>
            <p className="font-medium mt-1 flex items-center gap-2">MongoDB Atlas <span className={`w-2 h-2 rounded-full ${dbError ? 'bg-red-500' : isDbSyncing ? 'bg-amber-500' : 'bg-sage'}`} /> <span className="text-ink-3 font-normal">{dbError ? 'Error' : isDbSyncing ? 'Syncing…' : 'Synced'}</span></p></div>
        </div>
        <Btn variant="danger" icon={LogOut} onClick={handleLogout}>Sign out</Btn>
      </Card>
    ),
    notifications: (
      <Card className="p-5 space-y-3">
        <h2 className="font-serif text-[24px] text-ink">Notifications</h2>
        {[['flights', 'Flight gate & status changes'], ['shared', 'Edits from trip collaborators'], ['reminders', 'Day-before reminders']].map(([k, l]) => (
          <label key={k} className="flex items-center justify-between p-3 rounded-xl bg-cream-2 border border-line text-[13px] cursor-pointer">
            <span>{l}</span>
            <input type="checkbox" checked={!!profile.notifications?.[k]} onChange={e => setProfile(p => ({ ...p, notifications: { ...p.notifications, [k]: e.target.checked } }))} className="accent-[#55663f] w-4 h-4" />
          </label>
        ))}
        <p className="text-[12px] text-ink-3">In-app only for now — flight checks run automatically while Travelogue is open.</p>
      </Card>
    ),
    privacy: (
      <Card className="p-5 space-y-3 text-[13px] text-ink-2">
        <h2 className="font-serif text-[24px] text-ink">Privacy & Security</h2>
        <p>Your session lives in an HttpOnly cookie and itineraries are stored in your own MongoDB Atlas database. Shared trips are visible only to people who accepted an invitation link.</p>
        <p>Seat numbers and booking references on flights are visible to collaborators of that trip.</p>
      </Card>
    ),
    billing: (
      <Card className="p-5 space-y-3 text-[13px] text-ink-2">
        <h2 className="font-serif text-[24px] text-ink">Payments & Billing</h2>
        <p>Travelogue is free. Google Maps and AeroAPI usage is billed to the API keys configured in your deployment.</p>
      </Card>
    ),
    language: (
      <Card className="p-5 space-y-3 text-[13px] text-ink-2">
        <h2 className="font-serif text-[24px] text-ink">Language</h2>
        <p>English (US). Dates follow your browser locale.</p>
      </Card>
    ),
    help: (
      <Card className="p-5 space-y-3 text-[13px] text-ink-2">
        <h2 className="font-serif text-[24px] text-ink">Help & Support</h2>
        <p>Setup notes for AeroAPI and MongoDB are in the project's AEROAPI_SETUP.md and ETAG_TROUBLESHOOTING.md files.</p>
      </Card>
    )
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 space-y-5">
      {/* ---------- Header ---------- */}
      <Card className="relative overflow-hidden">
        <HeroArt />
        <div className="relative z-10 p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center gap-6">
          <div className="relative shrink-0 self-start">
            <div className="w-36 h-36 rounded-full bg-gradient-to-br from-sage-soft to-sage text-white font-serif text-6xl flex items-center justify-center ring-4 ring-paper shadow-md">{user?.name?.[0]?.toUpperCase() || 'U'}</div>
            <span className="absolute bottom-1 right-1 w-9 h-9 rounded-full bg-paper border border-line flex items-center justify-center text-ink-2"><Camera className="w-4 h-4" /></span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><h1 className="font-serif text-[38px] leading-none text-ink">{user?.name}</h1><BadgeCheck className="w-6 h-6 text-sage" /></div>
            <p className="text-[14px] text-ink-3 mt-1">@{handle}</p>
            {editing ? (
              <div className="mt-3 space-y-2 max-w-md">
                <textarea value={draft.bio} onChange={e => setDraft(d => ({ ...d, bio: e.target.value }))} rows={2} className="w-full p-2.5 rounded-xl border border-line bg-paper text-[13px] outline-none focus:border-sage" />
                <input value={draft.interests.join(', ')} onChange={e => setDraft(d => ({ ...d, interests: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))} placeholder="Interests, comma separated" className="w-full h-9 px-2.5 rounded-xl border border-line bg-paper text-[13px] outline-none focus:border-sage" />
                <div className="flex gap-2"><Btn icon={Check} onClick={saveDraft} className="h-9">Save</Btn><Btn variant="outline" icon={X} onClick={() => setEditing(false)} className="h-9">Cancel</Btn></div>
              </div>
            ) : (
              <>
                <p className="text-[14px] text-ink-2 mt-3 whitespace-pre-line max-w-md">{profile.bio}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {profile.interests.map(i => { const chip = INTEREST_CHIPS.find(c => c.key === i); return <Tag key={i} icon={chip?.Icon || Heart}>{i}</Tag>; })}
                  <button onClick={openEdit} className="h-6 px-2 rounded-full text-[11px] text-clay hover:bg-clay-soft inline-flex items-center gap-1 cursor-pointer"><Pen className="w-3 h-3" />Edit</button>
                </div>
              </>
            )}
          </div>
          <div className="grid grid-cols-4 divide-x divide-line shrink-0 bg-paper/85 backdrop-blur-sm rounded-2xl border border-line py-3 px-2">
            {[
              { Icon: Briefcase, v: stats.trips, l: 'Trips Taken' },
              { Icon: Globe2, v: stats.countries, l: 'Countries Visited' },
              { Icon: Bookmark, v: stats.saved, l: 'Saved Places' },
              { Icon: Users, v: stats.friends, l: 'Friends & Companions' }
            ].map(s => (
              <div key={s.l} className="flex flex-col items-center text-center px-3 sm:px-5">
                <s.Icon className="w-5 h-5 text-sage-deep" strokeWidth={1.8} />
                <span className="font-serif text-[30px] leading-none text-ink mt-1">{s.v}</span>
                <span className="text-[11px] text-ink-3 mt-1 leading-tight w-16">{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] xl:grid-cols-[230px_1fr_340px] gap-5 items-start">
        {/* ---------- Menu ---------- */}
        <Card className="p-2 bg-cream-2/70 overflow-hidden lg:sticky lg:top-[80px]">
          {MENU.map(m => (
            <button key={m.key} onClick={() => setSection(m.key)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left cursor-pointer ${section === m.key ? 'bg-sage-soft' : 'hover:bg-cream-2'}`}>
              <m.Icon className="w-4 h-4 text-ink-2" strokeWidth={1.8} />
              <span className="flex-1 min-w-0"><span className="block text-[14px] text-ink">{m.label}</span>{m.sub && <span className="block text-[11px] text-ink-3">{m.sub}</span>}</span>
              {section !== m.key && <ChevronRight className="w-4 h-4 text-ink-3" />}
            </button>
          ))}
          <div className="tl-waves h-20 mt-4 -mx-2 -mb-2" />
        </Card>

        {/* ---------- Centre ---------- */}
        <div className="space-y-5 min-w-0">
          {section !== 'profile' ? menuPanel[section] : (
            <>
              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-serif text-[24px] text-ink">Upcoming Trips</h2>
                  <button onClick={() => navigate('overview')} className="text-[13px] text-clay font-medium inline-flex items-center gap-1 cursor-pointer">View All ({trips.length}) <ChevronRight className="w-4 h-4" /></button>
                </div>
                {!next ? <EmptyNote action="Create a trip" onAction={() => ctx.openNewTrip()}>No trips planned yet.</EmptyNote> : (
                  <>
                    <button onClick={() => { setActiveTripId(next.id); setActiveDay(null); navigate('itinerary'); }} className="w-full text-left tl-card overflow-hidden grid grid-cols-1 sm:grid-cols-[240px_1fr] cursor-pointer hover:shadow-md">
                      <CoverImage trip={next} className="h-40 sm:h-full min-h-[150px]" rounded="rounded-none" overlay={false} />
                      <div className="p-4 relative">
                        <Mountain className="absolute right-4 top-4 w-10 h-10 text-sage/15" strokeWidth={1} />
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-sage-soft text-sage-deep"><Sun className="w-3 h-3" />Next Trip</span>
                        <h3 className="font-serif text-[26px] text-ink mt-1">{next.name}</h3>
                        <p className="text-[13px] text-ink-2 flex items-center gap-1.5 mt-1"><CalendarDays className="w-4 h-4" />{formatRange(next.startDate, next.daysCount)} · {next.daysCount} days</p>
                        <p className="text-[13px] text-ink-2 flex items-center gap-1.5 mt-1"><MapPin className="w-4 h-4" />{[...new Set([next.japaneseSub, ...Object.values(next.schedule || {}).flat().map(cityOf)].filter(Boolean))].slice(0, 3).join(' · ')}</p>
                        <span className="absolute right-4 bottom-4 w-8 h-8 rounded-full border border-line flex items-center justify-center text-ink-2"><ChevronRight className="w-4 h-4" /></span>
                      </div>
                    </button>
                    {upcoming.filter(t => t.id !== next.id).length > 0 && (
                      <div className="grid sm:grid-cols-2 gap-3 mt-3">
                        {upcoming.filter(t => t.id !== next.id).slice(0, 4).map(t => (
                          <button key={t.id} onClick={() => { setActiveTripId(t.id); setActiveDay(null); navigate('itinerary'); }} className="tl-card p-2 flex items-center gap-3 text-left cursor-pointer hover:shadow-md">
                            <CoverImage trip={t} className="w-20 h-14 shrink-0" rounded="rounded-lg" overlay={false} />
                            <span className="min-w-0 flex-1"><span className="block font-serif text-[17px] text-ink truncate">{t.name}</span><span className="block text-[12px] text-ink-3 flex items-center gap-1"><CalendarDays className="w-3 h-3" />{formatRange(t.startDate, t.daysCount)}</span></span>
                            <ChevronRight className="w-4 h-4 text-ink-3" />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </Card>

              <Card className="p-5 relative overflow-hidden">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Mountain className="w-7 h-7 text-clay" strokeWidth={1.5} />
                    <div><h2 className="font-serif text-[22px] text-ink leading-tight">Travelogue Rewards</h2><p className="text-[12px] text-ink-3">Plan, explore, and be rewarded.</p></div>
                  </div>
                  <div className="text-right"><p className="text-[13px] text-clay-deep font-medium">{tier[0]}</p><p className="font-serif text-[20px] text-ink leading-none">{points.toLocaleString()} pts</p></div>
                </div>
                <div className="tl-progress mt-4"><span style={{ width: `${Math.min(100, (points / tier[1]) * 100)}%`, background: 'linear-gradient(90deg,#55663f,#6f7f5c)' }} /></div>
                <p className="text-[11px] text-ink-3 text-right mt-1">Next: {tier[1] === 30000 ? 'Diamond' : tier[1] === 15000 ? 'Platinum' : 'Gold'} ({tier[1].toLocaleString()} pts)</p>
              </Card>

              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div><h2 className="font-serif text-[24px] text-ink">Travel Memories</h2><p className="text-[12px] text-ink-3">Moments from the road.</p></div>
                  <button onClick={() => navigate('saved')} className="text-[13px] text-clay font-medium inline-flex items-center gap-1 cursor-pointer">View Gallery ({stats.saved}) <ChevronRight className="w-4 h-4" /></button>
                </div>
                {memories.length === 0 ? <EmptyNote>Save places and their photos will collect here.</EmptyNote> : (
                  <div className="grid grid-cols-4 grid-rows-2 gap-2 h-56">
                    {memories.map((m, i) => (
                      <PlacePhoto key={`${m.id}_${i}`} place={m} className={i === 0 ? 'col-span-2 row-span-2' : ''} rounded="rounded-xl" />
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>

        {/* ---------- Right ---------- */}
        <div className="space-y-5">
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-serif text-[22px] text-ink">Travel Preferences</h2>
              <button onClick={openEdit} className="text-[13px] text-clay font-medium inline-flex items-center gap-1 cursor-pointer">Edit <ChevronRight className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-3 gap-y-4">
              {[
                ['comfort', 'Comfort', BedDouble], ['pace', 'Pace', Gauge], ['companions', 'Companions', Users],
                ['interests', 'Interests', Heart], ['season', 'Travel Season', Sun], ['length', 'Trip Length', Hourglass]
              ].map(([k, l, Icon], i) => (
                <div key={k} className={`flex flex-col items-center text-center px-1 ${i % 3 !== 0 ? 'border-l border-line' : ''}`}>
                  <Icon className="w-5 h-5 text-clay" strokeWidth={1.8} />
                  <span className="text-[12px] font-semibold text-ink mt-1">{l}</span>
                  {editing ? (
                    <input value={draft.prefs[k]} onChange={e => setDraft(d => ({ ...d, prefs: { ...d.prefs, [k]: e.target.value } }))} className="mt-1 w-full text-[11px] text-center px-1 py-0.5 rounded border border-line bg-paper outline-none" />
                  ) : (
                    <span className="text-[11px] text-ink-3 mt-0.5 leading-tight">{profile.prefs[k]}</span>
                  )}
                </div>
              ))}
            </div>
            {editing && <div className="flex gap-2 mt-4"><Btn icon={Check} onClick={saveDraft} className="h-9">Save</Btn><Btn variant="outline" onClick={() => setEditing(false)} className="h-9">Cancel</Btn></div>}
          </Card>

          <button onClick={() => setSection('account')} className="w-full tl-card p-4 flex items-center gap-3 text-left cursor-pointer hover:shadow-md">
            <Settings className="w-6 h-6 text-ink-2" strokeWidth={1.6} />
            <span className="flex-1"><span className="block font-serif text-[20px] text-ink">Account Settings</span><span className="block text-[12px] text-ink-3">Manage your account and app experience.</span></span>
            <ChevronRight className="w-5 h-5 text-ink-3" />
          </button>

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-serif text-[22px] text-ink">Shared Trips</h2>
              <span className="text-[13px] text-clay font-medium">View All ({sharedTrips.length})</span>
            </div>
            {sharedTrips.length === 0 ? <EmptyNote action="Share your current trip" onAction={ctx.handleOpenShare}>No shared trips yet.</EmptyNote> : (
              <div className="divide-y divide-line">
                {sharedTrips.map(t => {
                  const members = Math.max(0, (sharedMeta?.[t.sharedId]?.members?.length || 1) - 1);
                  return (
                    <button key={t.id} onClick={() => { setActiveTripId(t.id); setActiveDay(null); navigate('itinerary'); }} className="w-full flex items-center gap-3 py-3 text-left cursor-pointer">
                      <CoverImage trip={t} className="w-24 h-16 shrink-0" rounded="rounded-lg" overlay={false} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold text-ink truncate">{t.name}</span>
                        <span className="block text-[12px] text-ink-3 flex items-center gap-1"><Users className="w-3 h-3" />{members} companion{members === 1 ? '' : 's'}</span>
                        <span className="block text-[12px] text-ink-3 flex items-center gap-1"><CalendarDays className="w-3 h-3" />{formatRange(t.startDate, t.daysCount)}</span>
                      </span>
                      <span className="w-7 h-7 rounded-full border border-line flex items-center justify-center text-ink-3"><ChevronRight className="w-4 h-4" /></span>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
