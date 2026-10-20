import { GoogleGenAI, Type } from '@google/genai'
import { z } from 'zod'
import { CATEGORIES, IMPORTANCE, isDomesticTrip } from './checklistRules.js'

const SuggestionSchema = z.object({
  items: z
    .array(
      z.object({
        category: z.enum(CATEGORIES),
        title: z.string(),
        note: z.string().optional().default(''),
        importance: z.enum(IMPORTANCE),
        is_entry_requirement: z.boolean(),
      }),
    )
    .max(15),
})

const SYSTEM = `You help travellers prepare a packing and preparation checklist.
You will receive trip context and the checklist ORBIT already generated.
Suggest up to 12 ADDITIONAL items that are genuinely useful for this specific destination, season and trip purpose.

Rules:
- Do not repeat items that are already on the existing checklist.
- For domestic trips (is_domestic is true), do not suggest passports, visas, immigration, international adapters, or foreign currency exchange. Focus on domestic travel essentials.
- Never state that a visa, permit, vaccination or other entry requirement definitely applies or does not apply. If an item concerns an entry or legal requirement, set is_entry_requirement to true and phrase the title as something to check.
- Do not include URLs, phone numbers or document numbers.
- Keep titles under 70 characters and notes under 160 characters, practical and specific.`

/** Returns extra AI-suggested items, or null when AI is unavailable or fails (caller falls back to rules only). */
export async function suggestWithAi(config, trip, existingTitles) {
  if (!config.ai.enabled || !config.ai.hasCredentials) return null

  const apiKey =
    config.ai.apiKey ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_GENAI_API_KEY

  const client = new GoogleGenAI({ apiKey })
  const month = new Date(trip.departureAt).toLocaleString('en-GB', { month: 'long', timeZone: trip.departureTz })
  const isDomestic = isDomesticTrip({
    departureCountry: trip.departureCountry,
    departureCity: trip.departureCity,
    destinationCountry: trip.destinationCountry,
    destinationCity: trip.destinationCity,
    departureTz: trip.departureTz,
  })

  try {
    const userPrompt = JSON.stringify({
      departure_city: trip.departureCity || undefined,
      departure_country_code: trip.departureCountry || undefined,
      destination_city: trip.destinationCity,
      destination_country_code: trip.destinationCountry,
      is_domestic: isDomestic,
      purpose: trip.purpose,
      departure_month: month,
      existing_items: existingTitles,
    })

    const response = await client.models.generateContent({
      model: config.ai.model,
      contents: userPrompt,
      config: {
        systemInstruction: SYSTEM,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  category: {
                    type: Type.STRING,
                    enum: CATEGORIES,
                  },
                  title: { type: Type.STRING },
                  note: { type: Type.STRING },
                  importance: {
                    type: Type.STRING,
                    enum: IMPORTANCE,
                  },
                  is_entry_requirement: { type: Type.BOOLEAN },
                },
                required: ['category', 'title', 'note', 'importance', 'is_entry_requirement'],
              },
            },
          },
          required: ['items'],
        },
      },
    })

    const text = response.text
    if (!text) return null
    const parsed = JSON.parse(text)
    const validated = SuggestionSchema.safeParse(parsed)
    if (!validated.success || !validated.data.items?.length) return null

    return { items: sanitize(validated.data.items, existingTitles), model: config.ai.model }
  } catch (err) {
    if (err?.status === 429 || err?.message?.includes('429') || err?.message?.includes('RESOURCE_EXHAUSTED')) {
      console.warn('[ai] Gemini rate limited — using rule-based checklist')
    } else if (err?.status) {
      console.warn(`[ai] Gemini API error ${err.status} — using rule-based checklist:`, err.message)
    } else {
      console.warn('[ai] Gemini request failed — using rule-based checklist:', err.message)
    }
    return null
  }
}

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

/** Treat model output as untrusted: trim, strip links, de-duplicate, and never mark requirements as verified. */
export function sanitize(items, existingTitles) {
  const seen = new Set(existingTitles.map(norm))
  const out = []
  for (const item of items) {
    const title = (item.title || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 80)
    const note = (item.note || '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim().slice(0, 200)
    if (title.length < 3 || seen.has(norm(title))) continue
    seen.add(norm(title))
    out.push({
      category: item.category,
      title,
      note: note || null,
      importance: item.importance,
      applicable: true,
      ...(item.is_entry_requirement
        ? { kind: 'requirement', requirementStatus: 'unverified', note: `${note} Suggested by AI — confirm with an official source.`.trim() }
        : { kind: 'item' }),
    })
    if (out.length >= 12) break
  }
  return out
}
