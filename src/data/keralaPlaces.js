// ─────────────────────────────────────────────────────────────────────────────
// Worldwide & domestic destinations (ORBIT starting points).
// Coordinates are approximate city centres used as convenient reference points.
// Works for any city, region or country worldwide — inside India or internationally.
// ─────────────────────────────────────────────────────────────────────────────

export const DESTINATION_SOURCE = { label: 'ORBIT destinations', kind: 'curated', coordsPrecision: 'approximate' }
export const KERALA_SOURCE = DESTINATION_SOURCE

/** Selectable cities and destinations worldwide (manual starting points). */
export const WORLD_DESTINATIONS = [
  // ── Worldwide (International) ──
  { id: 'london', name: 'London, United Kingdom', coords: [51.5074, -0.1278] },
  { id: 'paris', name: 'Paris, France', coords: [48.8566, 2.3522] },
  { id: 'new-york', name: 'New York, USA', coords: [40.7128, -74.006] },
  { id: 'tokyo', name: 'Tokyo, Japan', coords: [35.6762, 139.6503] },
  { id: 'dubai', name: 'Dubai, UAE', coords: [25.2048, 55.2708] },
  { id: 'singapore', name: 'Singapore', coords: [1.3521, 103.8198] },
  { id: 'rome', name: 'Rome, Italy', coords: [41.9028, 12.4964] },
  { id: 'barcelona', name: 'Barcelona, Spain', coords: [41.3879, 2.1699] },
  { id: 'amsterdam', name: 'Amsterdam, Netherlands', coords: [52.3676, 4.9041] },
  { id: 'bangkok', name: 'Bangkok, Thailand', coords: [13.7563, 100.5018] },
  { id: 'sydney', name: 'Sydney, Australia', coords: [-33.8688, 151.2093] },
  { id: 'toronto', name: 'Toronto, Canada', coords: [43.6532, -79.3832] },
  { id: 'berlin', name: 'Berlin, Germany', coords: [52.52, 13.405] },
  { id: 'seoul', name: 'Seoul, South Korea', coords: [37.5665, 126.978] },

  // ── India (Major Hubs & Destinations) ──
  { id: 'delhi', name: 'New Delhi, India', coords: [28.6139, 77.209] },
  { id: 'mumbai', name: 'Mumbai, India', coords: [19.076, 72.8777] },
  { id: 'bengaluru', name: 'Bengaluru, India', coords: [12.9716, 77.5946] },
  { id: 'goa', name: 'Goa, India', coords: [15.2993, 74.124] },
  { id: 'jaipur', name: 'Jaipur, India', coords: [26.9124, 75.7873] },
  { id: 'chennai', name: 'Chennai, India', coords: [13.0827, 80.2707] },
  { id: 'kolkata', name: 'Kolkata, India', coords: [22.5726, 88.3639] },
  { id: 'hyderabad', name: 'Hyderabad, India', coords: [17.385, 78.4867] },
  { id: 'kochi', name: 'Kochi, India', coords: [9.9312, 76.2673] },
  { id: 'thiruvananthapuram', name: 'Thiruvananthapuram, India', coords: [8.5241, 76.9366] },
  { id: 'kozhikode', name: 'Kozhikode, India', coords: [11.2588, 75.7804] },
  { id: 'kannur', name: 'Kannur, India', coords: [11.8745, 75.3704] },
  { id: 'munnar', name: 'Munnar, India', coords: [10.0889, 77.0595] },
  { id: 'varkala', name: 'Varkala, India', coords: [8.7379, 76.7163] },
]

/** Backward-compatible alias for existing components */
export const KERALA_DISTRICTS = WORLD_DESTINATIONS

export const KERALA_PLACES = []

export const EXPLORE_GROUPS = [
  { id: 'beaches', label: 'Beaches & waterfronts' },
  { id: 'nature', label: 'Nature & parks' },
  { id: 'culture', label: 'Culture & landmarks' },
  { id: 'food', label: 'Food & markets' },
  { id: 'hidden', label: 'Hidden gems' },
  { id: 'weekend', label: 'Day trips & getaways' },
]

export const getKeralaPlace = (id) => KERALA_PLACES.find((p) => p.id === id) ?? null
