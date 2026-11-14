import React, { useEffect, useMemo, useState } from 'react';
import { GoogleMap, MarkerF, PolylineF, InfoWindowF } from '@react-google-maps/api';
import { Home, Bookmark, CalendarDays, Plane, UserRound, Search, SlidersHorizontal, Leaf, Landmark, Utensils, Coffee, Mountain, Waves, Sparkles, ChevronRight, ChevronLeft, ArrowRight, Plus, MapPin, Map as MapIcon, List, Layers, Clock3, Route, BedDouble, Users, Check, CheckCircle2, Navigation, Minus, RefreshCw, Trash2, Pencil, ArrowUp, ArrowDown, ExternalLink, MoreHorizontal, Globe2, Heart, Settings, ShieldCheck, LogOut, Camera, CalendarCheck, Compass, Footprints, Car, Train, Sun, Image as ImageIcon, Wallet, StickyNote, Share2, BookOpen, ChevronDown } from 'lucide-react';

const ASSET = '/editorial/';
const FALLBACKS = ['bamboo', 'onsen', 'sushi', 'fuji-lake', 'cafe', 'temple', 'kyushu', 'setouchi'];
const ROOT = { width: '100%', height: '100%' };
const MOSS = '#657b55';

function formatDate(date) {
  if (!date) return 'Dates to be decided';
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function dateForDay(start, day) {
  if (!start) return `Day ${day}`;
  const [y,m,d] = start.split('-').map(Number);
  if (!y || !m || !d) return `Day ${day}`;
  return new Date(y,m-1,d+day-1).toLocaleDateString('en-US', { month:'short', day:'numeric', weekday:'short' });
}
function getPlaceArt(place, offset = 0) {
  const name = String(place?.name || '').toLowerCase();
  const types = (place?.types || []).join(' ').toLowerCase();
  if (/bamboo|forest|grove|park|trail|garden|hike/.test(name)) return 'bamboo';
  if (/onsen|hot spring|spa/.test(name)) return 'onsen';
  if (/sushi|restaurant|market|ramen|food|dining|izakaya/.test(name) || place?.category === 'Food & Eats') return 'sushi';
  if (/cafe|coffee|espresso|tea/.test(name) || /cafe/.test(types)) return 'cafe';
  if (/lake|mount|fuji|mountain|river|waterfall/.test(name)) return 'fuji-lake';
  if (/temple|shrine|pagoda|castle|historic/.test(name)) return 'kyoto';
  if (/hotel|stay|ryokan/.test(name) || place?.category === 'Stays/Hotel') return 'hotel';
  return FALLBACKS[Math.abs(offset) % FALLBACKS.length];
}
const photoCache = new Map();
function PlacePhoto({ place, index = 0, fallback, className = '', alt = '' }) {
  const id = place?.googleId || place?.placeId;
  const [photo, setPhoto] = useState(() => place?.photoUrl || (id && photoCache.get(id)) || '');
  useEffect(() => {
    let alive = true;
    if (place?.photoUrl) { setPhoto(place.photoUrl); return; }
    if (!id || !window.google?.maps?.places?.Place) { setPhoto(''); return; }
    if (photoCache.has(id)) { setPhoto(photoCache.get(id)); return; }
    // Place Photos uses Google's actual imagery when a Google Place ID exists.
    // Never invent or persist short-lived photo URLs; keep them in a session cache.
    try {
      const item = new window.google.maps.places.Place({ id });
      item.fetchFields({ fields: ['photos'] }).then(() => {
        const uri = item.photos?.[0]?.getURI?.({ maxWidth: 750 });
        if (uri && alive) { photoCache.set(id, uri); setPhoto(uri); }
      }).catch(() => {});
    } catch (_) { /* Decorative fallback below always remains available. */ }
    return () => { alive = false; };
  }, [id, place?.photoUrl]);
  return <img className={className} src={photo || `${ASSET}${fallback || getPlaceArt(place, index)}.webp`} alt={alt || place?.name || 'Travel scene'} loading="lazy" referrerPolicy="no-referrer" onError={event => {
    const local = `${ASSET}${fallback || getPlaceArt(place,index)}.webp`;
    if (!event.currentTarget.src.endsWith(local)) event.currentTarget.src = local;
  }} />;
}
const zenMapStyles = [
  { elementType:'geometry',stylers:[{color:'#f4f0e7'}] },
  { elementType:'labels.text.fill', stylers:[{color:'#6c7161'}] },
  { elementType:'labels.text.stroke', stylers:[{color:'#fcfaf5'}] },
  { featureType:'landscape.natural',elementType:'geometry',stylers:[{color:'#dbe2d2'}] },
  { featureType:'landscape.man_made',elementType:'geometry',stylers:[{color:'#f5f0e8'}] },
  { featureType:'poi.park',elementType:'geometry',stylers:[{color:'#cad9bf'}] },
  { featureType:'water',elementType:'geometry',stylers:[{color:'#cededb'}] },
  { featureType:'road',elementType:'geometry',stylers:[{color:'#fffdf7'}] },
  { featureType:'road',elementType:'geometry.stroke',stylers:[{color:'#e4dfd5'}] },
  { featureType:'road.highway',elementType:'geometry',stylers:[{color:'#e7e1cd'}] },
  { featureType:'transit',elementType:'labels.icon',stylers:[{visibility:'off'}] },
  { featureType:'poi.business',elementType:'labels',stylers:[{visibility:'off'}] }
];
const PIN_COLORS = { 'Food & Eats':'#bd835d','Places to Visit':'#657e5e','Experiences':'#85956f','Stays/Hotel':'#b09270','Flights':'#6b9398' };
function pinIcon(place, idx) {
  const fill = PIN_COLORS[place.category] || PIN_COLORS['Places to Visit'];
  const isFood = place.category === 'Food & Eats';
  const isStay = place.category === 'Stays/Hotel';
  const mark = isFood ? '✣' : isStay ? '⌂' : place.category === 'Experiences' ? '✧' : '✦';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="66" viewBox="0 0 56 66"><defs><filter id="s"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#28372d" flood-opacity=".2"/></filter></defs><path filter="url(#s)" d="M28 3C13.5 3 3 13.7 3 28c0 18 25 35 25 35S53 46 53 28C53 13.7 42.5 3 28 3Z" fill="${fill}" stroke="#fffdf7" stroke-width="3.5"/><circle cx="28" cy="27" r="15.3" fill="#f9f4e9" opacity=".96"/><text x="28" y="35" text-anchor="middle" fill="${fill}" font-family="Georgia,serif" font-size="23">${mark}</text></svg>`;
  return { url:'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg), scaledSize:{ width:38,height:45 },anchor:{x:19,y:44} };
}
function ZenMap({ places=[], center, isLoaded, loadError, className='', route=false, onPinClick, children, label='Interactive Google Map' }) {
  const [map,setMap] = useState(null);
  const [selected,setSelected] = useState(null);
  const placeList = useMemo(() => places.filter(p => Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) && p.lat !== null && p.lng !== null),[places]);
  const coordKey = placeList.map(p=>`${p.id}:${p.lat}:${p.lng}`).join('|');
  useEffect(() => {
    if (!map) return;
    if (placeList.length > 1 && window.google?.maps?.LatLngBounds) {
      const bounds = new window.google.maps.LatLngBounds();
      placeList.forEach(p => bounds.extend({lat:Number(p.lat),lng:Number(p.lng)}));
      map.fitBounds(bounds, { top:35,bottom:35,left:35,right:35 });
      if (map.getZoom() > 13) map.setZoom(13);
    } else if (placeList.length === 1) {
      map.panTo({ lat:Number(placeList[0].lat),lng:Number(placeList[0].lng) });
      map.setZoom(11);
    } else if (center) map.panTo({lat:Number(center[0]),lng:Number(center[1])});
  },[map,coordKey,center?.[0],center?.[1]]);
  const line = placeList.map(p => ({lat:Number(p.lat),lng:Number(p.lng)}));
  return <div className={`ma-map ${className}`} aria-label={label}>
    {!isLoaded ? <div className="ma-map-fallback" role="status"><img src={`${ASSET}mist-mountains.svg`} alt=""/><span>{loadError ? 'Map unavailable — explore your saved places below' : 'Preparing your map…'}</span></div> :
    <GoogleMap mapContainerStyle={ROOT} center={center ? {lat:Number(center[0]),lng:Number(center[1])}:{lat:35.6,lng:139.7}} zoom={10} onLoad={setMap} onUnmount={()=>setMap(null)} options={{disableDefaultUI:true,keyboardShortcuts:true,gestureHandling:'greedy',clickableIcons:false,styles:zenMapStyles}}>
      {route && line.length > 1 && <PolylineF path={line} options={{strokeColor:'#71845d',strokeOpacity:.78,strokeWeight:3, icons:[{icon:{path:'M 0,-1 0,1',strokeOpacity:1,strokeColor:'#eef1e4',scale:2},offset:'0',repeat:'12px'}]}} />}
      {placeList.map((p,i)=><MarkerF key={p.id || `mark-${i}`} position={{lat:Number(p.lat),lng:Number(p.lng)}} title={p.name || 'Place'} icon={pinIcon(p,i)} onClick={()=>setSelected(p)}/>)}
      {selected && <InfoWindowF position={{lat:Number(selected.lat),lng:Number(selected.lng)}} onCloseClick={()=>setSelected(null)}><div className="ma-map-info"><strong>{selected.name}</strong><span>{selected.address || selected.area || selected.category || ''}</span>{onPinClick && <button onClick={()=>{onPinClick(selected);setSelected(null);}}>View place <ArrowRight size={12}/></button>}</div></InfoWindowF>}
      {children}
    </GoogleMap>}
    {isLoaded && <div className="ma-map-controls"><button title="Zoom in" type="button" onClick={()=>map?.setZoom(Math.min(19,(map?.getZoom()||10)+1))}><Plus size={16}/></button><button title="Zoom out" type="button" onClick={()=>map?.setZoom(Math.max(2,(map?.getZoom()||10)-1))}><Minus size={16}/></button><button title="Recenter map" type="button" onClick={()=>{if(center)map?.panTo({lat:Number(center[0]),lng:Number(center[1])});}}><Navigation size={15}/></button></div>}
  </div>;
}
function SectionTitle({ eyebrow, title, action, children }) { return <div className="ma-section-heading"><div>{eyebrow && <p className="ma-eyebrow">{eyebrow}</p>}<h2>{title}</h2>{children}</div>{action}</div>; }
function RoundedButton({ children, onClick, secondary=false, className='' }) {return <button type="button" className={`ma-button ${secondary?'ma-button-soft':''} ${className}`} onClick={onClick}>{children}</button>}
const tagIcon = {'Places to Visit':Mountain,'Food & Eats':Utensils,Experiences:Sparkles,'Stays/Hotel':BedDouble,Flights:Plane};

export function OverviewStudio({trip,trips,flights,stays,stops,loaded,loadError,onGo,onAddPlace,onAddTrip,onShare,onSearchPlace,onOpenTrip,onSelectTrip}) {
  const saved = trip.savedPlaces||[];
  const plans = Object.values(trip.schedule||{}).filter(v=>v?.length).length;
  const progress=Math.round(((plans/(trip.daysCount||1))*.55+(stays.length? .2:0)+(flights.length ? .15 : 0)+(saved.length? .1:0))*100);
  const trackedStops=Object.values(trip.schedule||{}).flat().filter(s=>s.lat != null&&s.lng != null);
  return <main className="ma-shell ma-overview" aria-label="Overview">
    <aside className="ma-rail ma-overview-rail">
      <p className="ma-mini-heading">Current trip</p><h3>{trip.name}</h3><span className="ma-small-date"><CalendarDays size={14}/> {formatDate(trip.startDate)} · {trip.daysCount} days</span>
      <button className="ma-cover-button" onClick={()=>onGo('itinerary',1)} aria-label="Open current trip"><img src={`${ASSET}trip-cover.webp`} alt="Landscape travel cover"/></button>
      <div className="ma-progress-list"><button onClick={()=>onGo('flights')}><Plane size={17}/><span>Flights<small>{flights.length?`${flights.length} scheduled`:'Add your flights'}</small></span>{flights.length>0&&<CheckCircle2 size={16}/>}</button><button onClick={()=>onGo('itinerary',1)}><BedDouble size={17}/><span>Stays<small>{stays.length?`${stays.length} recorded`:'No stays yet'}</small></span>{stays.length>0&&<CheckCircle2 size={16}/>}</button><button onClick={()=>onGo('itinerary',1)}><MapIcon size={17}/><span>Activities<small>{stops.length} planned stops</small></span><ChevronRight size={16}/></button><button onClick={onShare}><Users size={17}/><span>Travel together<small>{trip.sharedId?'Shared itinerary':'Invite companions'}</small></span><ChevronRight size={16}/></button></div>
      <div className="ma-progress"><div><span>Trip readiness</span><strong>{Math.min(100,progress)}%</strong></div><div className="ma-progress-track"><i style={{width:`${Math.min(100,progress)}%`}}/></div></div>
      <RoundedButton onClick={()=>onGo('itinerary',1)} className="ma-block"><CalendarDays size={16}/> Open itinerary <ArrowRight size={15}/></RoundedButton>
      <button className="ma-switch-trip" onClick={onAddTrip}><Plus size={14}/> Start another trip</button>
    </aside>
    <div className="ma-main-column">
      <header className="ma-page-splash"><p className="ma-eyebrow">WELCOME TO TRAVELOGUE</p><h1>Plan, Explore,<br/>and Remember<span className="ma-underline"/></h1><p>A calmer way to plan your next journey.</p></header>
      <div className="ma-search-strip"><button className="ma-search-faux" onClick={()=>onSearchPlace?.()}><Search size={18}/><span>Where do you want to go?</span><SlidersHorizontal size={16}/></button><div className="ma-interest-tags"><button onClick={()=>onGo('places')}><Leaf size={15}/> Nature</button><button onClick={()=>onGo('places')}><Landmark size={15}/> Culture</button><button onClick={()=>onGo('places')}><Utensils size={15}/> Food</button><button onClick={()=>onGo('places')}><Waves size={15}/> Wellness</button></div></div>
      <div className="ma-feature-row"><section className="ma-next-trip ma-paper-card"><div className="ma-bamboo-leaf" aria-hidden="true"/><p className="ma-eyebrow">YOUR NEXT TRIP</p><button className="ma-trip-title" onClick={()=>onGo('itinerary',1)}><h2>{trip.name}</h2><span><ChevronRight size={19}/></span></button><p className="ma-mini-line"><CalendarDays size={15}/> {formatDate(trip.startDate)} &nbsp;·&nbsp; {trip.daysCount} day{trip.daysCount===1?'':'s'}</p><div className="ma-big-metrics"><button onClick={()=>onGo('places')}><MapPin size={20}/><strong>{saved.length}</strong><span>Places</span></button><button onClick={()=>onGo('itinerary',1)}><BedDouble size={20}/><strong>{stays.length}</strong><span>Stays</span></button><button onClick={()=>onGo('itinerary',1)}><MapIcon size={20}/><strong>{stops.length}</strong><span>Activities</span></button><button onClick={()=>onGo('flights')}><Plane size={20}/><strong>{flights.length}</strong><span>Flights</span></button></div></section>
      <ZenMap places={trackedStops.length?trackedStops:saved} center={trip.center} isLoaded={loaded} loadError={loadError} route={trackedStops.length>1} className="ma-overview-map" onPinClick={()=>onGo('itinerary',1)} label="Journey overview interactive Google map"/></div>
      <SectionTitle title="Saved Trip Highlights" action={<button className="ma-text-link" onClick={()=>onGo('places')}>View all ({saved.length}) <ArrowRight size={15}/></button>}/>
      {saved.length ? <div className="ma-gallery-row">{saved.slice(0,4).map((p,i)=><button className="ma-highlight-card" key={p.id||i} onClick={()=>onSearchPlace(p.name)}><div className="ma-card-photo"><PlacePhoto place={p} index={i}/><span className="ma-photo-badge"><Bookmark size={15} fill="currentColor"/></span></div><strong>{p.name}</strong><small><MapPin size={12}/>{p.area||p.address||p.category}</small></button>)}</div> : <div className="ma-empty-gallery"><Bookmark size={26}/><div><strong>Beautiful places belong here.</strong><p>Start gathering the spots you want to remember.</p></div><RoundedButton secondary onClick={onAddPlace}><Plus size={14}/> Save a place</RoundedButton></div>}
      <section className="ma-discovery-row"><div><h2>Discover<br/>Your Next Getaway</h2><span className="ma-drawn-line"/><p>Fresh ideas for beautiful, meaningful travels.</p></div>{[['kyushu','Nature · Local life'],['setouchi','Art · Sea · Slow travel'],['kyoto','Culture · Old streets']].map(([img,subtitle])=><button key={img} className="ma-discovery-card" onClick={()=>onGo('places')}><img src={`${ASSET}${img}.webp`} alt="Travel inspiration"/><span><strong>{img==='kyushu'?'Nature Retreat':img==='setouchi'?'Coastal Escapes':'Culture & Places'}</strong><small>{subtitle}</small></span><i><ArrowRight size={17}/></i></button>)}</section>
    </div>
  </main>;
}

export function SavedPlacesStudio({trip,loaded,loadError,filteredPlaces,filterCategory,onFilter,searchQuery,onSearch,placeDisplay,onDisplay,onAddPlace,onPlanPlace,onRemovePlace,recommendations,onSaveRecommendation,onRefreshRecommendations,isRecLoading,onOpenTools,onGo,onCreateCollection,onAssignCollection}) {
  const cats=[['ALL','All Places',Bookmark],['Places to Visit','Places to Visit',Mountain],['Food & Eats','Food & Cafés',Coffee],['Experiences','Experiences',Sparkles],['Stays/Hotel','Stays',BedDouble],['Flights','Airports',Plane]];
  const counts = Object.fromEntries(cats.slice(1).map(([id])=>[id,(trip.savedPlaces||[]).filter(p=>p.category===id).length]));
  const [mapSelection,setMapSelection] = useState(null);
  const [newCollectionOpen,setNewCollectionOpen] = useState(false);
  const [collectionDraft,setCollectionDraft] = useState('');
  const [selectedCollection,setSelectedCollection] = useState(null);
  const collection = (trip.collections||[]).find(item=>item.id===selectedCollection);
  const visiblePlaces = selectedCollection ? filteredPlaces.filter(place=>(place.collectionIds||[]).includes(selectedCollection)) : filteredPlaces;
  const chooseCategory = category => { setSelectedCollection(null); onFilter(category); };
  const createCollection = event => {event.preventDefault();if(collectionDraft.trim()){onCreateCollection(collectionDraft.trim());setCollectionDraft('');setNewCollectionOpen(false);}};
  return <main className="ma-shell ma-library" aria-label="Saved places">
    <aside className="ma-rail ma-library-rail"><div className="ma-rail-title"><h3>My Collections</h3><button onClick={()=>setNewCollectionOpen(v=>!v)} title="Create collection"><Plus size={17}/></button></div>
      {newCollectionOpen && <form className="ma-create-collection" onSubmit={createCollection}><input autoFocus maxLength={50} placeholder="Collection name" value={collectionDraft} onChange={e=>setCollectionDraft(e.target.value)}/><button type="submit">Create</button></form>}
      {(trip.collections||[]).map(collection=><button className={`ma-collection-row ${selectedCollection===collection.id?'is-selected':''}`} key={collection.id} onClick={()=>{setSelectedCollection(collection.id);onFilter('ALL')}}><span className="ma-collection-icon"><Bookmark size={20}/></span><span><strong>{collection.name}</strong><small>{(trip.savedPlaces||[]).filter(p=>(p.collectionIds||[]).includes(collection.id)).length} places</small></span><ChevronRight size={14}/></button>)}
      <button className={filterCategory==='ALL'?'ma-collection-row is-selected':'ma-collection-row'} onClick={()=>chooseCategory('ALL')}><img src={`${ASSET}trip-cover.webp`} alt=""/><span><strong>{trip.name}</strong><small>{(trip.savedPlaces||[]).length} places</small></span><MoreHorizontal size={14}/></button>
      {cats.slice(1).filter(([id])=>counts[id]>0 || ['Places to Visit','Food & Eats','Experiences'].includes(id)).map(([id,name,Icon],i)=><button key={id} className={`ma-collection-row ${filterCategory===id?'is-selected':''}`} onClick={()=>chooseCategory(id)}><img src={`${ASSET}${['bamboo','cafe','onsen','hotel','fuji-lake'][i]}.webp`} alt=""/><span><strong>{name}</strong><small>{counts[id]} place{counts[id]===1?'':'s'}</small></span><ChevronRight size={14}/></button>)}
      <div className="ma-rail-divider"/><h4>Shared journey</h4><button className="ma-collection-row ma-shared-row" onClick={()=>onGo('profile')}><span className="ma-collection-icon"><Users size={21}/></span><span><strong>Travel together</strong><small>Explore your shared trips</small></span><ChevronRight size={16}/></button><button className="ma-rail-cta" onClick={()=>onGo('itinerary',1)}><Plane size={21}/><span><strong>Assign to trip</strong><small>Turn saved places into plans</small></span><ChevronRight size={15}/></button>
    </aside><div className="ma-main-column">
      <header className="ma-page-splash ma-saved-splash"><p className="ma-eyebrow">SAVED PLACES</p><h1>Your Travel Library<span className="ma-underline"/></h1><p>All the places you've saved, thoughtfully arranged for your journey.</p></header>
      <div className="ma-library-bar"><label className="ma-library-search"><Search size={18}/><input type="search" placeholder="Search your saved places…" value={searchQuery} onChange={e=>onSearch(e.target.value)} aria-label="Search saved places"/><SlidersHorizontal size={15}/></label><div className="ma-chips">{cats.map(([id,label,Icon])=><button key={id} aria-pressed={filterCategory===id} className={filterCategory===id?'is-active':''} onClick={()=>chooseCategory(id)}><Icon size={14}/>{label}</button>)}</div></div>
      <div className="ma-library-top"><div className="ma-map-stage"><div className="ma-map-switch"><button className={placeDisplay==='map'?'is-active':''} aria-pressed={placeDisplay==='map'} onClick={()=>onDisplay('map')}><MapIcon size={15}/> Map</button><button className={placeDisplay==='list'?'is-active':''} aria-pressed={placeDisplay==='list'} onClick={()=>onDisplay('list')}><List size={15}/> List</button></div>{placeDisplay==='map' ? <ZenMap places={visiblePlaces} center={trip.center} isLoaded={loaded} loadError={loadError} onPinClick={setMapSelection} label="Your saved places on Google Maps"/> : <div className="ma-list-preview">{visiblePlaces.length ? visiblePlaces.slice(0,5).map((p,i)=><button key={p.id||i} onClick={()=>setMapSelection(p)}><span>{String(i+1).padStart(2,'0')}</span><strong>{p.name}</strong><small>{p.area||p.category}</small><ChevronRight size={15}/></button>):<p>There aren't any saved places in this collection yet.</p>}</div>}</div><aside className="ma-quick-actions ma-paper-card"><h3>Quick Actions</h3><button onClick={()=>onGo('itinerary',1)}><span><CalendarDays size={18}/></span><span><strong>Assign to a trip</strong><small>Add saved places to your days</small></span><ChevronRight size={16}/></button><button onClick={onAddPlace}><span><Bookmark size={18}/></span><span><strong>Save a new place</strong><small>Find it with Google Places</small></span><ChevronRight size={16}/></button><button onClick={onOpenTools}><span><Layers size={18}/></span><span><strong>Explore nearby</strong><small>Google Places recommendations</small></span><ChevronRight size={16}/></button>{mapSelection && <div className="ma-inline-detail"><strong>{mapSelection.name}</strong><small>{mapSelection.address||mapSelection.area}</small><button onClick={()=>setMapSelection(null)}>Close</button></div>}</aside></div>
      <SectionTitle eyebrow="YOUR COLLECTION" title={collection?.name || (filterCategory==='ALL'?trip.name:cats.find(([id])=>id===filterCategory)?.[1]||'Saved places')} action={<span className="ma-count-pill">{visiblePlaces.length} places</span>}><p className="ma-section-sub">Places to revisit, experience and remember.</p></SectionTitle>
      {visiblePlaces.length ? <div className="ma-place-grid">{visiblePlaces.map((p,i)=>{const Icon=tagIcon[p.category]||MapPin;return <article key={p.id||i} className="ma-place-card"><div className="ma-place-cover"><PlacePhoto place={p} index={i}/><span className="ma-photo-badge"><Bookmark size={15} fill="currentColor"/></span></div><div className="ma-place-copy"><h3>{p.name}</h3><p className="ma-place-area"><MapPin size={12}/>{p.area||p.address||'Saved location'}</p><p className="ma-place-note">{p.note||'A place to keep on your travel list.'}</p><div className="ma-place-tags"><span><Icon size={12}/>{p.category}</span>{p.rating&&<span>★ {p.rating}</span>}</div>{(trip.collections||[]).length>0 && <label className="ma-collection-assign"><Layers size={12}/><select aria-label={`Put ${p.name} in a collection`} value={p.collectionIds?.[0]||''} onChange={e=>onAssignCollection(p.id,e.target.value)}><option value="">Unsorted places</option>{(trip.collections||[]).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}<div className="ma-place-foot"><label><CalendarDays size={14}/><select defaultValue="" aria-label={`Add ${p.name} to itinerary`} onChange={e=>{if(e.target.value)onPlanPlace(p,Number(e.target.value));e.target.value='';}}><option value="" disabled>Add to itinerary</option>{Array.from({length:trip.daysCount},(_,j)=><option value={j+1} key={j}>Day {j+1} · {dateForDay(trip.startDate,j+1)}</option>)}</select></label><button className="ma-delete-place" onClick={()=>onRemovePlace(p.id)} title={`Unsave ${p.name}`}><Trash2 size={16}/></button></div></div></article>})}</div> : <div className="ma-empty-library"><Bookmark size={32}/><h3>No places here yet</h3><p>Collect little discoveries from anywhere in the world.</p><RoundedButton onClick={onAddPlace}><Plus size={16}/> Save a place</RoundedButton></div>}
      <section className="ma-find-section"><SectionTitle eyebrow="DISCOVER" title="A few more places to explore" action={<button className="ma-text-link" onClick={onRefreshRecommendations}><RefreshCw size={14}/> {isRecLoading?'Finding places…':'Refresh with Google'}</button>}/><div className="ma-recommend-row">{recommendations?.length ? recommendations.slice(0,4).map((p,i)=><div className="ma-recommend-card" key={p.googleId||i}><PlacePhoto place={p} index={i+4}/><div><strong>{p.name}</strong><small>{p.address||p.area}</small></div><button onClick={()=>onSaveRecommendation(p)} title={`Save ${p.name}`}><Plus size={17}/></button></div>) : <p className="ma-fine-note">{isRecLoading?'Asking Google Places for recommendations…':'Use “Explore nearby” to search more places with Google.'}</p>}</div></section>
    </div>
  </main>;
}

export function ItineraryStudio({trip,selectedDay,onDayChange,onAddDay,onAddStop,onAddFlight,onOpenStay,onRemoveStop,onMoveStop,onEditStop,onOpenMaps,onOpenDates,onGo,onOpenTools,onSaveNotes,onAddExpense,onRemoveExpense,onBudgetCurrency,loaded,loadError}) {
  const [view,setView] = useState('plan');
  const [expenseLabel,setExpenseLabel] = useState('');
  const [expenseAmount,setExpenseAmount] = useState('');
  const [notes,setNotes] = useState(trip.notes||'');
  useEffect(()=>setNotes(trip.notes||''),[trip.id,trip.notes]);
  const day = selectedDay || 1;
  const dayStops = useMemo(()=>[...(trip.schedule?.[day]||[])].sort((a,b)=>String(a.time||'').localeCompare(String(b.time||''))),[trip.schedule,day]);
  const dayStay=trip.staysByDay?.[day];
  const coords=dayStops.filter(s=>!s.isFlight && s.lat!=null && s.lng!=null).concat(dayStay?.lat!=null&&dayStay?.lng!=null?[{...dayStay,id:`stay${day}`,category:'Stays/Hotel'}]:[]);
  const planAll=Object.values(trip.schedule||{}).flat();
  const nonflight=dayStops.filter(s=>!s.isFlight);
  const otherView=view==='route' || view==='stays';
  return <main className="ma-itinerary-shell" aria-label="Itinerary">
    <div className="ma-trip-banner"><img src={`${ASSET}trip-cover.webp`} alt="Travel landscape"/><div><p className="ma-eyebrow">MY TRIP ITINERARY</p><h1>{trip.name}</h1><p><CalendarDays size={15}/>{formatDate(trip.startDate)} <span>·</span> {trip.daysCount} days <span>·</span><MapPin size={14}/> {trip.japaneseSub||'Your journey'}</p></div><button onClick={onOpenDates} className="ma-banner-edit"><Pencil size={15}/> Edit dates</button></div>
    <div className="ma-plan-nav"><nav>{[['plan','Plan',List],['route','Route',Route],['stays','Stays',BedDouble],['budget','Budget',Wallet],['notes','Notes',StickyNote]].map(([id,label,Icon])=><button key={id} onClick={()=>setView(id)} aria-pressed={view===id} className={view===id?'is-active':''}><Icon size={16}/>{label}</button>)}</nav><div><button onClick={onOpenTools} className="ma-outline-quiet"><Settings size={15}/> Advanced tools</button><RoundedButton onClick={onAddDay}><Plus size={16}/> Add day</RoundedButton></div></div>
    <div className="ma-planner-grid"><aside className="ma-days-rail ma-paper-card"><h3>Trip Plan <small>({trip.daysCount} Days)</small></h3><div>{Array.from({length:trip.daysCount},(_,i)=>{const n=i+1;const stops=trip.schedule?.[n]||[];return <button className={day===n?'is-active':''} key={n} onClick={()=>{onDayChange(n);setView('plan')}}><span className="ma-day-number">Day {n}</span><span className="ma-day-desc"><small>{dateForDay(trip.startDate,n)}</small><strong>{stops.find(s=>!s.isFlight)?.name || (stops.length?'Travel day':'A day of possibilities')}</strong></span><ChevronRight size={16}/></button>})}<button className="ma-day-add" onClick={onAddDay}><Plus size={16}/> Add another day</button></div></aside>
      <section className="ma-timeline-panel ma-paper-card"><div className="ma-day-heading"><div><span className="ma-day-label">Day {day}</span><h2>{view==='notes'?'Trip Notes':view==='budget'?'Trip Budget':view==='stays'?'Where You’ll Stay':view==='route'?'The Route':(nonflight[0]?.name || 'Your Day, Your Way')}</h2><p>{dateForDay(trip.startDate,day)} <span>·</span> {dayStops.length} planned item{dayStops.length!==1?'s':''}</p></div><div className="ma-day-arrows"><button onClick={()=>onDayChange(Math.max(1,day-1))} disabled={day===1}><ChevronLeft size={17}/></button><button onClick={()=>onDayChange(Math.min(trip.daysCount,day+1))} disabled={day===trip.daysCount}><ChevronRight size={17}/></button></div></div>
      {view==='budget' ? <div className="ma-budget-pane"><div className="ma-budget-head"><div><p className="ma-eyebrow">YOUR TRAVEL FUND</p><h3>Plan what matters.</h3><p>Keep a simple estimate of your trip expenses.</p></div><label>Currency <select value={trip.budgetCurrency||'SGD'} onChange={e=>onBudgetCurrency(e.target.value)}>{['SGD','USD','JPY','EUR','GBP','AUD','TWD','KRW','THB'].map(code=><option key={code} value={code}>{code}</option>)}</select></label></div><div className="ma-budget-total"><span>Estimated trip expenses</span><strong>{(trip.budgetCurrency||'SGD')} {(trip.expenses||[]).reduce((total,item)=>total+Number(item.amount||0),0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</strong></div><h4>Your expense list</h4>{(trip.expenses||[]).length?<div className="ma-budget-list">{trip.expenses.map(exp=><div key={exp.id}><span><strong>{exp.label}</strong><small>{formatDate(trip.startDate)}</small></span><b>{Number(exp.amount).toLocaleString('en-US',{minimumFractionDigits:2})}</b><button onClick={()=>onRemoveExpense(exp.id)} title={`Remove ${exp.label}`}><Trash2 size={15}/></button></div>)}</div>:<p className="ma-empty-copy">Nothing estimated yet. Add flights, stays or activities to your budget.</p>}<form className="ma-budget-form" onSubmit={e=>{e.preventDefault();const amount=Number(expenseAmount);if(expenseLabel.trim()&&Number.isFinite(amount)&&amount>0&&amount<1e9){onAddExpense(expenseLabel.trim(),amount);setExpenseAmount('');setExpenseLabel('');}}}><input value={expenseLabel} maxLength={90} onChange={e=>setExpenseLabel(e.target.value)} placeholder="Expense, e.g. accommodation" required/><input value={expenseAmount} type="number" min="0.01" step="0.01" max="999999999" onChange={e=>setExpenseAmount(e.target.value)} placeholder="Amount" required/><button type="submit"><Plus size={15}/> Add</button></form><p className="ma-fine-note">Changing currency changes the display label only. No foreign-exchange conversion is applied.</p></div> : view==='notes' ? <div className="ma-notes-pane"><h3>Notes for your trip</h3><p>Keep ideas, addresses and other moments worth remembering.</p><textarea value={notes} onChange={e=>setNotes(e.target.value)} onBlur={()=>onSaveNotes?.(notes)} placeholder="A few things worth remembering…" aria-label="Draft trip notes"/><small>Notes save to your trip when you leave this field.</small></div> : view==='stays' ? <div className="ma-stay-focus">{dayStay ? <><PlacePhoto place={{...dayStay,category:'Stays/Hotel'}} fallback="hotel"/><h3>{dayStay.name}</h3><p>{dayStay.address||'Accommodation for this day'}</p><RoundedButton secondary onClick={onOpenStay}><Pencil size={15}/> Edit stay</RoundedButton></> : <><BedDouble size={34}/><h3>Your night, your choice.</h3><p>No accommodation pinned for this day.</p><RoundedButton onClick={onOpenStay}><Plus size={16}/> Add accommodation</RoundedButton></>}</div> : <div className="ma-activity-list">{dayStops.length ? dayStops.map((stop,index)=>{const raw=(trip.schedule?.[day]||[]);const originalIndex=raw.findIndex(s=>s.id===stop.id);const Icon=stop.isFlight?Plane:stop.category==='Food & Eats'?Utensils:MapPin;return <div className="ma-activity-line" key={stop.id||index}><time>{stop.time||'—'}</time><span className="ma-timeline-dot"/><article className={`ma-activity-card ${stop.isFlight?'ma-flight-activity':''}`}><PlacePhoto place={stop} index={index} fallback={stop.isFlight?'setouchi':undefined}/><div><h3>{stop.name||stop.flightNumber||'Travel stop'}</h3><p><Icon size={13}/>{stop.isFlight?'Flight':stop.category||'Experience'}{stop.address && <span>· {stop.address}</span>}</p>{stop.note && <small>{stop.note}</small>}</div><div className="ma-card-controls"><button onClick={()=>stop.isFlight?onGo('flights'):onOpenMaps(stop)} title={stop.isFlight?"Open flight details":"Open in Google Maps"}><ExternalLink size={15}/></button><button onClick={()=>stop.isFlight?onGo('flights'):onEditStop(stop)} title={stop.isFlight?"Flight details":"Edit stop"}><Pencil size={14}/></button><button disabled={index<1 || stop.isFlight || dayStops[index-1]?.isFlight} onClick={()=>onMoveStop(day,stop.id,-1)} title="Move up"><ArrowUp size={14}/></button><button disabled={index>=dayStops.length-1 || stop.isFlight || dayStops[index+1]?.isFlight} onClick={()=>onMoveStop(day,stop.id,1)} title="Move down"><ArrowDown size={14}/></button><button onClick={()=>onRemoveStop(day,originalIndex)} title="Remove stop"><Trash2 size={14}/></button></div></article>{index<dayStops.length-1&&<div className="ma-transport-quiet"><Footprints size={14}/> Travel to next stop <span>See route on the map</span></div>}</div>}) : <div className="ma-empty-day"><Sun size={34}/><h3>A beautifully open day.</h3><p>Add a stop, food spot, or something to discover.</p></div>}
      {dayStay && view==='plan' && <div className="ma-stay-in-timeline"><BedDouble size={19}/><span><strong>{dayStay.name}</strong><small>Accommodation · {dayStay.address||'Stay pinned to this day'}</small></span><button onClick={onOpenStay}>Edit <ChevronRight size={14}/></button></div>}
      <div className="ma-timeline-actions"><RoundedButton onClick={onAddStop}><Plus size={16}/> Add stop</RoundedButton><RoundedButton secondary onClick={onAddFlight}><Plane size={16}/> Add flight</RoundedButton><button className="ma-text-link" onClick={onOpenStay}><BedDouble size={15}/> {dayStay?'Edit stay':'Add stay'}</button></div></div>}
      </section>
      <aside className="ma-route-column"><section className="ma-route-panel ma-paper-card"><div className="ma-route-heading"><h3>Day {day} Route</h3><button onClick={()=>setView('route')} title="View route"><Route size={16}/></button></div><ZenMap places={coords} center={trip.center} route={true} isLoaded={loaded} loadError={loadError} className="ma-route-map" label={`Google map with planned stops for day ${day} (straight-line connectors)`}/><h4>Route Flow</h4><div className="ma-flow-row">{coords.length?coords.slice(0,7).map((p,i)=><React.Fragment key={p.id||i}><div><span>{React.createElement(tagIcon[p.category]||MapPin,{size:17})}</span><small>{p.name||'Stop'}</small></div>{i<Math.min(coords.length,7)-1&&<ChevronRight size={14}/>}</React.Fragment>):<p>No route yet. Add stops to see your journey on the map.</p>}</div></section>
        <section className="ma-stay-panel ma-paper-card"><h3>Stay Tonight</h3>{dayStay ? <div className="ma-current-stay"><PlacePhoto place={dayStay} fallback="hotel"/><span><strong>{dayStay.name}</strong><small><MapPin size={12}/>{dayStay.address||'Accommodation'}</small><button onClick={onOpenStay}>View details <ChevronRight size={12}/></button></span></div> : <div className="ma-stay-empty"><BedDouble size={22}/><p>Nothing pinned for tonight.</p><button onClick={onOpenStay}>Choose a stay <ArrowRight size={14}/></button></div>}</section>
        <section className="ma-glance-panel ma-paper-card"><h3>Day {day} At a Glance</h3><div><span><MapPin size={19}/><strong>{nonflight.length}</strong><small>Stops</small></span><span><Plane size={19}/><strong>{dayStops.filter(p=>p.isFlight).length}</strong><small>Flights</small></span><span><BedDouble size={19}/><strong>{dayStay?1:0}</strong><small>Stays</small></span></div></section></aside></div>
  </main>;
}

export function ProfileStudio({user,profile,trips,allSavedCount,totalFlightCount,onEdit,onNewTrip,onChooseTrip,onLogout,notice}) {
  const sharedCount=trips.filter(t=>t.sharedId).length;
  const initials=(user.name||'T').trim().split(/\s+/).slice(0,2).map(p=>p[0]).join('').toUpperCase();
  const gallery=['temple','bamboo','onsen','garden','town','deer'];
  return <main className="ma-profile-page" aria-label="Travel profile"><header className="ma-profile-hero"><div className="ma-profile-portrait">{profile.avatarUrl?<img src={profile.avatarUrl} alt="Your profile" referrerPolicy="no-referrer" onError={e=>{e.currentTarget.style.display='none'}}/>:<span>{initials}</span>}<button onClick={onEdit} title="Edit profile photo"><Camera size={17}/></button></div><div className="ma-profile-identity"><p className="ma-eyebrow">THE PERSON BEHIND THE JOURNEY</p><h1>{user.name}</h1><p className="ma-profile-handle">{user.email}</p><p>{profile.bio||'Traveller, planner and collector of meaningful journeys.'}</p><div className="ma-profile-interests"><span><Leaf size={14}/>{profile.travelStyle||'Slow travel'}</span><span><MapPin size={14}/>{profile.homeBase||'Your home base'}</span><span><Heart size={14}/>{profile.interests||'Places · Food · Nature'}</span></div></div><button className="ma-edit-profile" onClick={onEdit}><Pencil size={15}/> Edit profile</button><div className="ma-profile-metrics">{[[trips.length,'Trips',Wallet],[trips.filter(t=>t.startDate).length,'Dated plans',Globe2],[allSavedCount,'Saved places',Bookmark],[sharedCount,'Shared trips',Users]].map(([value,label,Icon])=><div key={label}><Icon size={20}/><strong>{value}</strong><small>{label}</small></div>)}</div></header>
    {notice && <p role="status" className="ma-profile-notice">{notice}</p>}
    <div className="ma-profile-body"><aside className="ma-profile-menu ma-paper-card"><button className="is-active" onClick={onEdit}><UserRound size={18}/> My profile</button><button onClick={onEdit}><Settings size={18}/> Account settings <ChevronRight size={15}/></button><button onClick={onEdit}><Heart size={18}/> Travel preferences <ChevronRight size={15}/></button><button onClick={onEdit}><ShieldCheck size={18}/> Personal details <ChevronRight size={15}/></button><button onClick={onLogout}><LogOut size={18}/> Sign out <ChevronRight size={15}/></button><div className="ma-wave-ornament" aria-hidden="true"/></aside>
      <div className="ma-profile-center"><section className="ma-profile-panel ma-paper-card"><SectionTitle title="Upcoming & Past Trips" action={<button onClick={onNewTrip} className="ma-text-link"><Plus size={14}/> New trip</button>}/>{trips.length?<div className="ma-profile-trips">{trips.slice(0,5).map((trip,i)=><button key={trip.id} className={i===0?'ma-profile-trip-large':'ma-profile-trip-small'} onClick={()=>onChooseTrip(trip)}><img src={`${ASSET}${['trip-cover','kyushu','setouchi','kyoto','fuji-lake'][i%5]}.webp`} alt=""/><span><small>{i===0?'YOUR NEXT CHAPTER':'YOUR JOURNEY'}</small><strong>{trip.name}</strong><em><CalendarDays size={13}/>{formatDate(trip.startDate)} · {trip.daysCount} days</em></span><ChevronRight size={18}/></button>)}</div>:<p className="ma-empty-copy">Your next adventure begins with your first trip.</p>}</section>
        <section className="ma-profile-panel ma-memory-panel ma-paper-card"><SectionTitle title="Travel Memories" action={<button className="ma-text-link" onClick={onNewTrip}>Create new memories <ArrowRight size={14}/></button>}><p className="ma-section-sub">Little moments worth keeping.</p></SectionTitle><div className="ma-memory-grid">{gallery.map((p,i)=><img key={p} src={`${ASSET}${p}.webp`} alt={`Travel-inspired memory illustration ${i+1}`}/>)}</div><p className="ma-memory-hint">Visual inspiration from the Travelogue design collection. Your saved places and real itineraries are kept separately.</p></section>
      </div><aside className="ma-profile-right"><section className="ma-profile-panel ma-paper-card"><SectionTitle title="Travel Preferences" action={<button className="ma-text-link" onClick={onEdit}>Edit <ArrowRight size={13}/></button>}/><div className="ma-preferences-grid"><div><BedDouble size={20}/><strong>Travel style</strong><small>{profile.travelStyle||'Thoughtful journeys'}</small></div><div><Footprints size={20}/><strong>Pace</strong><small>At your own rhythm</small></div><div><Users size={20}/><strong>Companions</strong><small>Solo & shared trips</small></div><div><Leaf size={20}/><strong>Interests</strong><small>{profile.interests||'Local life, food, nature'}</small></div><div><Mountain size={20}/><strong>Home base</strong><small>{profile.homeBase||'Not specified'}</small></div><div><Plane size={20}/><strong>Air travel</strong><small>{totalFlightCount} recorded flights</small></div></div></section>
        <section className="ma-profile-panel ma-profile-settings ma-paper-card"><button onClick={onEdit}><Settings size={25}/><span><strong>Account settings</strong><small>Manage your public profile and preferences.</small></span><ChevronRight size={19}/></button></section>
        <section className="ma-profile-panel ma-paper-card"><SectionTitle title="Shared Trips"/><div className="ma-shared-trips">{trips.filter(t=>t.sharedId).length?trips.filter(t=>t.sharedId).slice(0,4).map((t,i)=><button onClick={()=>onChooseTrip(t)} key={t.id}><img src={`${ASSET}${['setouchi','kyoto','bamboo','fuji-lake'][i%4]}.webp`} alt=""/><span><strong>{t.name}</strong><small><Users size={12}/> Shared journey</small></span><ChevronRight size={14}/></button>):<p>No shared journeys yet. Invite someone from your trip overview.</p>}</div></section>
      </aside></div></main>;
}
