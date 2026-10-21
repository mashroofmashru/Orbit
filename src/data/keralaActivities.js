import { getKeralaPlace } from './keralaPlaces'
import { getCachedPlace } from '../services/placeCache'

/**
 * Turns a Kerala place (curated or live OpenStreetMap) into the activity shape the existing
 * recommendation engine, cards, details page and saved list already understand.
 * Unknown facts stay unknown: cost is null ("Price information unavailable"), no highlights/tips.
 */
export function placeToActivity(place) {
  return {
    id: place.id,
    hub: null,
    kerala: true,
    name: place.name,
    area: place.district,
    category: place.category,
    interests: place.interests,
    summary: place.description,
    description: place.description,
    highlights: place.highlights ?? [],
    tips: place.tips ?? [],
    duration: place.visitMinutes ?? { min: 30, max: 90 },
    durationIsEstimate: true,
    cost: place.cost ?? null,
    costNote: place.costNote ?? (place.cost ? `₹${place.cost}` : 'Price information unavailable'),
    coords: place.coords ?? null,
    image: place.imageUrl || place.image || null,
    imageUrl: place.imageUrl || place.image || null,
    indoor: false, // unknown — treated as outdoor so simulated rain never over-promises
    source: place.source,
    live: Boolean(place.live),
    isAi: Boolean(place.isAi),
    travelMinutes: place.travelMinutes,
    osmUrl: place.osmUrl ?? null,
  }
}

export function getKeralaActivity(id) {
  const place = getKeralaPlace(id) ?? getCachedPlace(id)
  return place ? placeToActivity(place) : null
}
