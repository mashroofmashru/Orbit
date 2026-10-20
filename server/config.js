import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const env = process.env

function list(value, fallback) {
  if (!value) return fallback
  return value
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
}

// ── Scoring (server-side source of truth; override with ORBIT_SCORING_JSON) ──
const DEFAULT_SCORING = {
  tripCreated: 50,
  essentialDocumentItem: 20,
  regularItem: 10,
  categoryComplete: 50,
  halfway: 25,
  fullComplete: 100,
  earlyBird: 50,
  // Anti-farming limits
  minItemsForBonuses: 8, // completion bonuses need a real checklist, not a 1-item one
  minItemsForCategoryBonus: 2,
  maxCustomItemAwardsPerTrip: 5, // user-added items earn XP, but only for the first few per trip
  maxTripCreationAwardsPer30Days: 5,
  earlyBirdHoursBeforeDeparture: 24,
}

function scoring() {
  if (!env.ORBIT_SCORING_JSON) return DEFAULT_SCORING
  try {
    return { ...DEFAULT_SCORING, ...JSON.parse(env.ORBIT_SCORING_JSON) }
  } catch {
    console.warn('[config] ORBIT_SCORING_JSON is not valid JSON — using default scoring')
    return DEFAULT_SCORING
  }
}

function linkSecret() {
  if (env.LINK_SIGNING_SECRET) return env.LINK_SIGNING_SECRET
  if (env.NODE_ENV === 'production') throw new Error('LINK_SIGNING_SECRET must be set in production')
  // Development: per-process random secret (links stop working after a restart, which is fine locally)
  return crypto.randomBytes(32).toString('hex')
}

export function loadConfig(overrides = {}) {
  const appBaseUrl = (env.APP_BASE_URL || 'http://localhost:5174').replace(/\/$/, '')
  return {
    env: env.NODE_ENV || 'development',
    port: Number(env.PORT || 8787),
    dbPath: env.ORBIT_DB_PATH || path.join(here, 'data', 'orbit.db'),
    appBaseUrl,
    linkSecret: linkSecret(),
    linkTtlHours: Number(env.LINK_TTL_HOURS || 72),
    secureCookies: env.NODE_ENV === 'production',
    ai: {
      enabled: env.ORBIT_AI_ENABLED !== 'false',
      apiKey: env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GOOGLE_GENAI_API_KEY || '',
      hasCredentials: Boolean(env.GEMINI_API_KEY || env.GOOGLE_API_KEY || env.GOOGLE_GENAI_API_KEY),
      model: env.ORBIT_AI_MODEL || 'gemini-2.5-flash',
      timeoutMs: Number(env.ORBIT_AI_TIMEOUT_MS || 60000),
    },
    // Web push for trip reminders. The VAPID subject must be a mailto: or https: URL.
    push: {
      publicKey: env.VAPID_PUBLIC_KEY || '',
      privateKey: env.VAPID_PRIVATE_KEY || '',
      subject: env.VAPID_SUBJECT || (appBaseUrl.startsWith('https://') ? appBaseUrl : ''),
    },
    reminders: {
      offsetsHours: list(env.REMINDER_OFFSETS_HOURS, [24, 3]),
      updateBatchSeconds: Number(env.UPDATE_BATCH_SECONDS || 120),
      maxAttempts: Number(env.JOB_MAX_ATTEMPTS || 4),
    },
    schedulerIntervalMs: Number(env.SCHEDULER_INTERVAL_MS || 15000),
    scoring: scoring(),
    ...overrides,
  }
}
