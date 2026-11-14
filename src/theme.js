// Shared visual vocabulary: category colours/icons, Google type → tag mapping,
// muted map style and SVG map pins.
import {
  Landmark, Utensils, Sparkles, BedDouble, Plane, TreePine, Coffee, Gem, Mountain,
  ShoppingBag, Waves, Flower2, Camera, Church, Building2, Train, MapPin
} from 'lucide-react';

export const COLORS = {
  cream: '#f8f4ec',
  paper: '#fffdf8',
  line: '#e6dfd0',
  ink: '#2d2924',
  ink2: '#5a544a',
  ink3: '#8a8375',
  sage: '#6f7f5c',
  sageDeep: '#55663f',
  sageSoft: '#e4e9d9',
  clay: '#d9823b',
  clayDeep: '#c3642a',
  claySoft: '#f7e3d1',
  sky: '#7c93a3'
};

// Saved-place categories are stored by name on each place; keep names stable.
export const CATEGORIES = {
  'Places to Visit': { label: 'Places to Visit', short: 'Culture', Icon: Landmark, color: COLORS.clay, soft: COLORS.claySoft, blurb: 'Temples, museums and landmarks worth the detour.' },
  'Food & Eats':     { label: 'Food & Eats',     short: 'Food',    Icon: Utensils, color: '#b9542e', soft: '#f6e0d4', blurb: 'Markets, cafés and meals to remember.' },
  'Experiences':     { label: 'Experiences',     short: 'Nature',  Icon: Sparkles, color: COLORS.sage, soft: COLORS.sageSoft, blurb: 'Walks, views and slow afternoons.' },
  'Stays/Hotel':     { label: 'Stays / Hotels',  short: 'Stays',   Icon: BedDouble, color: '#7c93a3', soft: '#e4ebe9', blurb: 'Where you rest between days.' },
  'Flights':         { label: 'Flights',         short: 'Flights', Icon: Plane, color: '#4f6d8a', soft: '#e1e8ee', blurb: 'Getting there and back.' }
};
export const CATEGORY_ORDER = ['Places to Visit', 'Food & Eats', 'Experiences', 'Stays/Hotel'];

export function categoryMeta(category) {
  return CATEGORIES[category] || { label: category || 'Saved', short: 'Saved', Icon: MapPin, color: COLORS.sage, soft: COLORS.sageSoft };
}

// Google Places "types" → short, friendly tags shown on cards.
const TYPE_TAGS = [
  [/park|garden|forest|hiking|nature|campground|botanical/, 'Nature', TreePine],
  [/beach|lake|river|bay|waterfall|coast|island/, 'Scenic', Waves],
  [/mountain|volcano|peak|viewpoint|observation/, 'Scenic', Mountain],
  [/temple|shrine|place_of_worship|church|mosque|synagogue/, 'Culture', Church],
  [/museum|art_gallery|historical|cultural|landmark|monument|castle/, 'Culture', Landmark],
  [/cafe|coffee|bakery|tea_house|dessert/, 'Cafe', Coffee],
  [/restaurant|food|meal|sushi|ramen|izakaya|bar|market/, 'Food', Utensils],
  [/lodging|hotel|ryokan|hostel|resort|onsen|spa/, 'Stay', BedDouble],
  [/shopping|store|mall|department/, 'Shopping', ShoppingBag],
  [/tourist_attraction|point_of_interest|amusement|zoo|aquarium/, 'Sightseeing', Camera],
  [/train|station|transit|airport/, 'Transit', Train],
  [/flower|cherry|blossom/, 'Seasonal', Flower2]
];

export function tagsForPlace(place, max = 2) {
  const found = [];
  const norm = l => l.toLowerCase().replace(/s$/, '');
  const push = (label, Icon) => { if (!found.some(f => norm(f.label) === norm(label))) found.push({ label, Icon }); };
  const types = Array.isArray(place?.types) ? place.types : [];
  for (const t of types) {
    for (const [re, label, Icon] of TYPE_TAGS) {
      if (re.test(t)) { push(label, Icon); break; }
    }
    if (found.length >= max) break;
  }
  if (found.length < max && place?.category) {
    const m = categoryMeta(place.category);
    push(m.short, m.Icon);
  }
  if (found.length < max && (place?.rating || 0) >= 4.6) push('Hidden Gem', Gem);
  return found.slice(0, max);
}

export function shortLocation(place) {
  if (!place) return '';
  const addr = place.area && place.area !== place.address ? place.area : (place.address || '');
  if (!addr) return '';
  // "1-2-3 Asakusa, Taito City, Tokyo, Japan" → "Taito City, Tokyo"
  const parts = addr.split(',').map(s => s.trim()).filter(Boolean);
  const cleaned = parts.filter(p => !/^\d{3}-?\d{4}$/.test(p) && !/^\d/.test(p));
  if (cleaned.length === 0) return parts[0] || '';
  if (cleaned.length >= 3) return `${cleaned[cleaned.length - 3]}, ${cleaned[cleaned.length - 2]}`;
  return cleaned.slice(0, 2).join(', ');
}

export function cityOf(place) {
  const s = shortLocation(place);
  return s.split(',').pop()?.trim() || s;
}

// Soft, muted map that sits inside the cream UI.
export const MAP_STYLE = [
  { elementType: 'geometry', stylers: [{ color: '#f1ead9' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6b6354' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#f8f4ec' }, { weight: 2 }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#d9d1bf' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#ebe4cf' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#f3ecdb' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#d6dec3' }, { visibility: 'on' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e6dfd0' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8375' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#f4dcc1' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#e8c7a4' }] },
  { featureType: 'road.arterial', elementType: 'labels', stylers: [{ visibility: 'simplified' }] },
  { featureType: 'road.local', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#ded5c1' }, { visibility: 'on' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#cfdad6' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#7c93a3' }] }
];

export const MAP_OPTIONS = {
  disableDefaultUI: true,
  zoomControl: false,
  clickableIcons: false,
  gestureHandling: 'greedy',
  styles: MAP_STYLE,
  backgroundColor: '#f1ead9'
};

// --- Pins -------------------------------------------------------------------
// Rounded teardrop pin with an icon glyph inside, matching the mockups.
const GLYPHS = {
  landmark: '<path d="M3 22h18M5 22V12m14 10V12M6 12h12M12 3 3 9h18L12 3zm-3 9v6m6-6v6"/>',
  utensils: '<path d="M3 2v7a3 3 0 0 0 6 0V2M6 2v20M20 2c-2 0-4 3-4 7v3h4v10"/>',
  sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3zM5 18l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z"/>',
  bed: '<path d="M2 20V9m0 5h20m0 6v-6a3 3 0 0 0-3-3H10v3M6 10h3a1 1 0 0 1 1 1v3"/>',
  plane: '<path d="M2 16l20-6-6 6 2 6-3 1-3-5-5 2-1-2 4-3-6-3z"/>',
  tree: '<path d="M12 2 5 12h4l-4 6h14l-4-6h4L12 2zm0 16v4"/>',
  coffee: '<path d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8zM6 2v2M10 2v2M14 2v2"/>',
  pin: '<circle cx="12" cy="10" r="3.5"/>',
  torii: '<path d="M3 5h18M5 5v15M19 5v15M4 9h16M2 5c3-2 17-2 20 0"/>',
  lotus: '<path d="M12 20c-5 0-9-3-9-7 3 0 5 1 6 3 0-4 1-7 3-10 2 3 3 6 3 10 1-2 3-3 6-3 0 4-4 7-9 7z"/>'
};

const PIN_GLYPH_BY_CATEGORY = {
  'Places to Visit': 'torii',
  'Food & Eats': 'utensils',
  'Experiences': 'tree',
  'Stays/Hotel': 'bed',
  'Flights': 'plane'
};

const pinCache = new Map();
export function makePin({ color = COLORS.clay, glyph = 'pin', size = 40, label = '' } = {}) {
  const key = `${color}|${glyph}|${size}|${label}`;
  if (pinCache.has(key)) return pinCache.get(key);
  const w = size, h = Math.round(size * 1.3);
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 40 52">
    <defs>
      <filter id="s" x="-25%" y="-25%" width="150%" height="150%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#514332" flood-opacity="0.28"/></filter>
      <linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity="0.86"/></linearGradient>
    </defs>
    <path filter="url(#s)" d="M20 49 C16 43 3.5 30 3.5 19 A16.5 16.5 0 0 1 36.5 19 C36.5 30 24 43 20 49 Z" fill="url(#g)" stroke="#fffdf8" stroke-width="2.4"/>
    <circle cx="20" cy="19.5" r="13.4" fill="none" stroke="#fffdf8" stroke-width="0.8" stroke-opacity="0.36"/>
    ${label
      ? `<text x="20" y="24.5" text-anchor="middle" font-family="Inter, sans-serif" font-size="14" font-weight="700" fill="#fffdf8">${label}</text>`
      : `<g transform="translate(10.1 9.3) scale(0.82)" fill="none" stroke="#fffdf8" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[glyph] || GLYPHS.pin}</g>`}
  </svg>`;
  const icon = {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    anchor: { x: w / 2, y: h - 2 },
    scaledSize: { width: w, height: h }
  };
  pinCache.set(key, icon);
  return icon;
}

export function pinForPlace(place, opts = {}) {
  const meta = categoryMeta(place?.category);
  return makePin({ color: meta.color, glyph: PIN_GLYPH_BY_CATEGORY[place?.category] || 'pin', ...opts });
}

export function pinForStop(stop, index) {
  if (stop?.isFlight) return makePin({ color: CATEGORIES.Flights.color, glyph: 'plane' });
  const kinds = (stop?.types || []).join(' ').toLowerCase();
  const cat = stop?.category;
  if (/restaurant|cafe|bakery|food|market|sushi|ramen/.test(kinds) || cat === 'Food & Eats') return makePin({ color: '#b9774c', glyph: 'utensils', size: 42 });
  if (/temple|shrine|place_of_worship/.test(kinds)) return makePin({ color: COLORS.clay, glyph: 'torii', size: 42 });
  if (/forest|park|garden|nature|mountain|lake|hiking/.test(kinds) || cat === 'Experiences') return makePin({ color: COLORS.sageDeep, glyph: 'tree', size: 42 });
  if (/hotel|lodging|ryokan/.test(kinds) || cat === 'Stays/Hotel') return STAY_PIN();
  return makePin({ color: COLORS.clay, glyph: 'landmark', size: 42 });
}

export const STAY_PIN = () => makePin({ color: CATEGORIES['Stays/Hotel'].color, glyph: 'bed', size: 44 });

// Deterministic gradient for places without photos.
const GRADIENTS = [
  ['#d7dfc7', '#9fb28a'], ['#f3d9c0', '#d9a06f'], ['#d9e3e0', '#8fa8a3'],
  ['#f1e2c6', '#cdb078'], ['#e4d7e6', '#a995ae'], ['#dfe6d1', '#8aa37a']
];
export function gradientFor(seed = '') {
  let h = 0;
  for (const ch of String(seed)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [a, b] = GRADIENTS[h % GRADIENTS.length];
  return `linear-gradient(135deg, ${a} 0%, ${b} 100%)`;
}

export const INTEREST_CHIPS = [
  { key: 'Nature', Icon: TreePine, category: 'Experiences' },
  { key: 'Culture', Icon: Landmark, category: 'Places to Visit' },
  { key: 'Food', Icon: Utensils, category: 'Food & Eats' },
  { key: 'Wellness', Icon: Flower2, category: 'Stays/Hotel' }
];

export { Building2 };
