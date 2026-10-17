import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowLeft, CalendarClock, ListChecks, LoaderCircle, Plus, ShieldCheck, ShieldQuestion, Trash2 } from 'lucide-react'
import Mascot from '../components/mascot/Mascot'
import { ReadinessRing } from '../components/game/GameUI'
import ItemCard, { NotNeededItem } from '../components/trips/ItemCard'
import ItemDialog from '../components/trips/ItemDialog'
import NotificationsPanel from '../components/trips/NotificationsPanel'
import Dialog from '../components/ui/Dialog'
import Notice from '../components/ui/Notice'
import NotFound from './NotFound'
import { CATEGORY_IDS, CATEGORY_META, countdown, countryName, formatDeparture, PURPOSES } from '../data/trips'
import { companionFor } from '../lib/companion'
import { api, rememberTripLink } from '../services/orbitApi'
import { useNow } from '../hooks/useNow'
import { buttonClass, cn } from '../lib/ui'

const STATUS_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'todo', label: 'To do' },
  { id: 'done', label: 'Done' },
]

/** Instant local update of an item and the checklist counts (server response replaces it moments later). */
function optimisticToggle(d, itemId, completed) {
  const items = d.items.map((i) => (i.id === itemId ? { ...i, completed } : i))
  const item = d.items.find((i) => i.id === itemId)
  if (!item?.applicable || item.completed === completed) return { ...d, items }
  const done = d.readiness.completed + (completed ? 1 : -1)
  const byCategory = d.readiness.byCategory.map((c) => (c.id === item.category ? { ...c, completed: c.completed + (completed ? 1 : -1) } : c))
  const completionPct = d.readiness.total ? Math.round((done / d.readiness.total) * 100) : 0
  return { ...d, items, readiness: { ...d.readiness, completed: done, completionPct, byCategory } }
}

export default function TripChecklist() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const now = useNow(30000)

  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading') // loading | ready | notfound | error
  const [loadError, setLoadError] = useState(null)
  const [busy, setBusy] = useState({}) // itemId -> true while saving
  const [actionError, setActionError] = useState(null)
  const [lastEvent, setLastEvent] = useState(location.state?.welcome ? { type: 'welcome' } : null)
  const [category, setCategory] = useState('all')
  const [filter, setFilter] = useState('all')
  const [dialog, setDialog] = useState(null) // { mode: 'add' | 'edit', item?, category? }
  const [confirm, setConfirm] = useState(null) // { kind: 'item' | 'trip', item? }
  const eventTimer = useRef(null)

  // Signed trip link (from a notification): remember it for this tab, then strip it from the address bar
  useEffect(() => {
    const token = searchParams.get('access')
    if (token) {
      rememberTripLink(id, token)
      setSearchParams({}, { replace: true })
    }
  }, [id, searchParams, setSearchParams])

  const load = useCallback(() => {
    api
      .trip(id)
      .then((d) => {
        setData(d)
        setStatus('ready')
      })
      .catch((err) => {
        if (err.status === 404 || err.status === 401) setStatus('notfound')
        else {
          setLoadError(err.message)
          setStatus('error')
        }
      })
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  // Orbi waves once after the trip is created
  useEffect(() => {
    if (!location.state?.welcome) return
    eventTimer.current = setTimeout(() => setLastEvent(null), 3500)
    return () => clearTimeout(eventTimer.current)
  }, [location.state])

  function showEvent(ev) {
    clearTimeout(eventTimer.current)
    setLastEvent(ev)
    eventTimer.current = setTimeout(() => setLastEvent(null), 3200)
  }

  function applyServer(res) {
    setData((d) => ({ ...d, ...res }))
  }

  async function mutateItem(item, body) {
    setBusy((b) => ({ ...b, [item.id]: true }))
    setActionError(null)
    // Optimistic checkbox for snappy feedback; the server response is the source of truth
    if ('completed' in body) setData((d) => optimisticToggle(d, item.id, body.completed))
    try {
      const res = await api.updateItem(id, item.id, body)
      applyServer(res)
      if (body.completed) showEvent({ type: 'item', important: ['critical', 'high'].includes(item.importance) })
      else {
        // Non-reward changes (uncheck, confirm, not needed): reflect the current state immediately
        clearTimeout(eventTimer.current)
        setLastEvent(null)
      }
    } catch (err) {
      setActionError(err.message)
      load()
    } finally {
      setBusy((b) => ({ ...b, [item.id]: false }))
    }
  }

  async function move(item, dir) {
    const list = data.items.filter((i) => i.category === item.category).sort((a, b) => a.position - b.position)
    const idx = list.findIndex((i) => i.id === item.id)
    const swap = list[idx + dir]
    if (!swap) return
    ;[list[idx], list[idx + dir]] = [swap, item]
    try {
      const res = await api.reorder(id, { category: item.category, orderedIds: list.map((i) => i.id) })
      setData((d) => ({ ...d, items: res.items }))
    } catch (err) {
      setActionError(err.message)
    }
  }

  async function removeConfirmed() {
    const c = confirm
    setConfirm(null)
    try {
      if (c.kind === 'item') applyServer(await api.deleteItem(id, c.item.id))
      else {
        await api.deleteTrip(id)
        navigate('/trips', { replace: true })
      }
    } catch (err) {
      setActionError(err.message)
    }
  }

  const companion = useMemo(() => {
    if (lastEvent?.type === 'welcome') return { state: 'welcome', message: 'Let’s make sure you have everything!' }
    return companionFor({ readiness: data?.readiness, lastEvent, items: data?.items })
  }, [data, lastEvent])

  if (status === 'loading') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted" role="status">
        <LoaderCircle className="size-8 animate-spin text-sky" />
        Loading your checklist…
      </div>
    )
  }
  if (status === 'notfound') return <NotFound title="We couldn’t find that trip" text="It may have been deleted, or the link has expired. Trip links work for 72 hours." />
  if (status === 'error') {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <Notice tone="error">{loadError}</Notice>
        <button type="button" onClick={load} className={buttonClass('dark', 'md', 'mt-6')}>
          Try again
        </button>
      </div>
    )
  }

  const { trip, items, readiness, notifications, access } = data
  const ms = trip.departureAt - now
  const isOwner = access === 'owner'
  const purpose = PURPOSES.find((p) => p.id === trip.purpose)
  const visibleCats = category === 'all' ? CATEGORY_IDS : [category]

  return (
    <div className="pb-10">
      {/* ── Hero ── */}
      <section className="hero-surface text-navy">
        <div className="mx-auto max-w-6xl px-4 pt-6 pb-10 sm:px-6 lg:px-8">
          <Link to="/trips" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-muted hover:text-navy">
            <ArrowLeft className="size-4" /> All trips
          </Link>
          <div className="mt-3 grid items-center gap-8 lg:grid-cols-[1fr_auto]">
            <div>
              <p className="text-sm font-bold tracking-wide text-orange-700 uppercase">Did I forget something?</p>
              <h1 className="mt-1 text-4xl font-medium sm:text-5xl">{trip.name || `Trip to ${trip.destinationCity}`}</h1>
              <p className="mt-2 text-lg text-muted">
                {trip.departureCity ? `${trip.departureCity} → ` : ''}{trip.destinationCity}, {countryName(trip.destinationCountry)} · {purpose?.label}
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-sm">
                {trip.departureCountry && trip.destinationCountry && (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-bold',
                      trip.departureCountry === trip.destinationCountry ? 'bg-mint-100 text-mint-800' : 'bg-sky-100 text-sky-800',
                    )}
                  >
                    {trip.departureCountry === trip.destinationCountry ? '🛡️ Domestic Trip' : '🌍 International Trip'}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-cream px-3 py-1.5 font-semibold">
                  <CalendarClock className="size-4 text-orange-700" /> {formatDeparture(trip)} <span className="text-muted">({trip.departureTz.replace(/_/g, ' ')})</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-orange px-3 py-1.5 font-bold text-navy">
                  {ms > 0 ? `Departs in ${countdown(ms)}` : 'Departed'}
                </span>
              </div>
              <div className="mt-6">
                <Mascot state={companion.state} message={companion.message} size={130} tone="light" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-4 rounded-3xl bg-cream p-5 ring-1 ring-navy/10 sm:flex-row lg:flex-col">
              <ReadinessRing score={readiness.score} size={150} label="Prepared" />
              <div className="min-w-56 space-y-3 text-center sm:text-left lg:text-center">
                <p className="text-muted">
                  <strong className="font-display text-2xl text-navy tabular-nums">{readiness.completed}</strong> of {readiness.total} items checked
                  {readiness.notApplicable > 0 && <span className="block text-sm text-muted">{readiness.notApplicable} marked not needed</span>}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto mt-8 grid max-w-6xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_340px] lg:px-8">
        <div className="min-w-0 space-y-6">
          {/* Requirement status — separate from checklist progress, never "legally ready" */}
          {readiness.requirements.total > 0 && (
            <div
              className={cn(
                'flex items-start gap-3 rounded-2xl p-4 ring-1',
                readiness.requirements.status === 'all_confirmed' ? 'bg-success-50 ring-success/30' : 'bg-orange-50 ring-orange/40',
              )}
            >
              {readiness.requirements.status === 'all_confirmed' ? <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success-700" /> : <ShieldQuestion className="mt-0.5 size-5 shrink-0 text-orange-700" />}
              <div className="text-[15px]">
                <p className="font-bold">
                  Requirement status: {readiness.requirements.verified} of {readiness.requirements.total} entry requirements confirmed by you
                </p>
              </div>
            </div>
          )}

          {/* Toolbar */}
          <div className="sticky top-16 z-20 -mx-4 space-y-3 bg-cream/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:px-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div role="radiogroup" aria-label="Show items" className="flex rounded-full bg-white p-1 ring-1 ring-navy/10">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="radio"
                    aria-checked={filter === f.id}
                    onClick={() => setFilter(f.id)}
                    className={cn('h-11 cursor-pointer rounded-full px-4 text-sm font-bold sm:h-9', filter === f.id ? 'bg-navy text-white' : 'text-navy/75 hover:text-navy')}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setDialog({ mode: 'add', category: category === 'all' ? undefined : category })} className={buttonClass('dark', 'sm')}>
                <Plus className="size-4" /> Add item
              </button>
            </div>
            <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Category">
              {['all', ...CATEGORY_IDS].map((c) => {
                const cat = readiness.byCategory.find((b) => b.id === c)
                const on = category === c
                return (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setCategory(c)}
                    className={cn(
                      'inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-sm font-bold ring-1 whitespace-nowrap sm:h-9',
                      on ? 'bg-sky-600 text-white ring-sky-600' : 'bg-white text-navy ring-navy/10 hover:ring-sky',
                    )}
                  >
                    {c === 'all' ? 'All categories' : CATEGORY_META[c].short}
                    {cat && <span className={cn('tabular-nums', on ? 'text-white/85' : 'text-muted')}>{cat.completed}/{cat.total}</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {actionError && <Notice tone="error">{actionError}</Notice>}

          {visibleCats.map((c) => {
            const meta = CATEGORY_META[c]
            const all = items.filter((i) => i.category === c).sort((a, b) => a.position - b.position)
            const applicable = all.filter((i) => i.applicable)
            const shown = applicable.filter((i) => (filter === 'todo' ? !i.completed : filter === 'done' ? i.completed : true))
            const notNeeded = all.filter((i) => !i.applicable)
            const stats = readiness.byCategory.find((b) => b.id === c)
            if (!all.length && category === 'all') return null
            return (
              <section key={c} aria-labelledby={`cat-${c}`} className="rounded-3xl bg-white/60 p-1">
                <div className="flex items-center gap-3 px-2 py-2">
                  <span className={cn('grid size-10 place-items-center rounded-xl', meta.tint)}>
                    <meta.icon className="size-5" aria-hidden="true" />
                  </span>
                  <h2 id={`cat-${c}`} className="flex-1 text-xl font-medium">
                    {meta.label}
                  </h2>
                  {stats.total > 0 && (
                    <span className={cn('rounded-full px-2.5 py-1 text-sm font-bold tabular-nums', stats.completed === stats.total ? 'bg-success-50 text-success-700' : 'bg-cream-200 text-muted')}>
                      {stats.completed}/{stats.total}
                    </span>
                  )}
                </div>
                {shown.length > 0 ? (
                  <ul className="space-y-2">
                    {shown.map((item) => {
                      const idx = applicable.findIndex((i) => i.id === item.id)
                      return (
                        <ItemCard
                          key={item.id}
                          item={item}
                          busy={busy[item.id]}
                          onToggle={() => mutateItem(item, { completed: !item.completed })}
                          onVerify={() => mutateItem(item, { requirementStatus: item.requirementStatus === 'verified' ? 'unverified' : 'verified' })}
                          onApplicable={(v) => mutateItem(item, { applicable: v })}
                          onEdit={() => setDialog({ mode: 'edit', item })}
                          onRemove={() => setConfirm({ kind: 'item', item })}
                          onMove={(dir) => move(item, dir)}
                          canMoveUp={idx > 0}
                          canMoveDown={idx < applicable.length - 1}
                        />
                      )
                    })}
                  </ul>
                ) : (
                  <p className="rounded-2xl bg-white px-4 py-5 text-center text-muted">
                    {applicable.length === 0 ? 'Nothing here yet.' : filter === 'todo' ? 'All done in this category!' : 'Nothing checked off here yet.'}{' '}
                    <button type="button" onClick={() => setDialog({ mode: 'add', category: c })} className="min-h-11 cursor-pointer font-bold text-sky-600 hover:underline">
                      Add an item
                    </button>
                  </p>
                )}
                {notNeeded.length > 0 && (
                  <details className="mt-2 px-2 pb-2">
                    <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-muted">Not needed for this trip ({notNeeded.length})</summary>
                    <ul className="mt-1 space-y-1.5">
                      {notNeeded.map((item) => (
                        <NotNeededItem key={item.id} item={item} busy={busy[item.id]} onRestore={() => mutateItem(item, { applicable: true })} />
                      ))}
                    </ul>
                  </details>
                )}
              </section>
            )
          })}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <section aria-labelledby="out-title" className="rounded-3xl bg-white p-5 shadow-card ring-1 ring-navy/5 sm:p-6">
            <h2 id="out-title" className="flex items-center gap-2 text-xl font-medium">
              <ListChecks className="size-5 text-orange-700" /> Still to check
            </h2>
            {readiness.criticalOutstanding.length ? (
              <ul className="mt-3 space-y-2">
                {readiness.criticalOutstanding.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-[15px]">
                    <span className="size-2 shrink-0 rounded-full bg-danger" aria-hidden="true" />
                    <span className="font-semibold">{c.title}</span>
                    <span className="sr-only">(critical)</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-muted">No critical items left. Nice work!</p>
            )}
          </section>

          {isOwner && notifications && (
            <NotificationsPanel tripId={id} prefs={notifications} departed={ms <= 0} onSaved={(n) => setData((d) => ({ ...d, notifications: n }))} />
          )}

          {isOwner && (
            <button type="button" onClick={() => setConfirm({ kind: 'trip' })} className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-bold text-danger hover:underline">
              <Trash2 className="size-4" /> Delete this trip
            </button>
          )}
          {!isOwner && <Notice tone="info">You’re viewing this checklist from a shared link. Ticking items still counts for the trip owner.</Notice>}
        </aside>
      </div>

      {dialog && (
        <ItemDialog
          key={dialog.item?.id ?? `add-${dialog.category}`}
          open
          item={dialog.item}
          defaultCategory={dialog.category}
          onClose={() => setDialog(null)}
          onSave={async (body) => {
            const res = dialog.mode === 'edit' ? await api.updateItem(id, dialog.item.id, body) : await api.addItem(id, body)
            applyServer(res)
          }}
        />
      )}

      <Dialog
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        role="alertdialog"
        title={confirm?.kind === 'trip' ? 'Delete this trip?' : 'Remove this item?'}
        description={
          confirm?.kind === 'trip'
            ? 'The checklist and any scheduled reminders will be deleted.'
            : `“${confirm?.item?.title}” will be removed from your checklist.`
        }
      >
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" data-autofocus onClick={() => setConfirm(null)} className={buttonClass('secondary', 'md')}>
            Cancel
          </button>
          <button type="button" onClick={removeConfirmed} className={buttonClass('danger', 'md')}>
            {confirm?.kind === 'trip' ? 'Delete trip' : 'Remove item'}
          </button>
        </div>
      </Dialog>

      {/* Polite live region for progress changes */}
      <p className="sr-only" aria-live="polite">
        Checklist {readiness.score}% prepared. {readiness.completed} of {readiness.total} items checked.
      </p>
    </div>
  )
}
