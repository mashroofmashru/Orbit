import { z } from 'zod'
import { transaction } from '../db.js'
import { HttpError, newId, validate } from '../lib/http.js'
import { isValidTimeZone, zonedLocalToUtc } from '../lib/time.js'
import { suggestWithAi } from './ai.js'
import { buildRuleChecklist, CATEGORIES, IMPORTANCE, PURPOSES } from './checklistRules.js'
import { computeReadiness } from './readiness.js'

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' })
const countryCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Choose a country')
  .refine((c) => {
    // Intl returns "Unknown Region" (or the code itself) for codes that aren't real countries
    const name = regionNames.of(c)
    return Boolean(name) && name !== c && !/unknown/i.test(name)
  }, 'Choose a valid country')

const text = (max, label) => z.string().trim().min(1, `${label} is required`).max(max, `${label} is too long`)
const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null))

const notificationsSchema = z.object({
  remindersEnabled: z.boolean().default(true),
  updatesEnabled: z.boolean().default(false),
})

const tripCreateSchema = z.object({
  name: optionalText(60),
  departureCity: optionalText(80),
  departureCountry: countryCode.optional().nullable(),
  destinationCity: text(80, 'Destination city'),
  destinationCountry: countryCode,
  purpose: z.enum(PURPOSES),
  departureLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Choose a departure date and time'),
  departureTz: z.string().refine(isValidTimeZone, 'Choose a valid time zone'),
  notifications: notificationsSchema.optional(),
})

const tripUpdateSchema = z.object({
  name: optionalText(60),
  departureCity: optionalText(80),
  departureCountry: countryCode.optional().nullable(),
  departureLocal: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).optional(),
  departureTz: z.string().refine(isValidTimeZone).optional(),
})

// Privacy guard: never store document/account numbers in item text
const noLongNumbers = (v) => !v || !/\d{8,}/.test(v)
const NO_NUMBERS_MSG = 'Please don’t store document or account numbers here.'

const itemCreateSchema = z.object({
  category: z.enum(CATEGORIES),
  title: text(80, 'Item name').refine(noLongNumbers, NO_NUMBERS_MSG),
  note: optionalText(200).refine(noLongNumbers, NO_NUMBERS_MSG),
  importance: z.enum(IMPORTANCE).default('normal'),
})

const itemUpdateSchema = z
  .object({
    title: text(80, 'Item name').refine(noLongNumbers, NO_NUMBERS_MSG).optional(),
    note: optionalText(200).refine(noLongNumbers, NO_NUMBERS_MSG),
    importance: z.enum(IMPORTANCE).optional(),
    category: z.enum(CATEGORIES).optional(),
    completed: z.boolean().optional(),
    applicable: z.boolean().optional(),
    requirementStatus: z.enum(['unverified', 'verified']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')

// ── Row mappers ────────────────────────────────────────────────────────────
export const toTrip = (r) =>
  r && {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    departureCity: r.departure_city ?? null,
    departureCountry: r.departure_country ?? null,
    destinationCity: r.destination_city,
    destinationCountry: r.destination_country,
    purpose: r.purpose,
    departureLocal: r.departure_local,
    departureTz: r.departure_tz,
    departureAt: r.departure_at,
    checklistSource: r.checklist_source,
    aiModel: r.ai_model,
    createdAt: r.created_at,
  }

export const toItem = (r) => ({
  id: r.id,
  category: r.category,
  title: r.title,
  note: r.note,
  importance: r.importance,
  kind: r.kind,
  applicable: Boolean(r.applicable),
  applicabilityNote: r.applicability_note,
  requirementStatus: r.requirement_status,
  verifiedAt: r.verified_at,
  sourceUrl: r.source_url,
  sourceLabel: r.source_label,
  sourceAddedOn: r.source_added_on,
  origin: r.origin,
  completed: Boolean(r.completed),
  completedAt: r.completed_at,
  position: r.position,
})

export function createTripsService({ db, config, gamification, notifications, push }) {
  const loadTripRow = db.prepare('SELECT * FROM trips WHERE id = ?')
  const loadItemsStmt = db.prepare('SELECT * FROM checklist_items WHERE trip_id = ? ORDER BY category, position, created_at')
  const insertActivity = db.prepare('INSERT INTO activity (user_id, trip_id, type, message, created_at) VALUES (?, ?, ?, ?, ?)')

  const loadTrip = (id) => toTrip(loadTripRow.get(id))
  const loadItems = (tripId) => loadItemsStmt.all(tripId).map(toItem)

  /** Ownership check: the session user owns the trip, OR a valid signed link grants access to exactly this trip. */
  function authorize(req, tripId) {
    const trip = loadTrip(tripId)
    const viaLink = req.linkTripId && req.linkTripId === tripId
    if (!trip || (trip.userId !== req.user?.id && !viaLink)) throw new HttpError(404, 'Trip not found.')
    return trip
  }

  function insertItems(tripId, items, origin, now) {
    const stmt = db.prepare(
      `INSERT INTO checklist_items (id, trip_id, category, title, note, importance, kind, applicable, applicability_note,
         requirement_status, source_url, source_label, source_added_on, origin, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    const positions = {}
    for (const it of items) {
      positions[it.category] = (positions[it.category] ?? 0) + 1
      stmt.run(
        newId('itm'),
        tripId,
        it.category,
        it.title,
        it.note ?? null,
        it.importance,
        it.kind ?? 'item',
        it.applicable === false ? 0 : 1,
        it.applicabilityNote ?? null,
        it.kind === 'requirement' ? (it.requirementStatus ?? 'unverified') : null,
        it.sourceUrl ?? null,
        it.sourceLabel ?? null,
        it.sourceAddedOn ?? null,
        it.origin ?? origin,
        positions[it.category] * 10,
        now,
        now,
      )
    }
  }

  function savePrefs(trip, input, now) {
    const n = validate(notificationsSchema, input)
    db.prepare(
      `INSERT INTO notification_prefs (trip_id, user_id, reminders_enabled, updates_enabled, offsets_hours, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(trip_id) DO UPDATE SET reminders_enabled = excluded.reminders_enabled, updates_enabled = excluded.updates_enabled,
         offsets_hours = excluded.offsets_hours, updated_at = excluded.updated_at`,
    ).run(
      trip.id,
      trip.userId,
      n.remindersEnabled ? 1 : 0,
      n.updatesEnabled ? 1 : 0,
      config.reminders.offsetsHours.join(','), // fixed schedule (REMINDER_OFFSETS_HOURS)
      now,
    )
    if (!n.updatesEnabled) notifications.cancelPending(trip.id, 'update')
    notifications.scheduleReminders(trip) // also cancels pending reminders when they're turned off
  }

  function publicPrefs(tripId, userId) {
    const p = notifications.prefsFor(tripId)
    return {
      remindersEnabled: Boolean(p?.reminders_enabled),
      updatesEnabled: Boolean(p?.updates_enabled),
      offsetsHours: p ? p.offsets_hours.split(',').map(Number) : config.reminders.offsetsHours,
      // How many of the owner's devices will receive them (0 = turn notifications on somewhere)
      devices: push.count(userId),
      pushAvailable: push.enabled,
    }
  }

  function tripView(trip, req) {
    const items = loadItems(trip.id)
    const isOwner = trip.userId === req.user?.id
    return {
      trip,
      items,
      readiness: computeReadiness(items),
      notifications: isOwner ? publicPrefs(trip.id, trip.userId) : null,
      xpByItem: Object.fromEntries(items.map((i) => [i.id, i.origin === 'user' ? config.scoring.regularItem : gamification.itemXp(i)])),
      awardedItems: db
        .prepare(`SELECT event_key FROM xp_ledger WHERE trip_id = ? AND event_key LIKE 'item:%'`)
        .all(trip.id)
        .map((r) => r.event_key.split(':')[1]),
      access: isOwner ? 'owner' : 'link',
    }
  }

  async function createTrip(user, input) {
    const data = validate(tripCreateSchema, input)
    const departureAt = zonedLocalToUtc(data.departureLocal, data.departureTz)
    if (departureAt < Date.now() - 3600000) {
      throw new HttpError(400, 'Please check the highlighted fields.', { fields: { departureLocal: 'Departure must be in the future' } })
    }
    if (departureAt > Date.now() + 2 * 365 * 86400000) {
      throw new HttpError(400, 'Please check the highlighted fields.', { fields: { departureLocal: 'Choose a date within the next 2 years' } })
    }

    const tripLike = { ...data, departureAt }
    const rules = buildRuleChecklist(tripLike)
    // AI runs outside the DB transaction (network call), then everything is written atomically
    const ai = await suggestWithAi(config, tripLike, rules.map((r) => r.title))

    const now = Date.now()
    const id = newId('trp')
    return gamification.withLevelTracking(user.id, (events) =>
      transaction(db, () => {
        db.prepare(
          `INSERT INTO trips (id, user_id, name, departure_city, departure_country, destination_city, destination_country, purpose, departure_local, departure_tz,
             departure_at, checklist_source, ai_model, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          user.id,
          data.name,
          data.departureCity ?? null,
          data.departureCountry ?? null,
          data.destinationCity,
          data.destinationCountry,
          data.purpose,
          data.departureLocal,
          data.departureTz,
          departureAt,
          ai ? 'rules+ai' : 'rules',
          ai?.model ?? null,
          now,
          now,
        )
        insertItems(id, rules, 'rules', now)
        if (ai?.items.length) insertItems(id, ai.items, 'ai', now)
        insertActivity.run(user.id, id, 'trip', `Trip to ${data.destinationCity} created.`, now)
        const trip = loadTrip(id)
        gamification.onTripCreated(user.id, id, events)
        if (data.notifications) savePrefs(trip, data.notifications, now)
        return trip
      }),
    )
  }

  function listTrips(userId) {
    return db
      .prepare('SELECT * FROM trips WHERE user_id = ? ORDER BY departure_at ASC')
      .all(userId)
      .map(toTrip)
      .map((trip) => ({ ...trip, readiness: summarize(computeReadiness(loadItems(trip.id))) }))
  }

  const summarize = (r) => ({
    score: r.score,
    completed: r.completed,
    total: r.total,
    completionPct: r.completionPct,
    requirements: { status: r.requirements.status, total: r.requirements.total, verified: r.requirements.verified },
    criticalOutstanding: r.criticalOutstanding.slice(0, 5),
  })

  function updateTrip(req, tripId, input) {
    const trip = authorize(req, tripId)
    if (trip.userId !== req.user?.id) throw new HttpError(403, 'Only the trip owner can change trip details.')
    const data = validate(tripUpdateSchema, input)
    const departureLocal = data.departureLocal ?? trip.departureLocal
    const departureTz = data.departureTz ?? trip.departureTz
    const departureAt = zonedLocalToUtc(departureLocal, departureTz)
    db.prepare('UPDATE trips SET name = ?, departure_city = ?, departure_country = ?, departure_local = ?, departure_tz = ?, departure_at = ?, updated_at = ? WHERE id = ?').run(
      data.name !== undefined ? data.name : trip.name,
      data.departureCity !== undefined ? data.departureCity : trip.departureCity,
      data.departureCountry !== undefined ? data.departureCountry : trip.departureCountry,
      departureLocal,
      departureTz,
      departureAt,
      Date.now(),
      tripId,
    )
    const updated = loadTrip(tripId)
    if (updated.departureAt !== trip.departureAt) notifications.scheduleReminders(updated) // timezone-aware reschedule
    return updated
  }

  function deleteTrip(req, tripId) {
    const trip = authorize(req, tripId)
    if (trip.userId !== req.user?.id) throw new HttpError(403, 'Only the trip owner can delete a trip.')
    // XP ledger entries are kept (they record what was earned); jobs & items cascade
    db.prepare('DELETE FROM trips WHERE id = ?').run(tripId)
  }

  function addItem(req, tripId, input) {
    const trip = authorize(req, tripId)
    const data = validate(itemCreateSchema, input)
    const count = db.prepare('SELECT COUNT(*) AS n FROM checklist_items WHERE trip_id = ?').get(tripId).n
    if (count >= 150) throw new HttpError(400, 'This checklist is full (150 items).')
    const max = db.prepare('SELECT COALESCE(MAX(position), 0) AS p FROM checklist_items WHERE trip_id = ? AND category = ?').get(tripId, data.category).p
    const now = Date.now()
    const id = newId('itm')
    db.prepare(
      `INSERT INTO checklist_items (id, trip_id, category, title, note, importance, kind, applicable, origin, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'item', 1, 'user', ?, ?, ?)`,
    ).run(id, tripId, data.category, data.title, data.note, data.importance, max + 10, now, now)
    return { trip, item: toItem(db.prepare('SELECT * FROM checklist_items WHERE id = ?').get(id)) }
  }

  function getItem(tripId, itemId) {
    const row = db.prepare('SELECT * FROM checklist_items WHERE id = ? AND trip_id = ?').get(itemId, tripId)
    if (!row) throw new HttpError(404, 'Item not found.')
    return toItem(row)
  }

  /** The single path for item changes; all XP/achievement logic runs here, on the server. */
  function updateItem(req, tripId, itemId, input) {
    const trip = authorize(req, tripId)
    const data = validate(itemUpdateSchema, input)
    const before = getItem(tripId, itemId)
    if (data.requirementStatus && before.kind !== 'requirement') throw new HttpError(400, 'Only requirement items can be confirmed.')

    return gamification.withLevelTracking(trip.userId, (events) =>
      transaction(db, () => {
        const now = Date.now()
        const next = { ...before, ...data }
        db.prepare(
          `UPDATE checklist_items SET title = ?, note = ?, importance = ?, category = ?, completed = ?, completed_at = ?, applicable = ?,
             requirement_status = ?, verified_at = ?, updated_at = ? WHERE id = ?`,
        ).run(
          next.title,
          data.note !== undefined ? data.note : before.note,
          next.importance,
          next.category,
          next.completed ? 1 : 0,
          next.completed ? (before.completed ? before.completedAt : now) : null,
          next.applicable ? 1 : 0,
          before.kind === 'requirement' ? next.requirementStatus : null,
          before.kind === 'requirement' && next.requirementStatus === 'verified' ? (before.verifiedAt ?? now) : null,
          now,
          itemId,
        )
        const item = getItem(tripId, itemId)
        if (item.completed && !before.completed) {
          gamification.onItemCompleted(trip.userId, trip, item, events)
          insertActivity.run(trip.userId, tripId, 'item', `${item.title} marked as ${item.category === 'documents' ? 'checked' : 'packed'}.`, now)
        }
        if (item.requirementStatus === 'verified' && before.requirementStatus !== 'verified') {
          insertActivity.run(trip.userId, tripId, 'verify', `You confirmed “${item.title}” with an official source.`, now)
        }
        const items = loadItems(tripId)
        const readiness = gamification.evaluateTrip(trip.userId, trip, items, events, now)
        milestoneActivity(trip, readiness)
        if (item.completed !== before.completed) notifications.queueUpdate(trip)
        return { item, readiness }
      }),
    )
  }

  /** "Checklist reached 75%" style activity entries, recorded once per milestone. */
  function milestoneActivity(trip, readiness) {
    for (const pct of [25, 75]) {
      if (readiness.completionPct < pct) continue
      const type = `milestone${pct}`
      const exists = db.prepare('SELECT 1 FROM activity WHERE trip_id = ? AND type = ?').get(trip.id, type)
      if (!exists) insertActivity.run(trip.userId, trip.id, type, `${trip.name || trip.destinationCity} checklist reached ${pct}%.`, Date.now())
    }
  }

  function deleteItem(req, tripId, itemId) {
    const trip = authorize(req, tripId)
    getItem(tripId, itemId)
    db.prepare('DELETE FROM checklist_items WHERE id = ?').run(itemId)
    return { trip, readiness: computeReadiness(loadItems(tripId)) }
  }

  function reorder(req, tripId, input) {
    authorize(req, tripId)
    const data = validate(z.object({ category: z.enum(CATEGORIES), orderedIds: z.array(z.string()).max(150) }), input)
    const ids = new Set(db.prepare('SELECT id FROM checklist_items WHERE trip_id = ? AND category = ?').all(tripId, data.category).map((r) => r.id))
    if (data.orderedIds.length !== ids.size || !data.orderedIds.every((id) => ids.has(id))) throw new HttpError(400, 'Order does not match this category.')
    transaction(db, () => {
      const stmt = db.prepare('UPDATE checklist_items SET position = ?, updated_at = ? WHERE id = ?')
      data.orderedIds.forEach((id, i) => stmt.run((i + 1) * 10, Date.now(), id))
    })
    return loadItems(tripId)
  }

  function setNotifications(req, tripId, input) {
    const trip = authorize(req, tripId)
    if (trip.userId !== req.user?.id) throw new HttpError(403, 'Only the trip owner can change notifications.')
    savePrefs(trip, input, Date.now())
    return publicPrefs(tripId, trip.userId)
  }

  function messages(req, tripId) {
    const trip = authorize(req, tripId)
    if (trip.userId !== req.user?.id) throw new HttpError(403, 'Only the trip owner can view messages.')
    return {
      messages: db
        .prepare('SELECT id, kind, provider, to_masked, body_preview, status, error, created_at, updated_at FROM message_log WHERE trip_id = ? ORDER BY created_at DESC LIMIT 20')
        .all(tripId),
      scheduled: db
        .prepare(`SELECT id, kind, run_at, status, attempts, last_error FROM jobs WHERE trip_id = ? AND status IN ('pending','running','failed') ORDER BY run_at`)
        .all(tripId),
    }
  }

  return {
    loadTrip,
    loadItems,
    authorize,
    tripView,
    createTrip,
    listTrips,
    updateTrip,
    deleteTrip,
    addItem,
    updateItem,
    deleteItem,
    reorder,
    setNotifications,
    messages,
  }
}
