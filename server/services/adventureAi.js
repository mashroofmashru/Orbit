import dns from 'node:dns'
dns.setDefaultResultOrder('ipv4first')
import { GoogleGenAI, Type } from '@google/genai'
import { z } from 'zod'

const VALID_CATEGORIES = [
  'nature',
  'culture',
  'cafes',
  'food',
  'shopping',
  'relaxation',
  'photography',
  'attractions',
]

const PlaceSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  district: z.string().default(''),
  lat: z.number(),
  lon: z.number(),
  category: z.string().default('attractions'),
  kind: z.string().default('Attraction'),
  interests: z.array(z.string()).default([]),
  groups: z.array(z.string()).default([]),
  description: z.string().default(''),
  visit_min_minutes: z.number().int().min(5).max(480).default(30),
  visit_max_minutes: z.number().int().min(10).max(600).default(60),
  travel_minutes: z.number().int().min(1).max(300).default(15),
  cost_inr: z.number().int().min(0).default(0),
  cost_note: z.string().optional().default(''),
  highlights: z.array(z.string()).optional().default([]),
  tips: z.array(z.string()).optional().default([]),
})

const PlacesResponseSchema = z.object({
  resolved_location_name: z.string().optional().default(''),
  resolved_coords: z.array(z.number()).length(2).optional(),
  places: z.array(PlaceSchema).min(1).max(20),
})

const SYSTEM_INSTRUCTION = `You are an expert worldwide travel guide and trip planner for ORBIT.
You support destinations across the globe — anywhere inside India or internationally (e.g. Europe, Americas, Asia, Middle East, Africa, Oceania).
Given a user's starting location and/or coordinates, available time window (in minutes), budget, interests, and mood:
1. If coordinates [lat, lon] are provided (such as from GPS / "Current location" anywhere on Earth), reverse-geocode and identify the actual city, district, town or neighbourhood name, and return it in resolved_location_name. Return resolved_coords as [lat, lon].
2. If starting_location is a place name without coordinates (any town, city, landmark, or region anywhere worldwide, inside India or abroad: e.g. London, Paris, Tokyo, New York, Dubai, Singapore, Rome, Sydney, Mumbai, Delhi, Kochi, etc.), determine its accurate latitude and longitude, and return them in resolved_coords [lat, lon]. Return resolved_location_name as the clean place name.
3. Suggest 6 to 12 REAL, exciting places and activities to visit strictly starting from resolved_coords within available_duration_minutes.

CRITICAL RULES:
1. Every place must be a real, authentic place with reasonably accurate latitude and longitude.
2. STRICT TIME FEASIBILITY: Every recommended place MUST realistically be visitable within the user's available window of {durationMinutes} minutes from resolved_coords.
   Total time = (travel_minutes * 2) + visit_min_minutes.
   This total must NOT exceed available_duration_minutes. For short windows (e.g. 30-60 mins), suggest spots very close to the starting location (under 15-20 mins travel).
3. STRICT BUDGET: Estimated cost per person (cost_inr) must fit within the user's budget. Free spots (beaches, parks, public viewpoints, temples/promenades) have cost_inr = 0.
4. Respect the user's selected interests and mood.
5. Provide accurate coordinates [lat, lon], realistic visit duration (visit_min_minutes, visit_max_minutes), one-way travel minutes from the starting location, and vivid descriptions.
6. Return purely valid JSON adhering to the provided schema.`

// In-memory cache for fast repeat responses
const cache = new Map()
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

/** Scrape image from Wikipedia / Wikimedia Commons for a given place. */
export async function scrapePlaceImage(placeName, district = '') {
  const queries = [
    `${placeName} ${district}`.trim(),
    placeName,
  ]

  for (const q of queries) {
    try {
      const url = `https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrlimit=1&prop=pageimages&pithumbsize=960&format=json&origin=*`
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 4000)
      const res = await fetch(url, {
        headers: { 'User-Agent': 'OrbitTravelApp/1.0 (https://orbit.app; travel@orbit.app)' },
        signal: ctrl.signal,
      })
      clearTimeout(timer)

      if (res.ok) {
        const data = await res.json()
        const pages = data?.query?.pages
        if (pages) {
          const firstPage = Object.values(pages)[0]
          if (firstPage?.thumbnail?.source) {
            return firstPage.thumbnail.source
          }
        }
      }
    } catch {
      // Ignore network timeout/failure and try next query or fallback
    }
  }

  return null
}

const CATEGORY_UNSPLASH_FALLBACKS = {
  nature: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=960&q=75&auto=format&fit=crop',
  beaches: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=960&q=75&auto=format&fit=crop',
  culture: 'https://images.unsplash.com/photo-1599661046289-e31897846e41?w=960&q=75&auto=format&fit=crop',
  cafes: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=960&q=75&auto=format&fit=crop',
  food: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=960&q=75&auto=format&fit=crop',
  shopping: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=960&q=75&auto=format&fit=crop',
  relaxation: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=960&q=75&auto=format&fit=crop',
  photography: 'https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=960&q=75&auto=format&fit=crop',
  attractions: 'https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=960&q=75&auto=format&fit=crop',
}

function getFallbackPhoto(category, groups = []) {
  if (groups.includes('beaches')) return CATEGORY_UNSPLASH_FALLBACKS.beaches
  return CATEGORY_UNSPLASH_FALLBACKS[category] || CATEGORY_UNSPLASH_FALLBACKS.attractions
}

const normId = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 50)

export async function suggestAdventuresWithAi(config, preferences) {
  const apiKey =
    config.ai?.apiKey ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY

  if (!apiKey) {
    console.warn('[adventureAi] No Gemini API key configured')
    return null
  }

  const locationLabel = (preferences.location?.label || (typeof preferences.location === 'string' ? preferences.location : '') || '').trim()
  const rawCoords = preferences.coords || preferences.location?.coords
  const coords = Array.isArray(rawCoords) && rawCoords.length === 2 && Number.isFinite(rawCoords[0]) && Number.isFinite(rawCoords[1])
    ? [Number(rawCoords[0]), Number(rawCoords[1])]
    : null

  const durationMinutes = Number(preferences.durationOption || preferences.durationMinutes || 60)
  const budget = Number(preferences.budgetOption || preferences.budget || 500)
  const interests = Array.isArray(preferences.interests) ? preferences.interests : []
  const mood = preferences.mood || ''

  // Cache check
  const cacheKey = JSON.stringify({
    loc: locationLabel.toLowerCase(),
    lat: coords ? coords[0]?.toFixed(2) : null,
    lon: coords ? coords[1]?.toFixed(2) : null,
    dur: durationMinutes,
    bud: budget,
    ints: [...interests].sort().join(','),
    mood,
  })

  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.data
  }

  const client = new GoogleGenAI({ apiKey })

  const prompt = {
    starting_location: locationLabel || (coords ? `Coordinates [${coords.join(', ')}]` : 'your location'),
    coordinates: coords,
    available_duration_minutes: durationMinutes,
    max_budget_inr: budget,
    interests: interests.length > 0 ? interests : ['nature', 'culture', 'food', 'relaxation', 'photography'],
    mood: mood || 'curious',
    note: `Identify the exact geographic location and suggest real, visitable places strictly fitting within ${durationMinutes} minutes total window and ${budget} INR budget.`,
  }

  const candidateModels = [
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-3.5-flash',
    config.ai?.model,
    'gemini-2.5-flash',
  ].filter(Boolean)
  const uniqueModels = [...new Set(candidateModels)]

  let rawData = null
  let successfulModel = null

  for (const model of uniqueModels) {
    try {
      const response = await client.models.generateContent({
        model,
        contents: JSON.stringify(prompt),
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              resolved_location_name: {
                type: Type.STRING,
                description: 'The clean city, district, or town name of the starting point (e.g. Kasaragod, Kannur, Kochi, Paris, etc.)',
              },
              resolved_coords: {
                type: Type.ARRAY,
                items: { type: Type.NUMBER },
                description: 'The [latitude, longitude] of the starting point',
              },
              places: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    district: { type: Type.STRING },
                    lat: { type: Type.NUMBER },
                    lon: { type: Type.NUMBER },
                    category: { type: Type.STRING },
                    kind: { type: Type.STRING },
                    interests: { type: Type.ARRAY, items: { type: Type.STRING } },
                    groups: { type: Type.ARRAY, items: { type: Type.STRING } },
                    description: { type: Type.STRING },
                    visit_min_minutes: { type: Type.INTEGER },
                    visit_max_minutes: { type: Type.INTEGER },
                    travel_minutes: { type: Type.INTEGER },
                    cost_inr: { type: Type.INTEGER },
                    cost_note: { type: Type.STRING },
                    highlights: { type: Type.ARRAY, items: { type: Type.STRING } },
                    tips: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ['name', 'lat', 'lon', 'description', 'visit_min_minutes', 'visit_max_minutes', 'travel_minutes'],
                },
              },
            },
            required: ['resolved_location_name', 'resolved_coords', 'places'],
          },
        },
      })

      const text = response.text
      if (!text) continue
      const parsed = JSON.parse(text)
      const validated = PlacesResponseSchema.safeParse(parsed)
      if (validated.success && validated.data.places?.length > 0) {
        rawData = validated.data
        successfulModel = model
        break
      }
    } catch (err) {
      console.warn(`[adventureAi] Model ${model} failed (${err.message}) — trying fallback if available`)
    }
  }

  if (!rawData || !rawData.places?.length) {
    return null
  }

  const resolvedCoords = (rawData.resolved_coords?.length === 2 && Number.isFinite(rawData.resolved_coords[0]))
    ? rawData.resolved_coords
    : (coords || [28.6139, 77.209])

  const resolvedLabel = rawData.resolved_location_name || locationLabel || (coords ? `Near [${coords[0].toFixed(2)}, ${coords[1].toFixed(2)}]` : 'Worldwide')

  // Scrape images in parallel (capped at 4000ms timeout per image)
  const imagePromises = rawData.places.map(async (p) => {
    const scraped = await scrapePlaceImage(p.name, p.district || resolvedLabel)
    return scraped || getFallbackPhoto(p.category, p.groups)
  })
  const images = await Promise.all(imagePromises)

  const districtDefault = resolvedLabel.split(',')[0].trim()

  const formattedPlaces = rawData.places.map((p, idx) => {
    const category = VALID_CATEGORIES.includes(p.category?.toLowerCase()) ? p.category.toLowerCase() : 'attractions'
    const cleanId = `ai-${normId(p.name)}-${normId(p.district || districtDefault)}`
    const imageUrl = images[idx] || getFallbackPhoto(category, p.groups)

    return {
      id: cleanId,
      name: p.name,
      district: p.district || districtDefault,
      coords: [p.lat, p.lon],
      category,
      kind: p.kind || 'Attraction',
      interests: Array.isArray(p.interests) && p.interests.length ? p.interests : [category],
      groups: Array.isArray(p.groups) && p.groups.length ? p.groups : [category],
      description: p.description,
      visitMinutes: { min: p.visit_min_minutes, max: p.visit_max_minutes },
      travelMinutes: p.travel_minutes,
      cost: p.cost_inr ?? 0,
      costNote: p.cost_note || (p.cost_inr > 0 ? `₹${p.cost_inr}` : 'Free entry'),
      highlights: p.highlights || [],
      tips: p.tips || [],
      imageUrl,
      image: imageUrl, // for SmartImage compatibility
      source: { label: 'AI Curated · Gemini', kind: 'gemini', coordsPrecision: 'ai_estimate' },
      live: false,
      isAi: true,
    }
  })

  const result = {
    places: formattedPlaces,
    origin: { label: resolvedLabel, coords: resolvedCoords },
    model: successfulModel,
  }

  cache.set(cacheKey, { at: Date.now(), data: result })
  if (cache.size > 100) {
    const oldestKey = cache.keys().next().value
    cache.delete(oldestKey)
  }

  return result
}
