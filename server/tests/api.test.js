import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { boot, localIn, tripInput } from './helpers.js'

describe('sessions, ownership and CSRF', () => {
  let ctx
  before(async () => (ctx = await boot()))
  after(() => ctx.close())

  test('mutations without the client header are rejected', async () => {
    const c = ctx.client()
    const r = await c.post('/api/session', {}, { 'X-Orbit-Client': '' })
    assert.equal(r.status, 403)
  })

  test('another user cannot read or modify my trip', async () => {
    const a = await ctx.client().login()
    const b = await ctx.client().login()
    const created = await a.post('/api/trips', tripInput())
    assert.equal(created.status, 201)
    const tripId = created.body.trip.id
    const itemId = created.body.items[0].id

    assert.equal((await b.get(`/api/trips/${tripId}`)).status, 404)
    assert.equal((await b.patch(`/api/trips/${tripId}/items/${itemId}`, { completed: true })).status, 404)
    assert.equal((await b.del(`/api/trips/${tripId}`)).status, 404)
    assert.equal((await ctx.client().get(`/api/trips/${tripId}`)).status, 401)
  })

  test('validation errors name the field', async () => {
    const a = await ctx.client().login()
    const r = await a.post('/api/trips', tripInput({ destinationCountry: 'ZZ', departureLocal: localIn(-48) }))
    assert.equal(r.status, 400)
    assert.ok(r.body.details.fields.destinationCountry)
  })
})

describe('checklist generation', () => {
  let ctx
  before(async () => (ctx = await boot()))
  after(() => ctx.close())

  test('international trip: requirements are unverified, never asserted; official source attached', async () => {
    const a = await ctx.client().login()
    const r = await a.post('/api/trips', tripInput())
    const visa = r.body.items.find((i) => i.title.startsWith('Visa'))
    assert.equal(visa.kind, 'requirement')
    assert.equal(visa.requirementStatus, 'unverified')
    assert.equal(visa.applicable, true)
    assert.match(visa.sourceUrl, /^https:\/\/u\.ae\//)
    assert.equal(r.body.trip.checklistSource, 'rules')
    assert.equal(r.body.readiness.requirements.status, 'needs_confirmation')
    const categories = new Set(r.body.items.map((i) => i.category))
    assert.equal(categories.size, 7)
  })

  test('no nationality is collected: document checks are always included, unverified, for the traveller to confirm', async () => {
    const a = await ctx.client().login()
    const r = await a.post('/api/trips', tripInput({ destinationCity: 'Mumbai', destinationCountry: 'IN' }))
    assert.equal(r.status, 201)
    assert.ok(!('nationality' in r.body.trip))
    for (const title of ['Passport', 'Visa or entry authorisation — check if you need one']) {
      const item = r.body.items.find((i) => i.title === title)
      assert.equal(item.applicable, true)
      assert.equal(item.requirementStatus, 'unverified')
    }
  })

  test('domestic trip: passport and visa are not included; government-issued photo ID is required', async () => {
    const a = await ctx.client().login()
    const r = await a.post(
      '/api/trips',
      tripInput({
        departureCity: 'Kozhikode',
        departureCountry: 'IN',
        destinationCity: 'Mumbai',
        destinationCountry: 'IN',
      }),
    )
    assert.equal(r.status, 201)
    assert.equal(r.body.trip.departureCity, 'Kozhikode')
    assert.equal(r.body.trip.departureCountry, 'IN')
    assert.equal(r.body.trip.destinationCity, 'Mumbai')
    assert.equal(r.body.trip.destinationCountry, 'IN')

    // Passport and visa should NOT be present on a domestic trip
    assert.equal(r.body.items.some((i) => i.title === 'Passport'), false)
    assert.equal(r.body.items.some((i) => i.title.startsWith('Visa')), false)

    // Government-issued photo ID should be present
    const photoId = r.body.items.find((i) => i.title === 'Government-issued photo ID')
    assert.ok(photoId, 'Government-issued photo ID should be included')
    assert.equal(photoId.importance, 'critical')
    assert.equal(photoId.applicable, true)
  })
})

describe('XP, bonuses and achievements', () => {
  let ctx
  before(async () => (ctx = await boot()))
  after(() => ctx.close())

  const xpFor = (ctx, userId) => ctx.gamification.totalXp(userId)
  const ledger = (ctx, tripId) => ctx.db.prepare('SELECT event_key, amount FROM xp_ledger WHERE trip_id = ? ORDER BY id').all(tripId)

  test('trip creation awards 50 XP + First Adventure exactly once', async () => {
    const a = await ctx.client().login()
    const r = await a.post('/api/trips', tripInput())
    assert.deepEqual(
      r.body.events.map((e) => e.type),
      ['xp', 'achievement'],
    )
    assert.equal(r.body.level.xp, 50)
    const r2 = await a.post('/api/trips', tripInput({ destinationCity: 'London', destinationCountry: 'GB' }))
    assert.ok(!r2.body.events.some((e) => e.type === 'achievement'), 'First Adventure is not re-awarded')
  })

  test('checking, unchecking and re-checking an item awards XP once', async () => {
    const a = await ctx.client().login()
    const { body } = await a.post('/api/trips', tripInput())
    const userId = ctx.trips.loadTrip(body.trip.id).userId
    const passport = body.items.find((i) => i.title === 'Passport')
    const start = xpFor(ctx, userId)

    const first = await a.patch(`/api/trips/${body.trip.id}/items/${passport.id}`, { completed: true })
    assert.deepEqual(first.body.events, [{ type: 'xp', amount: 20, reason: 'essential document checked' }])
    for (let i = 0; i < 5; i++) {
      await a.patch(`/api/trips/${body.trip.id}/items/${passport.id}`, { completed: false })
      const again = await a.patch(`/api/trips/${body.trip.id}/items/${passport.id}`, { completed: true })
      assert.deepEqual(again.body.events, [])
    }
    assert.equal(xpFor(ctx, userId), start + 20)
  })

  test('client-supplied XP / score fields are ignored', async () => {
    const a = await ctx.client().login()
    const { body } = await a.post('/api/trips', tripInput())
    const item = body.items.find((i) => i.category === 'money')
    const r = await a.patch(`/api/trips/${body.trip.id}/items/${item.id}`, { completed: true, xp: 9999, score: 100 })
    assert.equal(r.status, 200)
    assert.equal(r.body.events.find((e) => e.type === 'xp').amount, 10)
  })

  test('item text with document/account numbers is rejected on the server', async () => {
    const a = await ctx.client().login()
    const { body } = await a.post('/api/trips', tripInput())
    const r = await a.post('/api/trips/' + body.trip.id + '/items', { category: 'documents', title: 'Passport no 123456789' })
    assert.equal(r.status, 400)
    const ok = await a.post('/api/trips/' + body.trip.id + '/items', { category: 'documents', title: 'Train 12951 seat' })
    assert.equal(ok.status, 201)
  })

  test('custom items earn XP only for the first 5 per trip (no add/check/delete farming)', async () => {
    const a = await ctx.client().login()
    const { body } = await a.post('/api/trips', tripInput())
    let earned = 0
    for (let i = 0; i < 8; i++) {
      const added = await a.post(`/api/trips/${body.trip.id}/items`, { category: 'clothing', title: `Scarf ${i}` })
      const done = await a.patch(`/api/trips/${body.trip.id}/items/${added.body.item.id}`, { completed: true })
      earned += done.body.events.filter((e) => e.reason === 'your own item packed').reduce((n, e) => n + e.amount, 0)
      await a.del(`/api/trips/${body.trip.id}/items/${added.body.item.id}`)
    }
    assert.equal(earned, 50)
  })

  test('completing everything awards category, 50%, 100% and early-bird bonuses once each', async () => {
    const a = await ctx.client().login()
    const { body } = await a.post('/api/trips', tripInput())
    const applicable = body.items.filter((i) => i.applicable)
    const types = []
    for (const it of applicable) {
      const r = await a.patch(`/api/trips/${body.trip.id}/items/${it.id}`, { completed: true })
      types.push(...r.body.events)
    }
    const keys = ledger(ctx, body.trip.id).map((l) => l.event_key)
    assert.equal(new Set(keys).size, keys.length, 'no duplicate ledger keys')
    assert.equal(keys.filter((k) => k.endsWith(':half')).length, 1)
    assert.equal(keys.filter((k) => k.endsWith(':full')).length, 1)
    assert.equal(keys.filter((k) => k.endsWith(':early')).length, 1)
    assert.equal(keys.filter((k) => k.includes(':category:')).length, 7)
    const badges = types.filter((e) => e.type === 'achievement').map((e) => e.id)
    for (const id of ['document_defender', 'halfway_hero', 'fully_packed', 'early_bird', 'organized_traveler']) assert.ok(badges.includes(id), id)
    assert.ok(types.some((e) => e.type === 'levelup'))

    // Uncheck + re-check the last item: nothing new is awarded
    const last = applicable.at(-1)
    await a.patch(`/api/trips/${body.trip.id}/items/${last.id}`, { completed: false })
    const again = await a.patch(`/api/trips/${body.trip.id}/items/${last.id}`, { completed: true })
    assert.deepEqual(again.body.events, [])
  })

  test('no early-bird bonus when finishing inside 24h of departure', async () => {
    const a = await ctx.client().login()
    const { body } = await a.post('/api/trips', tripInput({ departureLocal: localIn(5) }))
    for (const it of body.items.filter((i) => i.applicable)) await a.patch(`/api/trips/${body.trip.id}/items/${it.id}`, { completed: true })
    const keys = ledger(ctx, body.trip.id).map((l) => l.event_key)
    assert.ok(keys.some((k) => k.endsWith(':full')))
    assert.ok(!keys.some((k) => k.endsWith(':early')))
  })

  test('tiny checklists do not earn completion bonuses', async () => {
    const a = await ctx.client().login()
    const { body } = await a.post('/api/trips', tripInput())
    const keep = body.items.slice(0, 3)
    for (const it of body.items.slice(3)) await a.del(`/api/trips/${body.trip.id}/items/${it.id}`)
    for (const it of keep) await a.patch(`/api/trips/${body.trip.id}/items/${it.id}`, { completed: true, applicable: true })
    const keys = ledger(ctx, body.trip.id).map((l) => l.event_key)
    assert.ok(!keys.some((k) => k.endsWith(':full') || k.endsWith(':half')))
  })

  test('trip-creation XP is capped per 30 days', async () => {
    const a = await ctx.client().login()
    let xp = 0
    for (let i = 0; i < 7; i++) {
      const r = await a.post('/api/trips', tripInput({ destinationCity: `City ${i}` }))
      xp += r.body.events.filter((e) => e.type === 'xp').reduce((n, e) => n + e.amount, 0)
    }
    assert.equal(xp, 5 * 50)
  })
})

describe('readiness score', () => {
  let ctx
  before(async () => (ctx = await boot()))
  after(() => ctx.close())

  test('weighted by importance; N/A items excluded; requirement status separate', async () => {
    const a = await ctx.client().login()
    const { body } = await a.post('/api/trips', tripInput())
    const critical = body.items.find((i) => i.importance === 'critical' && i.applicable)
    const optional = body.items.find((i) => i.importance === 'optional')
    const c = await a.patch(`/api/trips/${body.trip.id}/items/${critical.id}`, { completed: true })
    const fresh = await (await ctx.client().login()).post('/api/trips', tripInput())
    const o = await (async () => {
      const b = await ctx.client().login()
      const t = await b.post('/api/trips', tripInput())
      const opt = t.body.items.find((i) => i.title === optional.title)
      return b.patch(`/api/trips/${t.body.trip.id}/items/${opt.id}`, { completed: true })
    })()
    assert.ok(c.body.readiness.score > o.body.readiness.score, 'critical item moves the score more than an optional one')
    assert.equal(fresh.body.readiness.score, 0)

    // Marking an item N/A removes it from the denominator
    const before = c.body.readiness.total
    const insurance = body.items.find((i) => i.title === 'Travel insurance documents')
    const na = await a.patch(`/api/trips/${body.trip.id}/items/${insurance.id}`, { applicable: false })
    assert.equal(na.body.readiness.total, before - 1)

    // Confirming a requirement changes requirement status, never readiness to "legally ready"
    const visa = body.items.find((i) => i.title.startsWith('Visa'))
    const v = await a.patch(`/api/trips/${body.trip.id}/items/${visa.id}`, { requirementStatus: 'verified' })
    assert.equal(v.body.item.requirementStatus, 'verified')
    assert.ok(v.body.item.verifiedAt)
    assert.ok(['needs_confirmation', 'all_confirmed'].includes(v.body.readiness.requirements.status))

    const bad = await a.patch(`/api/trips/${body.trip.id}/items/${critical.id === visa.id ? optional.id : body.items.find((i) => i.kind === 'item').id}`, {
      requirementStatus: 'verified',
    })
    assert.equal(bad.status, 400)
  })
})

describe('trip reminders (scheduling)', () => {
  let ctx
  before(async () => (ctx = await boot()))
  after(() => ctx.close())

  const jobs = (tripId) => ctx.db.prepare('SELECT * FROM jobs WHERE trip_id = ? ORDER BY id').all(tripId)
  const withReminders = (extra = {}) => tripInput({ notifications: { remindersEnabled: true, updatesEnabled: true }, ...extra })

  test('reminders are off unless turned on: no jobs, no stored contact details', async () => {
    const a = await ctx.client().login()
    const r = await a.post('/api/trips', tripInput())
    assert.equal(r.body.notifications.remindersEnabled, false)
    assert.equal(jobs(r.body.trip.id).length, 0)
    const off = await a.post('/api/trips', tripInput({ notifications: { remindersEnabled: false } }))
    assert.equal(jobs(off.body.trip.id).length, 0)
    assert.ok(!('whatsapp_e164' in ctx.db.prepare('SELECT * FROM notification_prefs WHERE trip_id = ?').get(off.body.trip.id)))
  })

  test('reminders scheduled at 24h and 3h; past offsets skipped; departure change reschedules without duplicates', async () => {
    const a = await ctx.client().login()
    const r = await a.post('/api/trips', withReminders())
    const id = r.body.trip.id
    assert.equal(r.body.notifications.remindersEnabled, true)
    assert.equal(r.body.notifications.devices, 0)
    let pending = jobs(id).filter((j) => j.status === 'pending' && j.kind === 'reminder')
    assert.equal(pending.length, 2)

    // Same departure again → no new rows
    ctx.notifications.scheduleReminders(ctx.trips.loadTrip(id))
    assert.equal(jobs(id).filter((j) => j.kind === 'reminder').length, 2)

    // Change departure to 5h from now (Asia/Kolkata wall clock) → old cancelled, only the 3h reminder is still in the future
    const local = new Date(Date.now() + 5 * 3600000 + 5.5 * 3600000).toISOString().slice(0, 16)
    await a.patch(`/api/trips/${id}`, { departureLocal: local, departureTz: 'Asia/Kolkata' })
    pending = jobs(id).filter((j) => j.status === 'pending' && j.kind === 'reminder')
    assert.equal(pending.length, 1)
    assert.ok(Math.abs(pending[0].run_at - (Date.now() + 2 * 3600000)) < 120000)
  })

  test('rapid checks are batched into a single update job', async () => {
    const a = await ctx.client().login()
    const { body } = await a.post('/api/trips', withReminders())
    for (const it of body.items.slice(0, 4)) await a.patch(`/api/trips/${body.trip.id}/items/${it.id}`, { completed: true })
    assert.equal(jobs(body.trip.id).filter((j) => j.kind === 'update' && j.status === 'pending').length, 1)
  })

  test('the schedule is fixed server-side; turning reminders and updates off cancels pending jobs', async () => {
    const a = await ctx.client().login()
    const { body } = await a.post('/api/trips', withReminders())
    const id = body.trip.id
    const r = await a.put(`/api/trips/${id}/notifications`, { remindersEnabled: true, updatesEnabled: true, offsetsHours: [1] })
    assert.equal(r.status, 200)
    assert.deepEqual(r.body.notifications.offsetsHours, [24, 3])

    await a.patch(`/api/trips/${id}/items/${body.items[0].id}`, { completed: true })
    const off = await a.put(`/api/trips/${id}/notifications`, { remindersEnabled: false, updatesEnabled: false })
    assert.equal(off.body.notifications.remindersEnabled, false)
    assert.equal(jobs(id).filter((j) => j.status === 'pending').length, 0)

    // Back on → the same reminders are re-activated, not duplicated
    await a.put(`/api/trips/${id}/notifications`, { remindersEnabled: true, updatesEnabled: false })
    assert.equal(jobs(id).filter((j) => j.kind === 'reminder' && j.status === 'pending').length, 2)
    assert.equal(jobs(id).filter((j) => j.kind === 'reminder').length, 2)
  })

  test('only the owner can change reminders', async () => {
    const owner = await ctx.client().login()
    const other = await ctx.client().login()
    const { body } = await owner.post('/api/trips', withReminders())
    const r = await other.put(`/api/trips/${body.trip.id}/notifications`, { remindersEnabled: false })
    assert.ok([403, 404].includes(r.status))
  })
})

describe('signed trip links', () => {
  let ctx
  before(async () => (ctx = await boot()))
  after(() => ctx.close())

  test('a valid link grants access to exactly one trip; forged or expired links do not', async () => {
    const a = await ctx.client().login()
    const t1 = (await a.post('/api/trips', tripInput())).body.trip.id
    const t2 = (await a.post('/api/trips', tripInput({ destinationCity: 'Paris', destinationCountry: 'FR' }))).body.trip.id
    const token = ctx.links.tokenFor(t1)
    const stranger = ctx.client()
    const ok = await stranger.get(`/api/trips/${t1}`, { 'X-Trip-Access': token })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.access, 'link')
    assert.equal(ok.body.notifications, null, 'link viewers never see notification settings')
    assert.equal((await stranger.get(`/api/trips/${t2}`, { 'X-Trip-Access': token })).status, 404, 'a link for trip 1 reveals nothing about trip 2')
    assert.equal((await stranger.get(`/api/trips/${t1}`, { 'X-Trip-Access': token.slice(0, -2) + 'xx' })).status, 401)
    assert.equal(ctx.links.verify(ctx.links.tokenFor(t1, Date.now() - 100 * 3600000)), null)
    assert.equal((await stranger.del(`/api/trips/${t1}`, { 'X-Trip-Access': token })).status, 401)
  })
})

describe('rate limiting', () => {
  test('trip creation is limited per user', async () => {
    const ctx = await boot()
    const a = await ctx.client().login()
    let last
    for (let i = 0; i < 13; i++) last = await a.post('/api/trips', tripInput({ destinationCity: `C${i}` }))
    assert.equal(last.status, 429)
    await ctx.close()
  })
})
