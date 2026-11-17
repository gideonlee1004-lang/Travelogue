/** Decode a provider road geometry into real road-following latitude/longitude points.
 * Never substitute a straight line when the route is unavailable.
 */
export function decodeRoutePolyline(encoded) {
  if (!encoded || typeof encoded !== 'string') return [];
  const points = [];
  let i = 0, lat = 0, lng = 0;
  try {
    while (i < encoded.length) {
      const values = [];
      for (let coord = 0; coord < 2; coord++) {
        let shift = 0, value = 0, byte;
        do {
          if (i >= encoded.length) return [];
          byte = encoded.charCodeAt(i++) - 63;
          value |= (byte & 0x1f) << shift;
          shift += 5;
          if (shift > 35) return [];
        } while (byte >= 0x20);
        values.push(value & 1 ? ~(value >> 1) : value >> 1);
      }
      lat += values[0]; lng += values[1];
      points.push({ lat: lat / 1e5, lng: lng / 1e5 });
    }
  } catch { return []; }
  return points;
}

