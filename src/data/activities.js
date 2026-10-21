import { getPlace } from './destinations'
import { getCachedPlace } from '../services/placeCache'

/**
 * Turns any place (curated, live OpenStreetMap, or Gemini AI generated) into the
 * activity shape the existing recommendation engine, cards, details page and saved list understand.
 */
export function placeToActivity(place) {
  return {
    id: place.id,
    hub: null,
    kerala: false,
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
    costNote: place.costNote ?? (place.cost ? `₹${place.cost}` : 'Free entry'),
    coords: place.coords ?? null,
    image: place.imageUrl || place.image || null,
    imageUrl: place.imageUrl || place.image || null,
    indoor: false,
    source: place.source,
    live: Boolean(place.live),
    isAi: Boolean(place.isAi),
    travelMinutes: place.travelMinutes,
    osmUrl: place.osmUrl ?? null,
  }
}

export function getActivity(id) {
  const place = getPlace(id) ?? getCachedPlace(id)
  return place ? placeToActivity(place) : null
}

export const getKeralaActivity = getActivity
