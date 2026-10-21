import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { z } from 'zod'
import { createAuth } from './auth.js'
import { openDatabase } from './db.js'
import { errorMiddleware, handler, HttpError, validate } from './lib/http.js'
import { rateLimit } from './lib/rateLimit.js'
import { createGamification, levelFor, publicRules } from './services/gamification.js'
import { createLinks } from './services/links.js'
import { createNotifications } from './services/notifications.js'
import { createPush } from './services/push.js'
import { createTripsService, toItem, toTrip } from './services/trips.js'
import { suggestAdventuresWithAi } from './services/adventureAi.js'

const distDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist')

/** Builds the app. Everything is injectable so tests can use an in-memory DB and a fake push transport. */
export function createApp(config, { db = openDatabase(config.dbPath), pushSendImpl } = {}) {
  const links = createLinks(config)
  const push = createPush({ db, config, sendImpl: pushSendImpl })
  const gamification = createGamification(db, config)
  const notifications = createNotifications({
    db,
    config,
    push,
    links,
    loadTrip: (id) => toTrip(db.prepare('SELECT * FROM trips WHERE id = ?').get(id)),
    loadItems: (id) => db.prepare('SELECT * FROM checklist_items WHERE trip_id = ? ORDER BY category, position').all(id).map(toItem),
  })
  const trips = createTripsService({ db, config, gamification, notifications, push })
  const auth = createAuth(db, config)

  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 'loopback')

  app.use(express.json({ limit: '100kb' }))
  app.use((req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff')
    res.set('Referrer-Policy', 'same-origin')
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store')
    next()
  })

  const api = express.Router()
  api.use(auth.attachUser)
  api.use(auth.requireClientHeader)
  api.use(rateLimit({ name: 'api', windowMs: 60000, max: 240 }))

  // Signed single-trip links (from notifications) — scoped capability, verified on every request
  api.use((req, _res, next) => {
    const token = req.get('X-Trip-Access')
    if (token) req.linkTripId = links.verify(token)
    next()
  })

  api.get('/health', (_req, res) => res.json({ ok: true, push: push.enabled, ai: config.ai.enabled && config.ai.hasCredentials }))
  api.get('/rules', (_req, res) => res.json(publicRules(config.scoring)))

  // Proxy for OpenStreetMap Overpass with user-agent, fallback mirrors and caching
  const osmCache = new Map()
  api.post(
    '/places/osm',
    rateLimit({ name: 'osm', windowMs: 60000, max: 60 }),
    handler(async (req, res) => {
      const { query } = req.body || {}
      if (!query || typeof query !== 'string' || query.length > 3000) {
        throw new HttpError(400, 'Invalid query')
      }
      const cached = osmCache.get(query)
      if (cached && Date.now() - cached.at < 24 * 3600 * 1000) {
        return res.json(cached.data)
      }
      const endpoints = [
        'https://lz4.overpass-api.de/api/interpreter',
        'https://overpass.kumi.systems/api/interpreter',
        'https://overpass-api.de/api/interpreter',
        'https://overpass.private.coffee/api/interpreter',
      ]
      let lastErr = null
      for (const ep of endpoints) {
        try {
          const ctrl = new AbortController()
          const timer = setTimeout(() => ctrl.abort(), 15000)
          const upstream = await fetch(ep, {
            method: 'POST',
            headers: {
              'User-Agent': 'OrbitTravelPlanner/1.0 (https://orbit.local; contact@orbit.local)',
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `data=${encodeURIComponent(query)}`,
            signal: ctrl.signal,
          })
          clearTimeout(timer)
          if (!upstream.ok) {
            lastErr = new Error(`HTTP ${upstream.status}`)
            continue
          }
          const data = await upstream.json()
          osmCache.set(query, { at: Date.now(), data })
          if (osmCache.size > 150) {
            const oldestKey = osmCache.keys().next().value
            osmCache.delete(oldestKey)
          }
          return res.json(data)
        } catch (e) {
          lastErr = e
        }
      }
      throw new HttpError(503, `Overpass unavailable: ${lastErr?.message || 'timeout'}`)
    }),
  )

  api.post(
    '/adventure/suggest',
    rateLimit({ name: 'adventure-suggest', windowMs: 60000, max: 60 }),
    handler(async (req, res) => {
      const preferences = req.body || {}
      const result = await suggestAdventuresWithAi(config, preferences)
      if (!result) {
        throw new HttpError(503, 'Could not generate recommendations from Gemini AI at this moment.')
      }
      res.json(result)
    }),
  )

  api.post(
    '/session',
    rateLimit({ name: 'session', windowMs: 3600000, max: 30 }),
    handler(async (req, res) => {
      const user = auth.ensureSession(req, res)
      res.json({ user: { id: user.id, displayName: user.displayName } })
    }),
  )

  const requireUserOrLink = (req, _res, next) => (req.user || req.linkTripId ? next() : next(new HttpError(401, 'Please reload to start a session.')))

  api.get('/me', auth.requireUser, (req, res) => {
    res.json({ user: { id: req.user.id, displayName: req.user.displayName }, ...gamification.summary(req.user.id) })
  })
  api.patch(
    '/me',
    auth.requireUser,
    handler(async (req, res) => {
      const data = validate(z.object({ displayName: z.string().trim().max(40).nullable() }), req.body)
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(data.displayName || null, req.user.id)
      res.json({ ok: true })
    }),
  )

  api.get('/dashboard', auth.requireUser, (req, res) => {
    const list = trips.listTrips(req.user.id)
    const upcoming = list.filter((t) => t.departureAt > Date.now())
    const g = gamification.summary(req.user.id)
    res.json({
      user: { displayName: req.user.displayName },
      trips: list,
      nextTrip: upcoming[0] ?? null,
      ...g,
      nextAchievement: g.achievements.find((a) => !a.unlocked) ?? null,
      activity: db.prepare('SELECT id, trip_id, type, message, created_at FROM activity WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 15').all(req.user.id),
    })
  })

  api.get('/trips', auth.requireUser, (req, res) => res.json({ trips: trips.listTrips(req.user.id) }))
  api.post(
    '/trips',
    auth.requireUser,
    rateLimit({ name: 'trip-create', windowMs: 3600000, max: 12 }),
    handler(async (req, res) => {
      const { result: trip, events, level } = await trips.createTrip(req.user, req.body)
      res.status(201).json({ ...trips.tripView(trip, req), events, level })
    }),
  )
  api.get('/trips/:id', requireUserOrLink, (req, res) => {
    const trip = trips.authorize(req, req.params.id)
    res.json({ ...trips.tripView(trip, req), level: levelFor(gamification.totalXp(trip.userId)) })
  })
  api.patch('/trips/:id', auth.requireUser, handler(async (req, res) => res.json({ trip: trips.updateTrip(req, req.params.id, req.body) })))
  api.delete(
    '/trips/:id',
    auth.requireUser,
    handler(async (req, res) => {
      trips.deleteTrip(req, req.params.id)
      res.status(204).end()
    }),
  )

  const itemLimiter = rateLimit({ name: 'items', windowMs: 60000, max: 120 })
  api.post(
    '/trips/:id/items',
    requireUserOrLink,
    itemLimiter,
    handler(async (req, res) => {
      const { item } = trips.addItem(req, req.params.id, req.body)
      const trip = trips.loadTrip(req.params.id)
      res.status(201).json({ item, ...trips.tripView(trip, req) })
    }),
  )
  api.patch(
    '/trips/:id/items/:itemId',
    requireUserOrLink,
    itemLimiter,
    handler(async (req, res) => {
      const { result, events, level } = trips.updateItem(req, req.params.id, req.params.itemId, req.body)
      const trip = trips.loadTrip(req.params.id)
      res.json({ item: result.item, events, level, ...trips.tripView(trip, req) })
    }),
  )
  api.delete(
    '/trips/:id/items/:itemId',
    requireUserOrLink,
    itemLimiter,
    handler(async (req, res) => {
      trips.deleteItem(req, req.params.id, req.params.itemId)
      res.json(trips.tripView(trips.loadTrip(req.params.id), req))
    }),
  )
  api.post(
    '/trips/:id/reorder',
    requireUserOrLink,
    itemLimiter,
    handler(async (req, res) => res.json({ items: trips.reorder(req, req.params.id, req.body) })),
  )
  api.put(
    '/trips/:id/notifications',
    auth.requireUser,
    rateLimit({ name: 'prefs', windowMs: 60000, max: 20 }),
    handler(async (req, res) => res.json({ notifications: trips.setNotifications(req, req.params.id, req.body) })),
  )
  api.get('/trips/:id/messages', auth.requireUser, (req, res) => res.json(trips.messages(req, req.params.id)))

  // ── Web push: trip reminders and checklist updates in the notification bar ──
  const pushSubscription = z.object({
    endpoint: z.string().url().startsWith('https://').max(1000),
    keys: z.object({ p256dh: z.string().min(16).max(200), auth: z.string().min(8).max(100) }),
  })
  api.get('/push/key', (_req, res) => res.json({ publicKey: push.publicKey }))
  api.post(
    '/push/subscriptions',
    auth.requireUser,
    rateLimit({ name: 'push', windowMs: 60000, max: 20 }),
    handler(async (req, res) => {
      if (!push.enabled) throw new HttpError(503, 'Phone notifications aren’t set up on the server yet.')
      push.subscribe(req.user.id, validate(pushSubscription, req.body))
      res.status(201).json({ devices: push.count(req.user.id) })
    }),
  )
  api.delete(
    '/push/subscriptions',
    auth.requireUser,
    handler(async (req, res) => {
      const { endpoint } = validate(z.object({ endpoint: z.string().max(1000) }), req.body)
      push.unsubscribe(req.user.id, endpoint)
      res.json({ devices: push.count(req.user.id) })
    }),
  )
  api.post(
    '/push/test',
    auth.requireUser,
    rateLimit({ name: 'push-test', windowMs: 60000, max: 5 }),
    handler(async (req, res) => {
      const r = await push.notifyUser(req.user.id, {
        title: 'ORBIT notifications are on',
        body: 'Your trip reminders will appear here.',
        url: '/trips',
        tag: 'orbit-test',
      })
      if (!r.sent) throw new HttpError(502, r.error || 'This device isn’t subscribed yet.')
      res.json(r)
    }),
  )

  app.use('/api', api)
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Not found.')))

  // Production: serve the built SPA
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir, { index: false, maxAge: '1h' }))
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
  }
  app.use(errorMiddleware)

  return { app, db, notifications, trips, gamification, links, push }
}
