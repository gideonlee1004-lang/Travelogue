import React, { useMemo, useRef, useState } from 'react';
import {
  User, Settings, Bell, Languages, ChevronRight, ChevronDown, Camera, BadgeCheck, Briefcase, Globe2, Bookmark, Users,
  CalendarDays, MapPin, BedDouble, Gauge, Car, Sun, Hourglass, Pen, LogOut, Mail, Check, Plus, Mountain, Trash2, CloudOff, Cloud
} from 'lucide-react';
import { HeroArt, Card, Btn, EmptyNote, Avatar } from '../components/Shell.jsx';
import { CoverImage, PlacePhoto } from '../components/PlacePhoto.jsx';
import { INTEREST_CHIPS, cityOf } from '../theme.js';
import { formatRange, fileToAvatar } from '../lib/helpers.js';

const MENU = [
  { key: 'profile', label: 'My Profile', Icon: User },
  { key: 'account', label: 'Account Settings', short: 'Account', Icon: Settings },
  { key: 'notifications', label: 'Notifications', Icon: Bell },
  { key: 'language', label: 'Language', sub: 'English (US)', Icon: Languages }
];

const INTEREST_OPTIONS = [
  'Slow Travel', 'Culture', 'Nature', 'Food', 'Wellness', 'Onsen', 'Hiking', 'Road Trips',
  'Cafés', 'Photography', 'Art & Museums', 'Shopping', 'Festivals', 'Beaches', 'Snow', 'Nightlife'
];

// Each preference is one tap: pick from a short list, saved straight away.
const PREFERENCES = [
  { key: 'comfort', label: 'Stays', Icon: BedDouble, options: ['Simple & budget', 'Boutique & thoughtful stays', 'Traditional inns', 'Full-service & luxury'] },
  { key: 'pace', label: 'Pace', Icon: Gauge, options: ['Relaxed & immersive', 'Balanced', 'Packed days'] },
  { key: 'companions', label: 'Companions', Icon: Users, options: ['Solo', 'As a couple', 'With family', 'With friends', 'Mix of solo & friends'] },
  { key: 'transport', label: 'Getting around', Icon: Car, options: ['Trains & transit', 'Rental car', 'Mostly on foot', 'A mix'] },
  { key: 'season', label: 'Travel season', Icon: Sun, options: ['Spring', 'Summer', 'Autumn', 'Winter', 'Spring & autumn', 'Any time'] },
  { key: 'length', label: 'Trip length', Icon: Hourglass, options: ['A weekend', '3 – 5 days', '5 – 12 days', 'Two weeks or more'] }
];

const BIO_MAX = 200;

function PreferenceTile({ pref, value, onChange }) {
  const options = value && !pref.options.includes(value) ? [value, ...pref.options] : pref.options;
  return (
    <label className="relative flex flex-col items-center text-center px-1.5 py-2.5 rounded-xl border border-line bg-paper hover:bg-cream-2 cursor-pointer min-w-0">
      <pref.Icon className="w-5 h-5 text-clay" strokeWidth={1.8} />
      <span className="text-[12px] font-semibold text-ink mt-1">{pref.label}</span>
      <span className={`text-[11px] mt-0.5 leading-tight inline-flex items-center gap-0.5 ${value ? 'text-ink-2' : 'text-ink-3'}`}>
        <span className="line-clamp-2">{value || 'Choose'}</span><ChevronDown className="w-3 h-3 shrink-0" />
      </span>
      <select value={value || ''} onChange={e => onChange(e.target.value)} aria-label={pref.label} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
        <option value="" disabled>Choose…</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

export default function ProfilePage(ctx) {
  const {
    user, trips, activeTrip, sharedMeta, navigate, setActiveTripId, setActiveDay, handleLogout, isDbSyncing, dbError,
    saveProfile, profileSaving, profileError
  } = ctx;
  const profile = user?.profile || {};
  const interests = Array.isArray(profile.interests) ? profile.interests : [];
  const prefs = profile.prefs || {};

  const [section, setSection] = useState('profile');
  const [bioDraft, setBioDraft] = useState(null); // null = not editing
  const [pickingInterests, setPickingInterests] = useState(false);
  const [photoMenu, setPhotoMenu] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const fileInput = useRef(null);
  const cancelBio = useRef(false);

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

  /* ----- photo ----- */
  const choosePhoto = () => { setPhotoMenu(false); fileInput.current?.click(); };
  const onPhotoPicked = async e => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    setPhotoBusy(true);
    try {
      await saveProfile({ avatar: await fileToAvatar(file) });
    } catch (err) {
      setPhotoError(err.message || 'That photo could not be used.');
    } finally {
      setPhotoBusy(false);
    }
  };
  const removePhoto = () => { setPhotoMenu(false); setPhotoError(''); saveProfile({ avatar: null }); };

  /* ----- bio: tap, type, tap away ----- */
  const commitBio = () => {
    if (bioDraft === null) return;
    const text = bioDraft.trim();
    if (!cancelBio.current && text !== (profile.bio || '')) saveProfile({ bio: text });
    cancelBio.current = false;
    setBioDraft(null);
  };

  const toggleInterest = name => {
    const has = interests.includes(name);
    if (!has && interests.length >= 12) return;
    saveProfile({ interests: has ? interests.filter(i => i !== name) : [...interests, name] });
  };

  const openTrip = t => { setActiveTripId(t.id); setActiveDay(null); navigate('itinerary'); };
  const syncLabel = dbError ? 'Changes are not being saved' : isDbSyncing || profileSaving ? 'Saving…' : 'Everything is saved to your account';

  const menuPanel = {
    account: (
      <Card className="p-4 sm:p-5 space-y-4">
        <h2 className="font-serif text-[22px] sm:text-[24px] text-ink">Account Settings</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-[13px]">
          <div className="rounded-xl bg-cream-2 border border-line p-3"><p className="text-[12px] text-ink-3 flex items-center gap-1"><User className="w-3.5 h-3.5" />Name</p><p className="font-medium mt-1">{user?.name}</p></div>
          <div className="rounded-xl bg-cream-2 border border-line p-3"><p className="text-[12px] text-ink-3 flex items-center gap-1"><Mail className="w-3.5 h-3.5" />Email</p><p className="font-medium mt-1 break-all">{user?.email}</p></div>
          <div className="rounded-xl bg-cream-2 border border-line p-3 sm:col-span-2 flex items-center gap-2">
            {dbError ? <CloudOff className="w-4 h-4 text-red-500 shrink-0" /> : <Cloud className="w-4 h-4 text-sage shrink-0" />}
            <p className="font-medium">{syncLabel}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn variant="outline" icon={Camera} onClick={choosePhoto}>{profile.avatar ? 'Change photo' : 'Add a photo'}</Btn>
          {profile.avatar && <Btn variant="outline" icon={Trash2} onClick={removePhoto}>Remove photo</Btn>}
          <Btn variant="danger" icon={LogOut} onClick={handleLogout}>Sign out</Btn>
        </div>
      </Card>
    ),
    notifications: (
      <Card className="p-4 sm:p-5 space-y-3">
        <h2 className="font-serif text-[22px] sm:text-[24px] text-ink">Notifications</h2>
        {[['flights', 'Flight gate and status changes'], ['shared', 'Edits from trip collaborators'], ['reminders', 'Day-before reminders']].map(([k, l]) => (
          <label key={k} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-cream-2 border border-line text-[13px] cursor-pointer">
            <span>{l}</span>
            <input type="checkbox" checked={!!profile.notifications?.[k]} onChange={e => saveProfile({ notifications: { [k]: e.target.checked } })} className="accent-[#55663f] w-5 h-5 shrink-0" />
          </label>
        ))}
        <p className="text-[12px] text-ink-3">Shown inside the app for now. Flights are checked while Travelogue is open.</p>
      </Card>
    ),
    language: (
      <Card className="p-4 sm:p-5 space-y-3 text-[13px] text-ink-2">
        <h2 className="font-serif text-[22px] sm:text-[24px] text-ink">Language</h2>
        <p>English (US). Dates follow your device's region setting.</p>
      </Card>
    )
  };

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-4 sm:py-5 space-y-4 sm:space-y-5" onClick={() => photoMenu && setPhotoMenu(false)}>
      <input ref={fileInput} type="file" accept="image/*" onChange={onPhotoPicked} className="hidden" />

      {/* ---------- Header ---------- */}
      <Card className="relative overflow-visible">
        <div className="absolute inset-0 overflow-hidden rounded-2xl"><HeroArt /></div>
        <div className="relative z-10 p-4 sm:p-6 grid grid-cols-[auto_1fr] lg:grid-cols-[auto_1fr_auto] gap-x-4 lg:gap-x-6 gap-y-3 items-center">
          <div className="relative lg:row-span-2 self-start">
            <button onClick={e => { e.stopPropagation(); profile.avatar ? setPhotoMenu(v => !v) : choosePhoto(); }}
              className="block rounded-full ring-4 ring-paper shadow-md cursor-pointer" aria-label={profile.avatar ? 'Change or remove your photo' : 'Add a profile photo'}>
              <Avatar user={user} className={`w-20 h-20 sm:w-28 sm:h-28 lg:w-36 lg:h-36 text-4xl sm:text-5xl lg:text-6xl ${photoBusy ? 'opacity-60' : ''}`} />
            </button>
            <span className="absolute bottom-0 right-0 w-8 h-8 lg:w-9 lg:h-9 lg:bottom-1 lg:right-1 rounded-full bg-paper border border-line flex items-center justify-center text-ink-2 pointer-events-none"><Camera className="w-4 h-4" /></span>
            {photoMenu && (
              <div className="absolute left-0 top-full mt-2 z-30 w-44 tl-card p-1 text-[13px] tl-fade" onClick={e => e.stopPropagation()}>
                <button onClick={choosePhoto} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg hover:bg-cream-2 cursor-pointer"><Camera className="w-3.5 h-3.5" />Change photo</button>
                <button onClick={removePhoto} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-red-600 hover:bg-red-50 cursor-pointer"><Trash2 className="w-3.5 h-3.5" />Remove photo</button>
              </div>
            )}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2"><h1 className="font-serif text-[28px] sm:text-[38px] leading-none text-ink truncate">{user?.name}</h1><BadgeCheck className="w-5 h-5 sm:w-6 sm:h-6 text-sage shrink-0" /></div>
            <p className="text-[14px] text-ink-3 mt-1">@{handle}</p>
            {(photoBusy || photoError || profileError) && (
              <p className={`text-[12px] mt-1 ${photoError || profileError ? 'text-red-600' : 'text-ink-3'}`} role="status">{photoError || profileError || 'Saving photo…'}</p>
            )}
          </div>

          <div className="col-span-2 lg:col-span-1 lg:col-start-2 min-w-0 max-w-xl">
            {bioDraft !== null ? (
              <div>
                <textarea autoFocus value={bioDraft} maxLength={BIO_MAX} rows={3} onChange={e => setBioDraft(e.target.value)} onBlur={commitBio}
                  onKeyDown={e => { if (e.key === 'Escape') { cancelBio.current = true; e.currentTarget.blur(); } }}
                  placeholder="A line or two about how you like to travel" aria-label="Bio"
                  className="w-full p-2.5 rounded-xl border border-sage bg-paper text-[14px] leading-snug text-ink outline-none resize-none" />
                <div className="flex items-center gap-3 mt-1 text-[12px] text-ink-3">
                  <span className="tabular-nums">{bioDraft.length}/{BIO_MAX}</span>
                  <span className="flex-1">Saves when you tap away.</span>
                  <button onMouseDown={() => { cancelBio.current = true; }} onClick={() => setBioDraft(null)} className="text-ink-2 cursor-pointer">Cancel</button>
                  <button onClick={commitBio} className="text-sage-deep font-semibold cursor-pointer">Done</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setBioDraft(profile.bio || '')} title="Edit your bio"
                className={`group text-left text-[14px] whitespace-pre-line rounded-lg -mx-1.5 px-1.5 py-1 hover:bg-paper/70 cursor-pointer ${profile.bio ? 'text-ink-2' : 'text-ink-3'}`}>
                {profile.bio || 'Add a line or two about how you like to travel.'}
                <Pen className="inline w-3 h-3 ml-1.5 text-clay align-baseline" />
              </button>
            )}

            <div className="flex flex-wrap gap-1.5 mt-2">
              {(pickingInterests ? INTEREST_OPTIONS.concat(interests.filter(i => !INTEREST_OPTIONS.includes(i))) : interests).map(name => {
                const on = interests.includes(name);
                const Icon = INTEREST_CHIPS.find(c => c.key === name)?.Icon;
                return pickingInterests ? (
                  <button key={name} onClick={() => toggleInterest(name)} aria-pressed={on}
                    className={`h-8 px-3 rounded-full border text-[12px] inline-flex items-center gap-1 cursor-pointer ${on ? 'bg-sage-deep border-sage-deep text-white' : 'bg-paper border-line text-ink-2 hover:bg-cream-2'}`}>
                    {on && <Check className="w-3 h-3" />}{name}
                  </button>
                ) : (
                  <span key={name} className="h-7 px-2.5 rounded-full bg-paper/85 border border-line text-[12px] text-ink-2 inline-flex items-center gap-1">
                    {Icon && <Icon className="w-3 h-3" strokeWidth={1.8} />}{name}
                  </span>
                );
              })}
              <button onClick={() => setPickingInterests(v => !v)}
                className={`h-7 px-2.5 rounded-full text-[12px] inline-flex items-center gap-1 cursor-pointer ${pickingInterests ? 'h-8 bg-paper border border-line text-sage-deep font-semibold' : 'text-clay-deep hover:bg-clay-soft'}`}>
                {pickingInterests ? <><Check className="w-3 h-3" />Done</> : interests.length ? <><Pen className="w-3 h-3" />Edit</> : <><Plus className="w-3 h-3" />Add interests</>}
              </button>
            </div>
          </div>

          <div className="col-span-2 lg:col-span-1 lg:col-start-3 lg:row-start-1 lg:row-span-2 grid grid-cols-4 divide-x divide-line bg-paper/85 backdrop-blur-sm rounded-2xl border border-line py-3 px-1 sm:px-2">
            {[
              { Icon: Briefcase, v: stats.trips, l: 'Trips' },
              { Icon: Globe2, v: stats.countries, l: 'Destinations' },
              { Icon: Bookmark, v: stats.saved, l: 'Saved places' },
              { Icon: Users, v: stats.friends, l: 'Companions' }
            ].map(s => (
              <div key={s.l} className="flex flex-col items-center text-center px-1.5 sm:px-4 min-w-0">
                <s.Icon className="w-5 h-5 text-sage-deep" strokeWidth={1.8} />
                <span className="font-serif text-[24px] sm:text-[30px] leading-none text-ink mt-1 tabular-nums">{s.v}</span>
                <span className="text-[11px] text-ink-3 mt-1 leading-tight">{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Phones: sections as a strip */}
      <div className="lg:hidden tl-strip flex gap-2 -mx-4 px-4">
        {MENU.map(m => (
          <button key={m.key} onClick={() => setSection(m.key)} aria-pressed={section === m.key}
            className={`shrink-0 h-9 px-3.5 rounded-full border text-[13px] inline-flex items-center gap-1.5 cursor-pointer ${section === m.key ? 'bg-sage-soft border-sage/40 text-ink font-medium' : 'bg-paper border-line text-ink-2'}`}>
            <m.Icon className="w-4 h-4" strokeWidth={1.8} />{m.short || m.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[230px_1fr] xl:grid-cols-[230px_1fr_340px] gap-4 sm:gap-5 items-start">
        {/* ---------- Menu ---------- */}
        <Card className="hidden lg:block p-2 bg-cream-2/70 overflow-hidden lg:sticky lg:top-[80px]">
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
        <div className="space-y-4 sm:space-y-5 min-w-0">
          {section !== 'profile' ? menuPanel[section] : (
            <>
              <Card className="p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-serif text-[22px] sm:text-[24px] text-ink">Upcoming Trips</h2>
                  <button onClick={() => navigate('overview')} className="text-[13px] text-clay-deep font-medium inline-flex items-center gap-1 cursor-pointer">View all ({trips.length}) <ChevronRight className="w-4 h-4" /></button>
                </div>
                {!next ? <EmptyNote action="Create a trip" onAction={() => ctx.openNewTrip()}>No trips planned yet.</EmptyNote> : (
                  <>
                    <button onClick={() => openTrip(next)} className="w-full text-left tl-card overflow-hidden grid grid-cols-1 sm:grid-cols-[240px_1fr] cursor-pointer hover:shadow-md">
                      <CoverImage trip={next} className="h-28 sm:h-full sm:min-h-[150px]" rounded="rounded-none" overlay={false} />
                      <div className="p-4 relative">
                        <Mountain className="absolute right-4 top-4 w-10 h-10 text-sage/15" strokeWidth={1} />
                        <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-sage-soft text-sage-deep"><Sun className="w-3 h-3" />Next trip</span>
                        <h3 className="font-serif text-[24px] sm:text-[26px] text-ink mt-1 leading-tight">{next.name}</h3>
                        <p className="text-[13px] text-ink-2 flex items-center gap-1.5 mt-1"><CalendarDays className="w-4 h-4 shrink-0" />{formatRange(next.startDate, next.daysCount)}, {next.daysCount} days</p>
                        <p className="text-[13px] text-ink-2 flex items-center gap-1.5 mt-1 pr-10"><MapPin className="w-4 h-4 shrink-0" />{[...new Set([next.japaneseSub, ...Object.values(next.schedule || {}).flat().map(cityOf)].filter(Boolean))].slice(0, 3).join(', ')}</p>
                        <span className="absolute right-4 bottom-4 w-8 h-8 rounded-full border border-line flex items-center justify-center text-ink-2"><ChevronRight className="w-4 h-4" /></span>
                      </div>
                    </button>
                    {upcoming.filter(t => t.id !== next.id).length > 0 && (
                      <div className="grid sm:grid-cols-2 gap-3 mt-3">
                        {upcoming.filter(t => t.id !== next.id).slice(0, 4).map(t => (
                          <button key={t.id} onClick={() => openTrip(t)} className="tl-card p-2 flex items-center gap-3 text-left cursor-pointer hover:shadow-md">
                            <CoverImage trip={t} className="w-20 h-14 shrink-0" rounded="rounded-lg" overlay={false} />
                            <span className="min-w-0 flex-1"><span className="block font-serif text-[17px] text-ink truncate">{t.name}</span><span className="text-[12px] text-ink-3 flex items-center gap-1"><CalendarDays className="w-3 h-3" />{formatRange(t.startDate, t.daysCount)}</span></span>
                            <ChevronRight className="w-4 h-4 text-ink-3" />
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </Card>

              <Card className="p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div><h2 className="font-serif text-[22px] sm:text-[24px] text-ink">Travel Memories</h2><p className="text-[12px] text-ink-3">Moments from the road.</p></div>
                  <button onClick={() => navigate('saved')} className="text-[13px] text-clay-deep font-medium inline-flex items-center gap-1 cursor-pointer whitespace-nowrap">View gallery ({stats.saved}) <ChevronRight className="w-4 h-4" /></button>
                </div>
                {memories.length === 0 ? <EmptyNote>Save places and their photos will collect here.</EmptyNote> : (
                  <div className="grid grid-cols-4 grid-rows-2 gap-2 h-44 sm:h-56">
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
        <div className="space-y-4 sm:space-y-5 min-w-0 lg:col-start-2 xl:col-start-3">
          <Card className="p-4 sm:p-5">
            <h2 className="font-serif text-[22px] text-ink">Travel Preferences</h2>
            <p className="text-[12px] text-ink-3 mb-3">Tap one to change it.</p>
            <div className="grid grid-cols-3 gap-2">
              {PREFERENCES.map(pref => (
                <PreferenceTile key={pref.key} pref={pref} value={prefs[pref.key]} onChange={v => saveProfile({ prefs: { [pref.key]: v } })} />
              ))}
            </div>
          </Card>

          {section !== 'account' && (
            <button onClick={() => { setSection('account'); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="w-full tl-card p-4 flex items-center gap-3 text-left cursor-pointer hover:shadow-md">
              <Settings className="w-6 h-6 text-ink-2" strokeWidth={1.6} />
              <span className="flex-1"><span className="block font-serif text-[20px] text-ink">Account Settings</span><span className="block text-[12px] text-ink-3">Your name, email, photo and sign-out.</span></span>
              <ChevronRight className="w-5 h-5 text-ink-3" />
            </button>
          )}

          <Card className="p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-serif text-[22px] text-ink">Shared Trips</h2>
              {sharedTrips.length > 0 && <span className="text-[13px] text-ink-3 tabular-nums">{sharedTrips.length}</span>}
            </div>
            {sharedTrips.length === 0 ? <EmptyNote action={activeTrip ? 'Share your current trip' : undefined} onAction={ctx.handleOpenShare}>No shared trips yet.</EmptyNote> : (
              <div className="divide-y divide-line">
                {sharedTrips.map(t => {
                  const members = Math.max(0, (sharedMeta?.[t.sharedId]?.members?.length || 1) - 1);
                  return (
                    <button key={t.id} onClick={() => openTrip(t)} className="w-full flex items-center gap-3 py-3 text-left cursor-pointer">
                      <CoverImage trip={t} className="w-24 h-16 shrink-0" rounded="rounded-lg" overlay={false} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-semibold text-ink truncate">{t.name}</span>
                        <span className="text-[12px] text-ink-3 flex items-center gap-1"><Users className="w-3 h-3" />{members} companion{members === 1 ? '' : 's'}</span>
                        <span className="text-[12px] text-ink-3 flex items-center gap-1"><CalendarDays className="w-3 h-3" />{formatRange(t.startDate, t.daysCount)}</span>
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
