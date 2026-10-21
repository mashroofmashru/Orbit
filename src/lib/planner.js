import { HUBS } from '../data/adventures'
import { WORLD_DESTINATIONS } from '../data/destinations'
import { haversineKm } from '../utils/distanceUtils'
import { BUDGET_OPTIONS, LIMITS } from '../data/options'
import { formatMinutes } from './format'

// ── Assumptions used by the demo planner ────────────────────────────────────
const ROUTE_FACTOR = 1.3 // straight-line → street distance
const WALK_KMH = 4.5
const MAX_WALK_MIN = 15 // beyond this we suggest an auto/taxi
const RIDE_KMH = 14 // typical city traffic
const RIDE_PICKUP_MIN = 5
const RIDE_BASE_FARE = 30
const RIDE_PER_KM = 16
const HUB_RADIUS_KM = 25
const SHORT_WINDOW_BUFFER = 5
const MIN_USABLE = 8

// Single source for geographic distance (straight-line); re-exported for existing callers
export { haversineKm }

// ── Inputs ──────────────────────────────────────────────────────────────────
function getSelectedDuration(prefs) {
  if (prefs.durationOption === 'custom') {
    const n = Number(prefs.customDuration)
    return Number.isFinite(n) ? Math.round(n) : NaN
  }
  return Number(prefs.durationOption)
}

export function getBudget(prefs) {
  if (prefs.budgetOption === 'custom') {
    const n = Number(prefs.customBudget)
    return Number.isFinite(n) ? n : NaN
  }
  return BUDGET_OPTIONS.find((b) => b.id === prefs.budgetOption)?.value ?? 300
}

export function validateDuration(prefs) {
  if (prefs?.deadline) return null
  const d = getSelectedDuration(prefs)
  if (prefs?.durationOption === 'custom' && String(prefs.customDuration).trim() === '')
    return 'Enter how many minutes you have.'
  const raw = prefs?.durationOption === 'custom' ? Number(prefs.customDuration) : d
  if (!Number.isInteger(raw)) return 'Enter a whole number of minutes.'
  if (d < LIMITS.minDuration) return `Enter at least ${LIMITS.minDuration} minutes.`
  if (d > LIMITS.maxDuration) return `ORBIT plans short breaks — enter ${LIMITS.maxDuration} minutes or less.`
  return null
}

export function validateBudget(prefs) {
  if (prefs.budgetOption !== 'custom') return null
  if (String(prefs.customBudget).trim() === '') return 'Enter a budget amount.'
  const b = Number(prefs.customBudget)
  if (!Number.isFinite(b)) return 'Enter a valid amount.'
  if (b < 0) return 'Budget cannot be negative.'
  if (b > LIMITS.maxBudget) return 'That budget is higher than ORBIT needs — try a smaller amount.'
  return null
}

/** Minutes from `now` until an "HH:MM" local time. Rolls to tomorrow if already passed. */
export function minutesUntil(deadline, now = new Date()) {
  if (!deadline) return null
  const [h, m] = deadline.split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const target = new Date(now)
  target.setHours(h, m, 0, 0)
  let rolled = false
  if (target <= now) {
    target.setDate(target.getDate() + 1)
    rolled = true
  }
  return { minutes: Math.floor((target - now) / 60000), target, rolled }
}

/**
 * Works out the real time window: calculated from the return deadline (current time to entered time),
 * minus the safety buffer.
 */
export function computeWindow(prefs, now = new Date()) {
  const notices = []
  const errors = []
  let buffer = Number(prefs?.buffer) || 0
  let deadlineAt = null
  let windowMinutes

  const until = minutesUntil(prefs?.deadline, now)

  if (until) {
    deadlineAt = until.target
    if (until.rolled && until.minutes > 12 * 60) {
      errors.push({ field: 'deadline', text: 'That return time has already passed today. Choose a time later than now.' })
    } else if (until.rolled) {
      notices.push({ field: 'deadline', tone: 'info', text: `Return time is tomorrow — ${formatMinutes(until.minutes)} from now.` })
    }
    // Calculate remaining time directly from current time to entered return time
    windowMinutes = Math.max(0, until.minutes)
  } else {
    const durationError = validateDuration(prefs)
    if (durationError) errors.push({ field: 'duration', text: durationError })
    const selected = getSelectedDuration(prefs || {})
    windowMinutes = Number.isFinite(selected) && selected > 0 ? selected : 60
  }

  // Very short windows: trim the buffer so a quick adventure is still possible (and say so)
  if (!errors.length && windowMinutes <= 20 && buffer > SHORT_WINDOW_BUFFER) {
    notices.push({
      field: 'buffer',
      tone: 'warning',
      text: `With only ${windowMinutes} min, we've trimmed your safety buffer from ${buffer} to ${SHORT_WINDOW_BUFFER} min so there's time for a quick adventure. Stay close by.`,
    })
    buffer = SHORT_WINDOW_BUFFER
  }

  const usableMinutes = windowMinutes - buffer
  if (!errors.length && usableMinutes < MIN_USABLE) {
    errors.push({
      field: 'window',
      text: `After your ${buffer}-min safety buffer, only ${Math.max(0, usableMinutes)} min would be left. Choose a later return time or a smaller buffer.`,
    })
  }

  return { selected: windowMinutes, windowMinutes, buffer, usableMinutes, deadlineAt, notices, errors }
}

// ── Location ────────────────────────────────────────────────────────────────
export function resolveStart(location) {
  if (location?.coords) {
    const nearest = HUBS.map((h) => ({ hub: h, km: haversineKm(location.coords, h.coords) })).sort(
      (a, b) => a.km - b.km,
    )[0]
    return {
      label: location.label || 'Your current location',
      coords: location.coords,
      hub: nearest && nearest.km <= HUB_RADIUS_KM ? nearest.hub : null,
      source: 'geo',
    }
  }
  const text = (location?.label || '').trim().toLowerCase()
  const hub = text ? HUBS.find((h) => h.aliases.some((a) => text.includes(a))) : null
  // Major global & domestic cities typed by name get real coordinates immediately
  const district = !hub && text
    ? WORLD_DESTINATIONS.find((d) => {
        const cleanName = d.name.toLowerCase().split(',')[0].trim()
        return (
          text.includes(cleanName) ||
          cleanName.includes(text) ||
          (d.aliases && d.aliases.some((a) => text.includes(a) || a.includes(text)))
        )
      })
    : null
  if (district) return { label: location.label.trim(), coords: district.coords, hub: null, source: 'manual' }
  return {
    label: location?.label?.trim() || 'Your location',
    coords: hub ? hub.coords : null,
    hub,
    source: 'manual',
  }
}

// ── Planning a single activity ──────────────────────────────────────────────
/** Travel estimate from a STRAIGHT-LINE distance (adds the street allowance). An estimate, not a routed time. */
export function estimateFromStraightLine(km) {
  return { ...estimateTravel(km * ROUTE_FACTOR), streetKm: km * ROUTE_FACTOR }
}

function estimateTravel(distanceKm) {
  const streetKm = distanceKm
  const walkMin = Math.max(2, Math.round((streetKm / WALK_KMH) * 60))
  if (walkMin <= MAX_WALK_MIN) return { mode: 'walk', minutes: walkMin, fare: 0 }
  const rideMin = Math.round(RIDE_PICKUP_MIN + (streetKm / RIDE_KMH) * 60)
  const fare = Math.round((RIDE_BASE_FARE + streetKm * RIDE_PER_KM) / 10) * 10
  return { mode: 'ride', minutes: rideMin, fare, walkMinutes: walkMin }
}

/**
 * Plans one activity inside a time window.
 * `win` is the object from computeWindow().
 */
export function planActivity(activity, start, win) {
  const usableMinutes = win.usableMinutes
  const distanceKm =
    activity.generic || !start.coords || !activity.coords
      ? activity.distanceKm ?? 0.3
      : haversineKm(start.coords, activity.coords) * ROUTE_FACTOR
  const travel = estimateTravel(distanceKm)
  const travelTotal = travel.minutes * 2
  const timeForActivity = usableMinutes - travelTotal
  const activityMinutes = Math.max(0, Math.min(activity.duration.max, timeForActivity))
  const fitsTime = timeForActivity >= activity.duration.min
  const transportCost = travel.fare * 2
  const spareMinutes = Math.max(0, usableMinutes - travelTotal - activityMinutes)
  return {
    distanceKm,
    travelMode: travel.mode,
    travelOneWay: travel.minutes,
    walkMinutes: travel.walkMinutes,
    activityMinutes,
    totalMinutes: travelTotal + activityMinutes,
    spareMinutes,
    transportCost,
    // Unknown entry prices stay unknown: only the transport estimate is counted, and the UI says so
    totalCost: (activity.cost ?? 0) + transportCost,
    priceUnknown: activity.cost == null,
    fitsTime,
    safety: describeSafety({
      windowMinutes: win.windowMinutes,
      outbound: travel.minutes,
      returnTravel: travel.minutes,
      buffer: win.buffer,
      activityMinutes,
      spareMinutes,
      fits: fitsTime,
    }),
  }
}

// ── Return-Time Safety Meter ────────────────────────────────────────────────
/**
 * The single source of truth for "how safe is this plan?", used by cards,
 * details and the live countdown.
 *   usable activity time = window − outbound travel − return travel − safety buffer
 *   margin               = safety buffer + any spare minutes
 */
export function describeSafety({ windowMinutes, outbound, returnTravel, buffer, activityMinutes, spareMinutes = 0, fits = true }) {
  const usableActivityMinutes = Math.max(0, windowMinutes - outbound - returnTravel - buffer)
  const margin = Math.max(0, buffer) + Math.max(0, spareMinutes)
  let level
  if (!fits) level = 'over'
  else if (margin >= 15) level = 'comfortable'
  else if (margin >= 8) level = 'balanced'
  else level = 'tight'
  return {
    windowMinutes,
    outbound,
    returnTravel,
    buffer,
    activityMinutes,
    spareMinutes,
    usableActivityMinutes,
    margin,
    level,
    ...SAFETY_LEVELS[level],
  }
}

const SAFETY_LEVELS = {
  comfortable: { label: 'Comfortable', tone: 'success', hint: 'Plenty of margin to get back on time.' },
  balanced: { label: 'Balanced', tone: 'info', hint: 'A sensible margin — keep an eye on the clock.' },
  tight: { label: 'Tight', tone: 'warning', hint: 'Little room for delays. Stay close and leave on time.' },
  over: { label: 'Doesn’t fit', tone: 'error', hint: 'This needs more time than your window allows.' },
}

/** Rebuilds the safety meter from a live adventure's timestamps (accounts for any snooze). */
export function safetyFromActive(active) {
  const min = (ms) => Math.max(0, Math.round(ms / 60000))
  const travel = active.travelOneWay
  const windowMinutes = min(active.returnBy - active.startedAt)
  // Time between arriving and the latest safe leave time = planned activity + spare
  const usable = min(active.leaveBy - active.arriveAt)
  const activityMinutes = Math.min(active.plannedActivity ?? usable, usable)
  // Snoozing moves leaveBy later, which eats into the buffer — derive it from the timeline
  const buffer = Math.max(0, windowMinutes - travel * 2 - usable)
  return describeSafety({
    windowMinutes,
    outbound: travel,
    returnTravel: travel,
    buffer,
    activityMinutes,
    spareMinutes: usable - activityMinutes,
  })
}
