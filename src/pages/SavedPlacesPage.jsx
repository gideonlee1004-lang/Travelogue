import React, { useMemo, useState } from 'react';
import {
  Search, SlidersHorizontal, Bookmark, Map as MapIcon, List, Plus, Users, ChevronRight, CalendarDays, Layers, Download,
  Sparkles, RefreshCw, Plane, MoreHorizontal, Leaf
} from 'lucide-react';
import { Hero, Card, Chip, SectionTitle, Btn, EmptyNote, IconBadge, WavesFooter } from '../components/Shell.jsx';
import { PlaceCard } from '../components/PlaceCard.jsx';
import { PlacePhoto } from '../components/PlacePhoto.jsx';
import { TripMap } from '../components/TripMap.jsx';
import { CATEGORIES, CATEGORY_ORDER, categoryMeta } from '../theme.js';

function CollectionRow({ category, places, active, onClick }) {
  const meta = categoryMeta(category);
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-3 p-2 rounded-xl text-left transition-colors cursor-pointer ${active ? 'bg-sage-soft' : 'hover:bg-cream-2'}`}>
      {places[0] ? (
        <PlacePhoto place={places[0]} className="w-14 h-14 shrink-0" rounded="rounded-lg" />
      ) : (
        <span className="w-14 h-14 rounded-lg shrink-0 flex items-center justify-center" style={{ background: meta.soft, color: meta.color }}><meta.Icon className="w-5 h-5" /></span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-ink truncate">{meta.label}</span>
        <span className="text-[12px] text-ink-3 flex items-center gap-1"><Bookmark className="w-3 h-3" />{places.length} place{places.length === 1 ? '' : 's'}</span>
      </span>
      <MoreHorizontal className="w-4 h-4 text-ink-3 shrink-0" />
    </button>
  );
}

export default function SavedPlacesPage(ctx) {
  const {
    activeTrip, trips, sharedMeta, isLoaded, loadError, navigate,
    filterCategory, setFilterCategory, searchQuery, setSearchQuery, filteredPlaces,
    recommendations, isRecLoading, recCategory, setRecCategory, fetchRecommendations,
    handleAddToDay, handleDeleteSavedPlace, handleAddRecommendedToSaved, openNewPlace, handleOpenShare, setActiveDay
  } = ctx;
  const [view, setView] = useState('map');
  const [highlightId, setHighlightId] = useState(null);

  const savedPlaces = activeTrip?.savedPlaces || [];
  const byCategory = useMemo(() => {
    const m = {};
    CATEGORY_ORDER.forEach(c => { m[c] = []; });
    savedPlaces.forEach(p => { (m[p.category] ||= []).push(p); });
    return m;
  }, [savedPlaces]);

  const collaborators = activeTrip?.sharedId ? Math.max(0, (sharedMeta?.[activeTrip.sharedId]?.members?.length || 1) - 1) : 0;
  const showingAll = filterCategory === 'ALL' && !searchQuery;
  const sections = showingAll
    ? CATEGORY_ORDER.filter(c => byCategory[c]?.length).map(c => ({ category: c, places: byCategory[c] }))
    : [{ category: filterCategory === 'ALL' ? null : filterCategory, places: filteredPlaces }];

  const exportPlaces = () => {
    if (!activeTrip) return;
    const rows = [['Name', 'Category', 'Address', 'Lat', 'Lng', 'Rating', 'Note']]
      .concat(savedPlaces.map(p => [p.name, p.category, p.address || p.area || '', p.lat ?? '', p.lng ?? '', p.rating ?? '', (p.note || '').replace(/\n/g, ' ')]));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${activeTrip.name.replace(/[^\w]+/g, '_')}_saved_places.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!activeTrip) {
    return (
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-6">
        <Hero eyebrow="Saved Places" title={<span className="tl-underline">Your Travel Library</span>} subtitle="Create a trip first and every place you save will land here." />
        <div className="mt-6"><EmptyNote action="Create a trip" onAction={() => ctx.openNewTrip()}>No trip yet.</EmptyNote></div>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-[250px_1fr] gap-6">
      {/* ---------- Sidebar ---------- */}
      <aside className="hidden lg:block space-y-4 lg:sticky lg:top-[80px] self-start">
        <Card className="p-4 pb-0 overflow-hidden bg-cream-2/70">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-serif text-[20px] text-ink">My Collections</h2>
            <button onClick={openNewPlace} className="w-8 h-8 rounded-full bg-paper border border-line flex items-center justify-center text-ink-2 hover:text-ink cursor-pointer" title="Add a place"><Plus className="w-4 h-4" /></button>
          </div>
          <div className="space-y-1">
            {CATEGORY_ORDER.map(c => (
              <CollectionRow key={c} category={c} places={byCategory[c] || []} active={filterCategory === c}
                onClick={() => { setFilterCategory(filterCategory === c ? 'ALL' : c); setSearchQuery(''); }} />
            ))}
          </div>

          <h3 className="font-serif text-[17px] text-ink mt-5 mb-2">Shared Collections</h3>
          <button onClick={handleOpenShare} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-cream-2 text-left cursor-pointer">
            <IconBadge icon={Users} tone="sage" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium text-ink">With Travel Buddies</span>
              <span className="text-[12px] text-ink-3 flex items-center gap-1"><Bookmark className="w-3 h-3" />{activeTrip.sharedId ? `${collaborators} collaborator${collaborators === 1 ? '' : 's'}` : 'Invite friends'}</span>
            </span>
            <ChevronRight className="w-4 h-4 text-ink-3" />
          </button>

          <button onClick={() => navigate('itinerary')} className="w-full mt-4 flex items-center gap-3 p-3 rounded-xl bg-sage-soft hover:bg-[#d8dfc9] text-left cursor-pointer">
            <Plane className="w-5 h-5 text-sage-deep shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] font-medium text-ink">Assign to Trip</span>
              <span className="text-[12px] text-ink-2">Turn your saved places into an itinerary.</span>
            </span>
            <ChevronRight className="w-4 h-4 text-ink-2" />
          </button>
          <WavesFooter className="mt-5 -mx-4" />
        </Card>
      </aside>

      {/* ---------- Main ---------- */}
      <main className="min-w-0 space-y-6">
        <Hero eyebrow="Saved Places" title={<span className="tl-underline">Your Travel Library</span>}
          subtitle="All the places you've saved, thoughtfully organized by collections, trips, and interests." compact />

        {/* Search + chips */}
        <div className="flex flex-col xl:flex-row gap-3 xl:items-center">
          <div className="flex gap-2 flex-1 max-w-[520px]">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-ink-3" />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search your saved places…" aria-label="Search your saved places"
                className="w-full h-11 pl-11 pr-4 rounded-full bg-paper border border-line text-[14px] text-ink placeholder:text-ink-3 focus:outline-none focus:border-sage" />
            </div>
            {/* the collections sidebar (and its add button) is hidden on phones */}
            <button onClick={openNewPlace} className="lg:hidden shrink-0 h-11 px-4 rounded-full bg-sage-deep text-white text-[13px] font-medium inline-flex items-center gap-1.5 cursor-pointer"><Plus className="w-4 h-4" />Add</button>
          </div>
          <div className="flex gap-2 tl-strip -mx-4 px-4 sm:mx-0 sm:px-0 pb-1">
            <Chip active={filterCategory === 'ALL'} icon={Bookmark} onClick={() => setFilterCategory('ALL')}>All Places</Chip>
            {CATEGORY_ORDER.map(c => {
              const m = CATEGORIES[c];
              return <Chip key={c} active={filterCategory === c} icon={m.Icon} onClick={() => setFilterCategory(c)}>{m.short === 'Culture' ? 'Culture' : m.label}</Chip>;
            })}
          </div>
        </div>

        {/* Map + quick actions */}
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-4">
          <Card className="overflow-hidden relative h-[260px] sm:h-[300px]">
            <div className="absolute top-3 left-3 z-10 flex rounded-full bg-paper/95 border border-line p-1 shadow-sm">
              <button onClick={() => setView('map')} className={`h-8 px-3 rounded-full text-[12px] flex items-center gap-1.5 cursor-pointer ${view === 'map' ? 'bg-sage-soft font-medium' : 'text-ink-2'}`}><MapIcon className="w-3.5 h-3.5" />Map</button>
              <button onClick={() => setView('list')} className={`h-8 px-3 rounded-full text-[12px] flex items-center gap-1.5 cursor-pointer ${view === 'list' ? 'bg-sage-soft font-medium' : 'text-ink-2'}`}><List className="w-3.5 h-3.5" />List</button>
            </div>
            {view === 'map' ? (
              <TripMap isLoaded={isLoaded} loadError={loadError} className="absolute inset-0"
                center={activeTrip.center ? { lat: activeTrip.center[0], lng: activeTrip.center[1] } : undefined}
                zoom={activeTrip.zoom || 11} places={filteredPlaces} fitKey={`saved_${activeTrip.id}_${filterCategory}`} highlightId={highlightId}
                onMarkerClick={p => setHighlightId(p.id)} />
            ) : (
              <div className="absolute inset-0 pt-14 p-3 overflow-y-auto space-y-1.5">
                {filteredPlaces.length === 0 && <p className="text-[13px] text-ink-3 px-2">No places match.</p>}
                {filteredPlaces.map(p => {
                  const m = categoryMeta(p.category);
                  return (
                    <button key={p.id} onMouseEnter={() => setHighlightId(p.id)} onClick={() => setHighlightId(p.id)}
                      className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-cream-2 text-left cursor-pointer">
                      <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: m.soft, color: m.color }}><m.Icon className="w-4 h-4" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium text-ink truncate">{p.name}</span>
                        <span className="block text-[11px] text-ink-3 truncate">{p.address || p.area}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Card>

          <Card className="p-4 relative overflow-hidden">
            <Leaf className="absolute -right-3 -top-3 w-20 h-20 text-sage/15" strokeWidth={1} />
            <h3 className="font-serif text-[20px] text-ink mb-3">Quick Actions</h3>
            <div className="space-y-1">
              {[
                { Icon: CalendarDays, title: 'Assign to a Trip', sub: 'Add saved places to an itinerary', onClick: () => navigate('itinerary') },
                { Icon: Layers, title: 'Create Collection', sub: 'Save a place under a theme', onClick: openNewPlace },
                { Icon: Download, title: 'Export Places', sub: 'Download as CSV or share with others', onClick: exportPlaces }
              ].map(a => (
                <button key={a.title} onClick={a.onClick} className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-cream-2 text-left cursor-pointer">
                  <IconBadge icon={a.Icon} tone="sage" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-ink">{a.title}</span>
                    <span className="block text-[12px] text-ink-3">{a.sub}</span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-ink-3" />
                </button>
              ))}
            </div>
          </Card>
        </div>

        {/* Collections */}
        {savedPlaces.length === 0 && (
          <EmptyNote action="Add your first place" onAction={openNewPlace}>Nothing saved for {activeTrip.name} yet. Save suggestions below or add a custom place.</EmptyNote>
        )}

        {sections.map(({ category, places }) => {
          const meta = category ? categoryMeta(category) : null;
          if (!places.length && showingAll) return null;
          return (
            <section key={category || 'results'}>
              <SectionTitle
                icon={meta?.Icon || Search}
                title={meta ? meta.label : 'Search results'}
                count={`${places.length} place${places.length === 1 ? '' : 's'}`}
                subtitle={meta ? meta.blurb : `Matching "${searchQuery}"`}
                action={showingAll ? 'View Collection' : 'Show all'}
                onAction={() => { setFilterCategory(showingAll ? category : 'ALL'); setSearchQuery(''); }}
              />
              {places.length === 0 ? (
                <EmptyNote>No places here yet.</EmptyNote>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  {(showingAll ? places.slice(0, 4) : places).map(p => (
                    <PlaceCard key={p.id} place={p} trip={activeTrip} onAddToDay={(pl, d) => { handleAddToDay(pl, d); setActiveDay(d); }}
                      onDelete={handleDeleteSavedPlace} highlight={highlightId === p.id} onClick={() => setHighlightId(p.id)} />
                  ))}
                </div>
              )}
            </section>
          );
        })}

        {/* Suggestions near the trip */}
        <section>
          <SectionTitle icon={Sparkles} title="Discover nearby" subtitle={`Top-rated spots for ${activeTrip.name}`}
            action={isRecLoading ? 'Refreshing…' : 'Refresh'} onAction={fetchRecommendations} />
          <div className="flex gap-2 tl-strip -mx-4 px-4 sm:mx-0 sm:px-0 pb-3">
            {CATEGORY_ORDER.map(c => <Chip key={c} active={recCategory === c} icon={CATEGORIES[c].Icon} onClick={() => setRecCategory(c)}>{CATEGORIES[c].label}</Chip>)}
          </div>
          {isRecLoading ? (
            <div className="rounded-2xl border border-dashed border-line-2 p-8 text-center text-[13px] text-ink-3 flex items-center justify-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" />Finding places…</div>
          ) : recommendations.length === 0 ? (
            <EmptyNote action="Try again" onAction={fetchRecommendations}>No suggestions right now. Try another category, or refresh in a moment.</EmptyNote>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
              {recommendations.map((rec, i) => {
                const already = savedPlaces.some(p => p.name.toLowerCase() === rec.name.toLowerCase());
                return <PlaceCard key={rec.googleId || i} place={rec} saved={already} onSave={handleAddRecommendedToSaved} />;
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
