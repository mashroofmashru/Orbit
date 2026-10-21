import { DESTINATION_PLACES as KERALA_PLACES } from '../data/destinations'
import { haversineKm, withinRadius } from '../utils/distanceUtils'
import { nearestDistrict } from './locationService'
import { getCachedPlaces, getCachedQuery, setCachedQuery } from './placeCache'

// Live nearby places from OpenStreetMap via ORBIT proxy or public Overpass mirrors.
// Used responsibly: results cached 24h, one request at a time, a cooldown between requests,
// a capped radius, and a fallback to the curated list when the service is busy or unreachable.
const ENDPOINTS = [
  '/api/places/osm',
  'https://lz4.overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const MAX_LIVE_RADIUS_KM = 25 // Overpass "around" queries get heavy beyond this
const FOOD_RADIUS_KM = 3 // cafés/restaurants only very close by, or a city returns thousands
const COOLDOWN_MS = 3000
const TIMEOUT_MS = 16000

export const KOZHIKODE_CENTRE = { label: 'Kozhikode city centre', coords: [11.2588, 75.7804] }

const TOURIST_SELECTORS = [
  '["tourism"~"^(attraction|viewpoint|museum|gallery|zoo|theme_park)$"]',
  '["natural"="beach"]',
  '["waterway"="waterfall"]',
  '["leisure"~"^(park|nature_reserve|garden)$"]',
  '["historic"~"^(fort|monument|memorial|castle|ruins|archaeological_site|building)$"]',
]

export const OSM_ATTRIBUTION = '© OpenStreetMap contributors (ODbL), via Overpass API'

let inFlight = null
let lastRequestAt = 0

function buildQuery([lat, lon], radiusKm) {
  const r = Math.round(radiusKm * 1000)
  const f = Math.round(Math.min(radiusKm, FOOD_RADIUS_KM) * 1000)
  const a = (rad) => `(around:${rad},${lat},${lon})`
  return `[out:json][timeout:20];
(
${TOURIST_SELECTORS.map((s) => `  nw${a(r)}${s}["name"];`).join('\n')}
  nw${a(r)}["amenity"="marketplace"]["name"];
  nw${a(f)}["amenity"~"^(cafe|restaurant)$"]["name"];
  nw${a(f)}["shop"="mall"]["name"];
);
out center tags 120;`
}

// OSM tags → ORBIT category / interests / Explore groups / typical visit (estimates, labelled as such)
function classify(t) {
  if (t.natural === 'beach') return { category: 'nature', interests: ['nature', 'relaxation', 'photography'], groups: ['beaches'], kind: 'Beach', visit: { min: 30, max: 90 } }
  if (t.waterway === 'waterfall') return { category: 'nature', interests: ['nature', 'photography'], groups: ['nature'], kind: 'Waterfall', visit: { min: 45, max: 120 } }
  if (t.tourism === 'viewpoint') return { category: 'photography', interests: ['photography', 'nature', 'hidden'], groups: ['nature', 'hidden'], kind: 'Viewpoint', visit: { min: 15, max: 45 } }
  if (t.tourism === 'museum' || t.tourism === 'gallery') return { category: 'culture', interests: ['culture', 'attractions'], groups: ['culture'], kind: t.tourism === 'museum' ? 'Museum' : 'Gallery', visit: { min: 30, max: 90 } }
  if (t.historic) return { category: 'culture', interests: ['culture', 'attractions', 'photography'], groups: ['culture'], kind: 'Historic site', visit: { min: 30, max: 75 } }
  if (t.leisure) return { category: 'nature', interests: ['nature', 'relaxation'], groups: ['nature'], kind: t.leisure === 'nature_reserve' ? 'Nature reserve' : 'Park', visit: { min: 30, max: 90 } }
  if (t.amenity === 'marketplace') return { category: 'shopping', interests: ['shopping', 'food', 'culture'], groups: ['food'], kind: 'Market', visit: { min: 20, max: 60 } }
  if (t.amenity === 'cafe') return { category: 'cafes', interests: ['cafes', 'food'], groups: ['food'], kind: 'Café', visit: { min: 20, max: 45 } }
  if (t.amenity === 'fast_food') return { category: 'food', interests: ['food'], groups: ['food'], kind: 'Fast food', visit: { min: 15, max: 40 } }
  if (t.amenity === 'ice_cream') return { category: 'cafes', interests: ['cafes', 'food'], groups: ['food'], kind: 'Ice cream', visit: { min: 10, max: 30 } }
  if (t.amenity === 'restaurant') return { category: 'food', interests: ['food'], groups: ['food'], kind: 'Restaurant', visit: { min: 30, max: 60 } }
  if (t.shop === 'mall') return { category: 'shopping', interests: ['shopping'], groups: ['food'], kind: 'Shopping mall', visit: { min: 30, max: 90 } }
  return { category: 'attractions', interests: ['attractions', 'photography'], groups: ['hidden'], kind: 'Attraction', visit: { min: 20, max: 60 } }
}

function toPlace(el) {
  const t = el.tags || {}
  const lat = el.lat ?? el.center?.lat
  const lon = el.lon ?? el.center?.lon
  const name = t['name:en'] || t.name
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null
  const c = classify(t)
  const coords = [lat, lon]
  return {
    id: `osm-${el.type}-${el.id}`,
    name,
    district: nearestDistrict(coords)?.name ?? 'Nearby',
    coords,
    category: c.category,
    kind: c.kind,
    interests: c.interests,
    groups: c.groups,
    // Only what the data says — no invented details
    description: `${c.kind} listed in OpenStreetMap.${t.cuisine ? ` Cuisine: ${t.cuisine.replace(/;/g, ', ')}.` : ''}`,
    visitMinutes: c.visit,
    source: { label: 'OpenStreetMap', kind: 'live', coordsPrecision: 'mapped' },
    osmUrl: `https://www.openstreetmap.org/${el.type}/${el.id}`,
    live: true,
  }
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Removes duplicates: a live place matching a curated one (similar name, within 1.5 km) keeps the curated entry. */
export function dedupe(curated, live) {
  const out = [...curated]
  for (const p of live) {
    const n = norm(p.name)
    const dup = out.find((q) => {
      const m = norm(q.name)
      // Same place if one name contains the other, or most words overlap ("Payyambalam Beach" ≈ "Payyambalam beach park")
      const a = new Set(m.split(' '))
      const b = n.split(' ')
      const overlap = b.filter((w) => a.has(w)).length / Math.max(a.size, b.length)
      const similar = m.includes(n) || n.includes(m) || overlap >= 0.6
      return similar && haversineKm(p.coords, q.coords) < 1.5
    })
    if (dup) dup.alsoInOsm = true
    else out.push(p)
  }
  return out
}

async function postQuery(endpoint, query, signal, timeoutMs) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  signal?.addEventListener('abort', () => ctrl.abort())
  try {
    const isLocalProxy = endpoint.startsWith('/api')
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: isLocalProxy
        ? { 'Content-Type': 'application/json', 'X-Orbit-Client': '1' }
        : { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: isLocalProxy ? JSON.stringify({ query }) : `data=${encodeURIComponent(query)}`,
      signal: ctrl.signal,
    })
    if (res.status === 429) throw Object.assign(new Error('busy'), { code: 'busy' })
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { code: res.status === 504 ? 'timeout' : 'error' })
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

/** Runs one Overpass query politely: one request at a time, a cooldown between requests, then a mirror. */
async function runQuery(query, { signal, timeoutMs = TIMEOUT_MS } = {}) {
  if (inFlight) await inFlight.catch(() => {})
  const wait = COOLDOWN_MS - (Date.now() - lastRequestAt)
  if (wait > 0) await new Promise((r) => setTimeout(r, wait))
  lastRequestAt = Date.now()

  let lastError = null
  for (const endpoint of ENDPOINTS) {
    try {
      inFlight = postQuery(endpoint, query, signal, timeoutMs)
      const json = await inFlight
      return (json.elements || []).map(toPlace).filter(Boolean)
    } catch (err) {
      if (signal?.aborted) throw err
      lastError = err
    } finally {
      inFlight = null
    }
  }
  throw lastError
}

const failureReason = (err) =>
  err?.code === 'busy' ? 'The OpenStreetMap service is busy.' : err?.code === 'timeout' ? 'The OpenStreetMap service timed out.' : 'We couldn’t reach the OpenStreetMap service.'

/**
 * Nearby places around `coords` within `radiusKm` (null = "all nearby", capped at 50 km for curated).
 * Returns { places, mode: 'live' | 'cache' | 'fallback', note }. Never throws for network problems.
 */
export async function fetchNearbyPlaces({ coords, radiusKm }, { signal } = {}) {
  const curatedRadius = radiusKm ?? 50
  const liveRadius = Math.min(radiusKm ?? MAX_LIVE_RADIUS_KM, MAX_LIVE_RADIUS_KM)
  const curated = KERALA_PLACES.map((p) => ({ ...p }))
  const finish = (live, mode, note) => ({ places: withinRadius(dedupe(curated, live), coords, curatedRadius), mode, note })

  const key = `${coords[0].toFixed(3)},${coords[1].toFixed(3)},${liveRadius}`
  const cached = getCachedQuery(key)
  if (cached) return finish(getCachedPlaces(cached.ids), 'cache', 'Live OpenStreetMap results (cached within the last 24 hours).')

  const district = nearestDistrict(coords)?.name
  const label = district ? `curated ${district} places` : 'curated list'

  try {
    const live = await runQuery(buildQuery(coords, liveRadius), { signal })
    setCachedQuery(key, live)
    return finish(live, 'live', 'Live results from OpenStreetMap.')
  } catch (err) {
    if (signal?.aborted) throw err
    return finish([], 'fallback', `${failureReason(err)} Showing ORBIT’s ${label} only.`)
  }
}

/**
 * All named tourist spots and food places in Kozhikode (live OpenStreetMap, cached 24h),
 * merged with ORBIT's curated Kozhikode places. Same { places, mode, note } shape; never throws for network problems.
 */
export async function fetchKozhikodePlaces({ signal } = {}) {
  return fetchNearbyPlaces({ coords: KOZHIKODE_CENTRE.coords, radiusKm: 25 }, { signal })
}
