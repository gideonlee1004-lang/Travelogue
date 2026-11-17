/**
 * Worldwide watercolor imagery, placed TRANSPARENTLY over Google's ordinary map.
 * Unlike a replacement MapType, an overlay preserves the underlying airport
 * runways, taxiways, roads, transit, water and POIs wherever Google supplies them.
 * The artwork becomes progressively lighter at closer zoom levels so details
 * remain readable. Above the Stadia tile limit the underlying map stays usable.
 *
 * https://docs.stadiamaps.com/map-styles/stamen-watercolor/
 * https://developers.google.com/maps/documentation/javascript/maptypes#OverlayMapTypes
 */
export const WATERCOLOR_MAP_TYPE = 'travelogue_watercolor_overlay';
export const WATERCOLOR_TILE_MAX_ZOOM = 16;
export const WATERCOLOR_VIEW_MAX_ZOOM = 22;
export const MAP_MODE_STORAGE_KEY = 'tl_world_map_mode';
export const MAP_MODES = ['watercolor', 'street', 'satellite'];

export function readMapMode(storage) {
  try {
    const selected = storage?.getItem(MAP_MODE_STORAGE_KEY);
    return MAP_MODES.includes(selected) ? selected : 'watercolor';
  } catch {
    return 'watercolor';
  }
}

export function getWatercolorTileUrl(coords, zoom, apiKey = '') {
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > WATERCOLOR_TILE_MAX_ZOOM) return null;
  if (!Number.isInteger(coords?.x) || !Number.isInteger(coords?.y)) return null;
  const tileCount = 2 ** zoom;
  if (coords.y < 0 || coords.y >= tileCount) return null;
  const wrappedX = ((coords.x % tileCount) + tileCount) % tileCount;
  const url = `https://tiles.stadiamaps.com/tiles/stamen_watercolor/${zoom}/${wrappedX}/${coords.y}.jpg`;
  return apiKey ? `${url}?api_key=${encodeURIComponent(apiKey)}` : url;
}

/** Details get priority over pigment at close zoom. Never completely obscure the base. */
export function getWatercolorOpacity(zoom) {
  if (!Number.isFinite(zoom) || zoom < 0 || zoom > WATERCOLOR_TILE_MAX_ZOOM) return 0;
  if (zoom <= 7) return 0.80;
  if (zoom <= 10) return 0.68;
  if (zoom <= 12) return 0.49;
  if (zoom <= 13) return 0.38;
  return 0.25;
}

/** Compatible with Google Maps' overlayMapTypes MVCArray. */
export function createWatercolorMapType(googleMaps, { apiKey = '', onTileError = () => {} } = {}) {
  return {
    tileSize: new googleMaps.maps.Size(256, 256),
    name: 'Watercolor detail overlay',
    alt: 'Watercolor artwork over a complete interactive Google basemap',
    minZoom: 0,
    maxZoom: WATERCOLOR_VIEW_MAX_ZOOM,
    getTile(coord, zoom, ownerDocument) {
      const url = getWatercolorTileUrl(coord, zoom, apiKey);
      if (!url) {
        // A TRANSPARENT tile, not an opaque square hiding the actual map.
        const empty = ownerDocument.createElement('div');
        empty.style.width = '256px';
        empty.style.height = '256px';
        empty.style.pointerEvents = 'none';
        return empty;
      }
      const img = ownerDocument.createElement('img');
      img.alt = '';
      img.width = 256;
      img.height = 256;
      img.style.width = '256px';
      img.style.height = '256px';
      img.style.display = 'block';
      img.style.pointerEvents = 'none';
      img.style.opacity = String(getWatercolorOpacity(zoom));
      img.decoding = 'async';
      img.addEventListener('error', onTileError, { once: true });
      img.src = url;
      return img;
    },
    releaseTile(tile) {
      tile?.remove?.();
    }
  };
}

/** Idempotently insert or remove JUST our own layer; never touch other overlays. */
export function setWatercolorOverlay(map, layer, enabled) {
  const overlays = map?.overlayMapTypes;
  if (!overlays || !layer) return false;
  const existingIndex = overlays.getArray().indexOf(layer);
  if (enabled && existingIndex === -1) overlays.insertAt(0, layer);
  if (!enabled && existingIndex !== -1) overlays.removeAt(existingIndex);
  return true;
}
