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
// A round-headed pin with a line icon, standing over a small ring that marks the
// exact spot. Drawn as SVG so it stays crisp at any zoom.
const GLYPHS = {
  landmark: '<path d="M3 21h18M5 21v-9m14 9v-9M4 12h16M12 3 3 9h18L12 3zm-3 9v6m6-6v6"/>',
  utensils: '<path d="M4 2v7a3 3 0 0 0 6 0V2M7 2v20M20 2c-2.2 0-4 3-4 7v3h4v10"/>',
  sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"/>',
  bed: '<path d="M2 19V8m0 6h20m0 5v-5a3 3 0 0 0-3-3h-9v3M6 10.5h2.5"/>',
  plane: '<path d="M2 16l20-6-6 6 2 6-3 1-3-5-5 2-1-2 4-3-6-3z"/>',
  tree: '<path d="M12 2 5.5 11H9l-4.5 6.5h15L15 11h3.5L12 2zm0 15.5V22"/>',
  coffee: '<path d="M17 8h1a3.5 3.5 0 1 1 0 7h-1M3 8h14v7a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V8zM7 2v2.5M11 2v2.5"/>',
  pin: '<circle cx="12" cy="12" r="4"/>',
  torii: '<path d="M2 5.5c3.5 1.2 16.5 1.2 20 0M6 6.200V21M18 6.200V21M4 10.500h16M12 6.500v4"/>',
  lotus: '<path d="M12 20c-5 0-9-3-9-7 3 0 5 1 6 3 0-4 1-7 3-10 2 3 3 6 3 10 1-2 3-3 6-3 0 4-4 7-9 7z"/>',
  mountain: '<path d="m3 20 6.5-11 3.5 6 2.5-4L21 20H3z"/>',
  train: '<path d="M7 3h10a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2zM5 10h14M9 17l-2 4m8-4 2 4M9 13.500h.01M15 13.500h.01"/>',
  bag: '<path d="M5 8h14l1 13H4L5 8zm4 0V6a3 3 0 0 1 6 0v2"/>',
  wave: '<path d="M2 9c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 3.5-2 5-1M2 15c2.5-2.5 5-2.5 7.5 0s5 2.5 7.5 0 3.5-2 5-1"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4V8z"/><circle cx="12" cy="13" r="3.5"/>'
};

// What a place is decides its icon; its saved category decides the colour.
const GLYPH_RULES = [
  [/shrine|shinto|torii|temple|place_of_worship|pagoda/, 'torii'],
  [/onsen|spa|hot_spring|bath/, 'lotus'],
  [/cafe|coffee|bakery|tea_house|dessert/, 'coffee'],
  [/restaurant|food|meal|sushi|ramen|izakaya|bar|market/, 'utensils'],
  [/lodging|hotel|ryokan|hostel|resort/, 'bed'],
  [/mountain|volcano|peak|viewpoint|observation/, 'mountain'],
  [/beach|lake|river|bay|waterfall|coast|island/, 'wave'],
  [/park|garden|forest|hiking|nature|campground|botanical/, 'tree'],
  [/museum|art_gallery|historical|cultural|landmark|monument|castle|palace/, 'landmark'],
  [/train|station|transit|airport/, 'train'],
  [/shopping|store|mall|department/, 'bag'],
  [/tourist_attraction|amusement|zoo|aquarium/, 'camera']
];
const GLYPH_BY_CATEGORY = {
  'Places to Visit': 'landmark', 'Food & Eats': 'utensils', 'Experiences': 'tree', 'Stays/Hotel': 'bed', 'Flights': 'plane'
};

export function glyphForPlace(place) {
  const types = (Array.isArray(place?.types) ? place.types.join(' ') : '').toLowerCase();
  for (const [re, glyph] of GLYPH_RULES) if (types && re.test(types)) return glyph;
  return GLYPH_BY_CATEGORY[place?.category] || 'pin';
}

const PIN_COLORS = {
  torii: COLORS.clay, landmark: COLORS.clay, camera: COLORS.clay,
  utensils: '#b9542e', coffee: '#a5683a', bag: '#a5683a',
  tree: '#647a52', mountain: '#647a52', lotus: '#647a52', wave: '#5f8590',
  bed: '#6d8799', train: '#6b6354', plane: '#4f6d8a', pin: COLORS.sage, sparkles: COLORS.sage
};

export function shortName(name = '', max = 18) {
  const base = String(name).split(/[,(（–—]| - /)[0].trim() || String(name).trim();
  return base.length > max ? `${base.slice(0, max - 1).trimEnd()}…` : base;
}

const pinCache = new Map();
/**
 * color – fill; glyph – key of GLYPHS; size – width in px of the 48×64 artwork;
 * badge – small number shown on the shoulder (stop order); label – name shown under the pin.
 */
export function makePin({ color = COLORS.clay, glyph = 'pin', size = 38, badge = '', label = '' } = {}) {
  const key = `${color}|${glyph}|${size}|${badge}|${label}`;
  if (pinCache.has(key)) return pinCache.get(key);
  const w = size, h = Math.round((size * 64) / 48);
  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 48 64">
    <defs><filter id="s" x="-30%" y="-20%" width="160%" height="150%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#3c321e" flood-opacity="0.3"/></filter></defs>
    <circle cx="24" cy="57" r="4.2" fill="#fffdf8" stroke="${color}" stroke-width="2.2"/>
    <path filter="url(#s)" d="M24 50c-1.2 0-14-13.6-17-23.2A18 18 0 1 1 41 26.8C38 36.4 25.2 50 24 50z" fill="${color}" stroke="#fffdf8" stroke-width="1.8"/>
    <g transform="translate(13.2 10.2) scale(0.9)" fill="none" stroke="#fffdf8" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[glyph] || GLYPHS.pin}</g>
    ${badge !== '' ? `<circle cx="38.5" cy="8.5" r="8" fill="#fffdf8" stroke="${color}" stroke-width="1.6"/><text x="38.5" y="12.2" text-anchor="middle" font-family="Inter, Helvetica, Arial, sans-serif" font-size="${String(badge).length > 1 ? 9 : 10.5}" font-weight="700" fill="${color}">${badge}</text>` : ''}
  </svg>`;
  const g = typeof window !== 'undefined' ? window.google?.maps : null;
  const anchorY = (h * 57) / 64;
  const icon = {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    anchor: g?.Point ? new g.Point(w / 2, anchorY) : { x: w / 2, y: anchorY },
    scaledSize: g?.Size ? new g.Size(w, h) : { width: w, height: h },
    // the name sits just under the ring
    labelOrigin: g?.Point ? new g.Point(w / 2, h + 9) : { x: w / 2, y: h + 9 }
  };
  const pin = {
    icon,
    label: label ? { text: label, className: 'tl-pin-label', color: COLORS.ink, fontSize: '11px', fontWeight: '600', fontFamily: 'Inter, system-ui, sans-serif' } : undefined
  };
  pinCache.set(key, pin);
  return pin;
}

export function pinForPlace(place, opts = {}) {
  const glyph = glyphForPlace(place);
  return makePin({ color: PIN_COLORS[glyph] || categoryMeta(place?.category).color, glyph, ...opts });
}

export const flightPin = (opts = {}) => makePin({ color: PIN_COLORS.plane, glyph: 'plane', size: 34, ...opts });
export const stayPin = (opts = {}) => makePin({ color: PIN_COLORS.bed, glyph: 'bed', size: 40, ...opts });

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
