import { KERALA_DISTRICTS, KERALA_PLACES } from '../data/keralaPlaces'
import { haversineKm } from '../utils/distanceUtils'

export const isInKerala = () => true

/** Nearest curated city/destination to a coordinate worldwide. No network call. */
export function nearestDistrict(coords) {
  if (!coords) return null
  let best = null
  for (const d of KERALA_DISTRICTS) {
    const km = haversineKm(coords, d.coords)
    if (!best || km < best.km) best = { ...d, km }
  }
  return best && best.km <= 100 ? best : null
}

export function describeCurrentLocation(coords) {
  const near = nearestDistrict(coords)
  if (!near) {
    return {
      label: `Current location (${coords[0].toFixed(3)}, ${coords[1].toFixed(3)})`,
      district: null,
    }
  }
  return { label: `Current location · near ${near.name}`, district: near.name }
}

const norm = (s) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/** Instant, offline matches against our worldwide destination list. */
export function searchLocal(query) {
  const q = norm(query)
  if (!q) return []
  const districts = KERALA_DISTRICTS.filter((d) => norm(d.name).includes(q)).map((d) => ({
    id: `district-${d.id}`,
    label: d.name,
    detail: 'City / destination',
    coords: d.coords,
    source: 'ORBIT list',
  }))
  const places = KERALA_PLACES.filter((p) => norm(p.name).includes(q) || norm(p.district).includes(q)).map((p) => ({
    id: p.id,
    label: p.name,
    detail: `${p.district} · approximate location`,
    coords: p.coords,
    source: 'ORBIT list',
  }))
  return [...districts, ...places].slice(0, 8)
}

// ── OpenStreetMap Nominatim search ───────────────────────────────────────────
// Worldwide search for any place, landmark, city, airport or address.
const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const searchCache = new Map()
let lastRequestAt = 0

export async function searchOnline(query, { signal } = {}) {
  const q = query.trim()
  if (q.length < 3) return []
  const key = norm(q)
  if (searchCache.has(key)) return searchCache.get(key)

  const wait = 1100 - (Date.now() - lastRequestAt)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt = Date.now()

  const params = new URLSearchParams({
    q,
    format: 'jsonv2',
    limit: '6',
    'accept-language': 'en',
  })
  const res = await fetch(`${NOMINATIM}?${params}`, { signal, headers: { Accept: 'application/json' } })
  if (res.status === 429) throw new Error('The map search service is busy. Please wait a moment and try again.')
  if (!res.ok) throw new Error('Location search is unavailable right now.')
  const rows = await res.json()
  const results = rows.map((r) => ({
    id: `nominatim-${r.osm_type}-${r.osm_id}`,
    label: r.name || r.display_name.split(',')[0],
    detail: r.display_name.split(',').slice(1, 3).join(',').trim(),
    coords: [Number(r.lat), Number(r.lon)],
    source: 'OpenStreetMap (Nominatim)',
  }))
  searchCache.set(key, results)
  return results
}
