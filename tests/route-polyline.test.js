import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeRoutePolyline } from '../src/lib/routePolyline.js';

test('decodes a route polyline to precise street-level coordinates', () => {
  const points = decodeRoutePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.deepEqual(points, [
    { lat: 38.5, lng: -120.2 },
    { lat: 40.7, lng: -120.95 },
    { lat: 43.252, lng: -126.453 }
  ]);
});
test('empty and truncated geometry is never drawn as a straight line', () => {
  assert.deepEqual(decodeRoutePolyline(''), []);
  assert.deepEqual(decodeRoutePolyline('_p~iF~ps|U_u'), []);
});
