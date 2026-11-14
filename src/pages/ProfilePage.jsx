import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  User, Settings, Bell, Languages, ChevronRight, Camera, BadgeCheck, Briefcase, Globe2, Bookmark, Users,
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
  { key: 'language', label: 'Language', sub: 'English (US)', Icon: Languages }
];

const DEFAULT_PROFILE = {
  bio: 'Traveler, planner, and slow explorer ✦\nCollecting meaningful places, good food, and mindful journeys.',
  avatar: null,
  interests: ['Slow Travel', 'Culture', 'Nature', 'Food', 'Wellness'],
  prefs: { comfort: 'Boutique & thoughtful stays', pace: 'Relaxed & immersive', companions: 'Mix of solo & friends', interests: 'Culture, nature, food, wellness', season: 'Spring & autumn', length: '5 – 12 days' },
  notifications: { flights: true, shared: true, reminders: false }
};

function useLocalProfile(userId) {
  const key = `tl_profile_${userId || 'guest'}`;
  const [profile, setProfile] = useState(() => {
    try { return { ...DEFAULT_PROFILE, ...(JSON.parse(localStorage.getItem(key) || '{}')) }; } catch { return DEFAULT_PROFILE; }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(profile));
      window.dispatchEvent(new CustomEvent('travelogue-profile-updated', { detail: { userId } }));
    } catch { /* ignore storage full */ }
  }, [key, profile, userId]);
  return [profile, setProfile];
}

export default function ProfilePage(ctx) {
  const { user, trips, activeTrip, sharedMeta, navigate, setActiveTripId, setActiveDay, handleLogout, isDbSyncing, dbError } = ctx;
  const [profile, setProfile] = useLocalProfile(user?.id);
  const [section, setSection] = useState('profile');
  const [editingBio, setEditingBio] = useState(false);
  const [editingPrefs, setEditingPrefs] = useState(false);
  const [draftBio, setDraftBio] = useState(profile.bio || '');
  const [draftInterests, setDraftInterests] = useState(profile.interests || []);
  const [draftPrefs, setDraftPrefs] = useState(profile.prefs || DEFAULT_PROFILE.prefs);
  const avatarInputRef = useRef(null);
  const [avatarError, setAvatarError] = useState('');

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
  const startBioEdit = () => { setDraftBio(profile.bio || ''); setDraftInterests([...(profile.interests || [])]); setEditingBio(true); };
  const startPrefsEdit = () => { setDraftPrefs({ ...DEFAULT_PROFILE.prefs, ...profile.prefs }); setEditingPrefs(true); };
  const saveBio = () => { setProfile(p => ({ ...p, bio: draftBio.trim(), interests: draftInterests })); setEditingBio(false); };
  const savePrefs = () => { setProfile(p => ({ ...p, prefs: draftPrefs })); setEditingPrefs(false); };
  const onAvatarChange = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
      setAvatarError('Choose a JPG, PNG or WebP image smaller than 8 MB.'); return;
    }
    setAvatarError('');
    try {
      const source = URL.createObjectURL(file);
      const img = new Image();
      try {
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = source; });
        const scale = Math.min(1, 400 / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        setProfile(p => ({ ...p, avatar: canvas.toDataURL('image/jpeg', 0.8) }));
      } finally { URL.revokeObjectURL(source); }
    } catch { setAvatarError('Unable to read this photo. Please try another image.'); }
  };
  const prefChoices = {
    comfort: ['Boutique & thoughtful stays', 'Budget-friendly', 'Comfortable hotels', 'Luxury stays'],
    pace: ['Relaxed & immersive', 'Balanced', 'Active & packed'],
    companions: ['Mix of solo & friends', 'Solo', 'With friends', 'With family', 'With a partner'],
    interests: ['Culture, nature, food, wellness', 'Nature & outdoors', 'Food & cafés', 'Arts & culture', 'Everything'],
    season: ['Spring & autumn', 'Spring', 'Summer', 'Autumn', 'Winter', 'Any season'],
    length: ['5 – 12 days', '1 – 4 days', '5 – 7 days', '8 – 14 days', '15+ days']
  };

  const menuPanel = {
    account: (
      <Card className="p-5 space-y-4">
        <h2 className="font-serif text-[24px] text-ink">Account Settings</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-[13px]">
          <div className="rounded-xl bg-cream-2 border border-line p-3"><p className="text-[11px] uppercase tracking-wider text-ink-3 flex items-center gap-1"><User className="w-3 h-3" />Name</p><p className="font-medium mt-1">{user?.name}</p></div>
          <div className="rounded-xl bg-cream-2 border border-line p-3"><p className="text-[11px] uppercase tracking-wider text-ink-3 flex items-center gap-1"><Mail className="w-3 h-3" />Email</p><p className="font-medium mt-1 break-all">{user?.email}</p></div>
          <div className="rounded-xl bg-cream-2 border border-line p-3 sm:col-span-2"><p className="text-[11px] uppercase tracking-wider text-ink-3 flex items-center gap-1"><Database className="w-3 h-3" />Storage</p>
            <p className="font-medium mt-1 flex items-center gap-2">Your data <span className={`w-2 h-2 rounded-full ${dbError ? 'bg-red-500' : isDbSyncing ? 'bg-amber-500' : 'bg-sage'}`} /> <span className="text-ink-3 font-normal">{dbError ? 'Error' : isDbSyncing ? 'Syncing…' : 'Synced'}</span></p></div>
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
    language: (
      <Card className="p-5 space-y-3 text-[13px] text-ink-2">
        <h2 className="font-serif text-[24px] text-ink">Language</h2>
        <p>English (US). Dates follow your browser locale.</p>
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
            <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full overflow-hidden bg-gradient-to-br from-sage-soft to-sage text-white font-serif text-6xl flex items-center justify-center ring-4 ring-paper shadow-md">
              {profile.avatar ? <img src={profile.avatar} alt="Your profile" className="h-full w-full object-cover" /> : (user?.name?.[0]?.toUpperCase() || 'U')}
            </div>
            <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onAvatarChange} aria-label="Upload profile photo" />
            <button type="button" onClick={() => avatarInputRef.current?.click()} className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-paper border border-line flex items-center justify-center text-ink-2 shadow-sm cursor-pointer" title="Upload profile picture" aria-label="Upload profile picture"><Camera className="w-5 h-5" /></button>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><h1 className="font-serif text-[30px] sm:text-[38px] leading-tight text-ink break-words">{user?.name}</h1><BadgeCheck className="w-6 h-6 text-sage shrink-0" /></div>
            {avatarError && <p role="alert" className="text-[12px] text-red-600 mt-1">{avatarError}</p>}
            <p className="text-[14px] text-ink-3 mt-1">@{handle}</p>
            {editingBio ? (
              <div className="mt-3 space-y-3 max-w-md">
                <label className="block text-[12px] font-medium text-ink-2">About me
                  <textarea value={draftBio} onChange={e => setDraftBio(e.target.value)} rows={3} maxLength={400} placeholder="A little about your travels…" className="mt-1 w-full p-3 rounded-xl border border-line bg-paper text-[14px] outline-none focus:border-sage" />
                </label>
                <div>
                  <p className="text-[12px] font-medium text-ink-2 mb-2">Interests</p>
                  <div className="flex flex-wrap gap-2">
                    {['Slow Travel', 'Culture', 'Nature', 'Food', 'Wellness'].map(value => (
                      <button key={value} type="button" onClick={() => setDraftInterests(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value])}
                        className={`px-3 py-1.5 rounded-full text-[12px] border cursor-pointer ${draftInterests.includes(value) ? 'bg-sage-soft border-sage text-sage-deep' : 'bg-paper border-line text-ink-2'}`}>
                        {draftInterests.includes(value) ? '✓ ' : ''}{value}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2"><Btn icon={Check} onClick={saveBio}>Save</Btn><Btn variant="outline" icon={X} onClick={() => setEditingBio(false)}>Cancel</Btn></div>
              </div>
            ) : (
              <>
                <p className="text-[14px] text-ink-2 mt-3 whitespace-pre-line max-w-md">{profile.bio}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {(profile.interests || []).map(i => { const chip = INTEREST_CHIPS.find(c => c.key === i); return <Tag key={i} icon={chip?.Icon || Heart}>{i}</Tag>; })}
                  <button onClick={startBioEdit} className="h-7 px-2 rounded-full text-[12px] text-clay hover:bg-clay-soft inline-flex items-center gap-1 cursor-pointer"><Pen className="w-3 h-3" />Edit bio</button>
                </div>
              </>
            )}
          </div>
          <div className="grid grid-cols-4 divide-x divide-line w-full lg:w-auto shrink-0 bg-paper/85 backdrop-blur-sm rounded-2xl border border-line py-3 px-1 sm:px-2">
            {[
              { Icon: Briefcase, v: stats.trips, l: 'Trips Taken' },
              { Icon: Globe2, v: stats.countries, l: 'Countries Visited' },
              { Icon: Bookmark, v: stats.saved, l: 'Saved Places' },
              { Icon: Users, v: stats.friends, l: 'Friends & Companions' }
            ].map(s => (
              <div key={s.l} className="flex flex-col items-center text-center px-1 sm:px-5 min-w-0">
                <s.Icon className="w-5 h-5 text-sage-deep" strokeWidth={1.8} />
                <span className="font-serif text-[30px] leading-none text-ink mt-1">{s.v}</span>
                <span className="text-[10px] sm:text-[11px] text-ink-3 mt-1 leading-tight max-w-[72px] break-words">{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] xl:grid-cols-[230px_1fr_340px] gap-5 items-start">
        {/* ---------- Menu ---------- */}
        <Card className="p-2 bg-cream-2/70 overflow-x-auto lg:overflow-hidden lg:sticky lg:top-[80px] flex lg:block gap-1">
          {MENU.map(m => (
            <button key={m.key} onClick={() => setSection(m.key)} className={`shrink-0 lg:w-full flex items-center gap-2 lg:gap-3 px-3 py-2.5 rounded-xl text-left whitespace-nowrap cursor-pointer ${section === m.key ? 'bg-sage-soft' : 'hover:bg-cream-2'}`}>
              <m.Icon className="w-4 h-4 text-ink-2" strokeWidth={1.8} />
              <span className="flex-1 min-w-0"><span className="block text-[14px] text-ink">{m.label}</span>{m.sub && <span className="block text-[11px] text-ink-3">{m.sub}</span>}</span>
              {section !== m.key && <ChevronRight className="w-4 h-4 text-ink-3" />}
            </button>
          ))}
          <div className="hidden lg:block tl-waves h-20 mt-4 -mx-2 -mb-2" />
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
          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-serif text-[22px] text-ink">Travel Preferences</h2>
              {!editingPrefs && <button onClick={startPrefsEdit} className="text-[13px] text-clay font-medium inline-flex items-center gap-1 cursor-pointer"><Pen className="w-3.5 h-3.5" />Edit</button>}
            </div>
            {editingPrefs ? (
              <div className="space-y-3">
                {[
                  ['comfort', 'Comfort'], ['pace', 'Pace'], ['companions', 'Companions'],
                  ['interests', 'Interests'], ['season', 'Travel Season'], ['length', 'Trip Length']
                ].map(([key, label]) => (
                  <label key={key} className="block text-[12px] text-ink-2 font-medium">{label}
                    <select value={draftPrefs[key] || ''} onChange={e => setDraftPrefs(p => ({ ...p, [key]: e.target.value }))} className="mt-1 block w-full min-w-0 h-10 px-3 rounded-xl border border-line bg-paper text-[14px] text-ink outline-none focus:border-sage">
                      {[...new Set([draftPrefs[key], ...prefChoices[key]].filter(Boolean))].map(value => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                ))}
                <div className="flex gap-2 pt-1"><Btn icon={Check} onClick={savePrefs}>Save</Btn><Btn variant="outline" icon={X} onClick={() => setEditingPrefs(false)}>Cancel</Btn></div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-3 gap-y-4">
                {[
                  ['comfort', 'Comfort', BedDouble], ['pace', 'Pace', Gauge], ['companions', 'Companions', Users],
                  ['interests', 'Interests', Heart], ['season', 'Travel Season', Sun], ['length', 'Trip Length', Hourglass]
                ].map(([k, l, Icon]) => (
                  <div key={k} className="flex flex-col items-center text-center px-2 min-w-0">
                    <Icon className="w-5 h-5 text-clay" strokeWidth={1.8} />
                    <span className="text-[12px] font-semibold text-ink mt-1">{l}</span>
                    <span className="text-[11px] text-ink-3 mt-0.5 leading-tight break-words">{profile.prefs?.[k] || DEFAULT_PROFILE.prefs[k]}</span>
                  </div>
                ))}
              </div>
            )}
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
