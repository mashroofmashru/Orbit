import {
  BriefcaseBusiness,
  CircleAlert,
  CircleDot,
  CreditCard,
  FileText,
  GraduationCap,
  HeartPulse,
  Hospital,
  MapPinned,
  Palmtree,
  Plug,
  Shirt,
  Signal,
  Sparkle,
  Ticket,
  Wrench,
} from 'lucide-react'

// Checklist categories (ids match the server)
export const CATEGORY_META = {
  documents: { label: 'Travel documents', short: 'Documents', icon: FileText, tint: 'bg-sky-50 text-sky-600' },
  tickets: { label: 'Tickets & bookings', short: 'Tickets', icon: Ticket, tint: 'bg-orange-50 text-orange-700' },
  health: { label: 'Health & medical', short: 'Health', icon: HeartPulse, tint: 'bg-red-50 text-danger' },
  money: { label: 'Money & payments', short: 'Money', icon: CreditCard, tint: 'bg-mint-50 text-mint-700' },
  electronics: { label: 'Electronics', short: 'Electronics', icon: Plug, tint: 'bg-sky-50 text-sky-600' },
  clothing: { label: 'Clothing & personal', short: 'Clothing', icon: Shirt, tint: 'bg-orange-50 text-orange-700' },
  destination: { label: 'Destination-specific', short: 'Destination', icon: MapPinned, tint: 'bg-mint-50 text-mint-700' },
}
export const CATEGORY_IDS = Object.keys(CATEGORY_META)

// Importance is shown with text + icon, never colour alone
export const IMPORTANCE_META = {
  critical: { label: 'Critical', icon: CircleAlert, cls: 'bg-red-50 text-danger ring-danger/25' },
  high: { label: 'High', icon: Signal, cls: 'bg-orange-50 text-orange-700 ring-orange/40' },
  normal: { label: 'Normal', icon: CircleDot, cls: 'bg-sky-50 text-sky-600 ring-sky/30' },
  optional: { label: 'Optional', icon: Sparkle, cls: 'bg-cream-200 text-muted ring-navy/10' },
}

export const PURPOSES = [
  { id: 'tourism', label: 'Tourism', icon: Palmtree },
  { id: 'business', label: 'Business', icon: BriefcaseBusiness },
  { id: 'study', label: 'Study', icon: GraduationCap },
  { id: 'work', label: 'Work', icon: Wrench },
  { id: 'medical', label: 'Medical', icon: Hospital },
  { id: 'other', label: 'Other', icon: MapPinned },
]

// ISO 3166-1 alpha-2 codes; names come from the browser's Intl data
const CODES =
  'AF AX AL DZ AS AD AO AI AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BA BW BR VG BN BG BF BI KH CM CA CV KY CF TD CL CN CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI XK KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU KP MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RE RO RU RW WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA KR SS ES LK BL KN LC MF PM VC SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TC TV UG UA AE GB US UY UZ VU VA VE VN WF EH YE ZM ZW'.split(' ')

const regionNames = typeof Intl !== 'undefined' && Intl.DisplayNames ? new Intl.DisplayNames(['en'], { type: 'region' }) : null
export const countryName = (code) => (code && regionNames?.of(code)) || code || ''

export const COUNTRIES = CODES.map((code) => ({ code, name: countryName(code) }))
  .filter((c) => c.name && c.name !== c.code)
  .sort((a, b) => a.name.localeCompare(b.name))

/** Suggestions for the destination field (no external location service is configured). */
export const POPULAR_DESTINATIONS = [
  ['Kozhikode', 'IN'], ['Kochi', 'IN'], ['Mumbai', 'IN'], ['New Delhi', 'IN'], ['Bengaluru', 'IN'], ['Goa', 'IN'],
  ['Chennai', 'IN'], ['Kolkata', 'IN'], ['Hyderabad', 'IN'], ['Jaipur', 'IN'],
  ['Dubai', 'AE'], ['Abu Dhabi', 'AE'], ['London', 'GB'], ['Paris', 'FR'], ['Singapore', 'SG'], ['Bangkok', 'TH'],
  ['Phuket', 'TH'], ['Tokyo', 'JP'], ['Kyoto', 'JP'], ['New York', 'US'], ['San Francisco', 'US'], ['Toronto', 'CA'],
  ['Sydney', 'AU'], ['Melbourne', 'AU'], ['Bali', 'ID'], ['Kuala Lumpur', 'MY'], ['Istanbul', 'TR'], ['Rome', 'IT'],
  ['Barcelona', 'ES'], ['Amsterdam', 'NL'], ['Berlin', 'DE'], ['Zurich', 'CH'], ['Doha', 'QA'], ['Kathmandu', 'NP'],
  ['Colombo', 'LK'], ['Malé', 'MV'],
].map(([city, country]) => ({ city, country }))

export function guessTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

export function guessUserCountry() {
  try {
    const locale = new Intl.Locale(navigator.language)
    if (locale.region && locale.region.length === 2) return locale.region.toUpperCase()
  } catch {
    /* fallback to timezone below */
  }
  const tz = guessTimeZone()
  if (/^Asia\/(Kolkata|Calcutta)/i.test(tz)) return 'IN'
  if (/^Asia\/Dubai/i.test(tz)) return 'AE'
  if (/^Europe\/London/i.test(tz)) return 'GB'
  if (/^America\//i.test(tz)) return 'US'
  return 'IN'
}

export function isDomesticRoute(depCountry, destCountry) {
  if (!depCountry || !destCountry) return false
  return depCountry.trim().toUpperCase() === destCountry.trim().toUpperCase()
}

export const TIME_ZONES = (() => {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return ['UTC', 'Asia/Kolkata', 'Asia/Dubai', 'Europe/London', 'America/New_York']
  }
})()

/** Formats a trip's departure in its own time zone. */
export function formatDeparture(trip, opts = {}) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: trip.departureTz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    ...opts,
  }).format(new Date(trip.departureAt))
}

/** Human countdown: "3 days 4 hr", "5 hr 20 min", "Departed". */
export function countdown(ms) {
  if (ms <= 0) return 'Departed'
  const mins = Math.floor(ms / 60000)
  const d = Math.floor(mins / 1440)
  const h = Math.floor((mins % 1440) / 60)
  const m = mins % 60
  if (d > 0) return `${d} day${d === 1 ? '' : 's'}${h ? ` ${h} hr` : ''}`
  if (h > 0) return `${h} hr${m ? ` ${m} min` : ''}`
  return `${m} min`
}
