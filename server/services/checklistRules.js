import { officialEntrySource } from '../data/officialSources.js'

export const CATEGORIES = ['documents', 'tickets', 'health', 'money', 'electronics', 'clothing', 'destination']
export const IMPORTANCE = ['critical', 'high', 'normal', 'optional']
export const PURPOSES = ['tourism', 'business', 'study', 'work', 'medical', 'other']

const CHECK_NOTE = ''

export function timezoneToCountry(tz) {
  if (!tz) return null
  if (/^Asia\/(Kolkata|Calcutta)/i.test(tz)) return 'IN'
  if (/^Asia\/Dubai/i.test(tz)) return 'AE'
  if (/^Europe\/London/i.test(tz)) return 'GB'
  if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Indiana)/i.test(tz)) return 'US'
  if (/^Europe\/Paris/i.test(tz)) return 'FR'
  if (/^Asia\/Tokyo/i.test(tz)) return 'JP'
  if (/^Asia\/Singapore/i.test(tz)) return 'SG'
  if (/^Australia\//i.test(tz)) return 'AU'
  if (/^Asia\/Bangkok/i.test(tz)) return 'TH'
  if (/^Europe\/Berlin/i.test(tz)) return 'DE'
  if (/^Europe\/Rome/i.test(tz)) return 'IT'
  if (/^Europe\/Madrid/i.test(tz)) return 'ES'
  if (/^Europe\/Amsterdam/i.test(tz)) return 'NL'
  if (/^Europe\/Zurich/i.test(tz)) return 'CH'
  if (/^Asia\/Qatar/i.test(tz)) return 'QA'
  if (/^Asia\/Kathmandu/i.test(tz)) return 'NP'
  if (/^Asia\/Colombo/i.test(tz)) return 'LK'
  if (/^Indian\/Maldives/i.test(tz)) return 'MV'
  if (/^America\/(Toronto|Vancouver|Montreal|Edmonton)/i.test(tz)) return 'CA'
  if (/^Asia\/Kuala_Lumpur/i.test(tz)) return 'MY'
  if (/^Asia\/Jakarta/i.test(tz)) return 'ID'
  return null
}

export function isDomesticTrip({ departureCountry, destinationCountry, departureTz }) {
  if (departureCountry && destinationCountry) {
    return departureCountry.trim().toUpperCase() === destinationCountry.trim().toUpperCase()
  }
  if (departureTz && destinationCountry) {
    const tzCountry = timezoneToCountry(departureTz)
    if (tzCountry && tzCountry.toUpperCase() === destinationCountry.trim().toUpperCase()) {
      return true
    }
  }
  return false
}

/**
 * Deterministic baseline checklist. Entry requirements are never asserted — they are
 * created as "requirement" items in an unverified state, with an official link when we have one.
 * For domestic trips (departure and arrival in the same country), passports and visas are excluded.
 */
export function buildRuleChecklist({ departureCountry, destinationCountry, departureTz, purpose }) {
  const isDomestic = isDomesticTrip({ departureCountry, destinationCountry, departureTz })
  const items = []
  const add = (category, title, importance, extra = {}) =>
    items.push({ category, title, importance, kind: 'item', applicable: true, note: null, ...extra })

  const source = !isDomestic ? officialEntrySource(destinationCountry) : null
  const requirement = (extra = {}) => ({
    kind: 'requirement',
    requirementStatus: 'unverified',
    sourceUrl: source?.url ?? null,
    sourceLabel: source?.label ?? null,
    sourceAddedOn: source?.addedOn ?? null,
    ...extra,
  })

  // ── 1. Travel documents ──────────────────────────────────────────────────
  if (isDomestic) {
    add('documents', 'Government-issued photo ID', 'critical', {
      note: 'Driver’s license, Aadhaar card, voter ID, passport, or other valid photo ID required for security checks and hotel check-in.',
    })
    add('documents', 'Secondary photo ID or digital backup', 'normal', {
      note: 'Keep a digital copy (e.g. DigiLocker) or second ID card in case your primary ID is misplaced.',
    })
    add('documents', 'Travel or medical insurance documents', 'normal', {
      note: 'Keep a digital copy of your policy and emergency helpline numbers.',
    })
    if (purpose === 'business') {
      add('documents', 'Company ID or business travel authorization', 'high', {
        note: 'Have your company ID and meeting agenda handy.',
      })
    } else if (purpose === 'study') {
      add('documents', 'Student ID and exam / admission documents', 'critical', {
        note: 'Required for exam entry, student fare verification, or campus access.',
      })
    } else if (purpose === 'work') {
      add('documents', 'Employee ID or work assignment letter', 'high', {
        note: 'Keep proof of employment or project assignment letter on hand.',
      })
    } else if (purpose === 'medical') {
      add('documents', 'Hospital appointment confirmation & medical records', 'high')
    }
  } else {
    add('documents', 'Passport', 'critical', {
      ...requirement(),
      note: 'Many countries require your passport to stay valid for a period after you arrive (often 6 months).',
    })
    add('documents', 'Visa or entry authorisation — check if you need one', 'critical', {
      ...requirement(),
      note: CHECK_NOTE,
    })
    add('documents', 'Second photo ID', 'normal')
    add('documents', 'Travel insurance documents', 'high', {
      note: 'Keep a digital and a printed copy.',
    })
    if (purpose === 'business') {
      add('documents', 'Business invitation or letter — check if required', 'high', { ...requirement(), note: CHECK_NOTE })
    } else if (purpose === 'study') {
      add('documents', 'Admission letter and student documents', 'critical', { ...requirement(), note: CHECK_NOTE })
    } else if (purpose === 'work') {
      add('documents', 'Work permit or employment documents — check what applies', 'critical', { ...requirement(), note: CHECK_NOTE })
    } else if (purpose === 'medical') {
      add('documents', 'Hospital appointment confirmation', 'high')
    }
  }
  add('documents', 'Copies of key documents (stored separately)', 'normal')

  // ── 2. Tickets & bookings ────────────────────────────────────────────────
  add('tickets', 'Flight / train ticket or boarding pass', 'critical')
  add('tickets', 'Accommodation confirmation', 'high')
  if (!isDomestic) {
    add('tickets', 'Return or onward ticket', 'high', {
      note: 'Some destinations and airlines ask for proof of onward travel — check with your carrier.',
    })
  } else {
    add('tickets', 'Return ticket or travel reservation', 'normal')
  }
  add('tickets', 'Route to the airport or station', 'normal')

  // ── 3. Health & medical ─────────────────────────────────────────────────
  add('health', 'Prescribed medication in original packaging', 'high', {
    note: '',
  })
  add('health', 'Health insurance card', 'high')
  add('health', 'Basic first-aid kit', 'normal')
  if (!isDomestic) {
    add('health', 'Vaccination records — check if any are required', 'high', {
      ...requirement({ sourceUrl: null, sourceLabel: null, sourceAddedOn: null }),
      note: '',
    })
  }

  // ── 4. Money & payments ─────────────────────────────────────────────────
  add('money', 'Debit / credit cards', 'critical')
  if (!isDomestic) {
    add('money', 'Tell your bank about your trip', 'normal')
    add('money', 'Some local currency', 'normal')
  } else {
    add('money', 'Some emergency cash', 'normal')
  }
  add('money', 'Backup card stored separately', 'optional')

  // ── 5. Electronics ──────────────────────────────────────────────────────
  add('electronics', 'Phone and charger', 'high')
  add('electronics', 'Power bank', 'normal', { note: 'Usually carry-on only — check your airline’s rules.' })
  if (!isDomestic) {
    add('electronics', 'Travel plug adapter', 'normal')
  }
  add('electronics', 'Offline copies of tickets and maps', 'normal')
  add('electronics', 'Headphones', 'optional')

  // ── 6. Clothing & personal ──────────────────────────────────────────────
  add('clothing', 'Weather-appropriate clothing', 'normal')
  add('clothing', 'Comfortable walking shoes', 'normal')
  add('clothing', 'Toiletries', 'normal')
  if (purpose === 'business') add('clothing', 'Business attire', 'high')
  add('clothing', 'Sleepwear', 'optional')

  // ── 7. Destination-specific ─────────────────────────────────────────────
  if (!isDomestic) {
    add('destination', 'Check local entry rules and travel advisories', 'high', {
      ...requirement(),
      note: 'Rules change. Check official government sources shortly before you leave.',
    })
    add('destination', 'Emergency contacts and accommodation address', 'normal')
    add('destination', 'Mobile data plan, local SIM or eSIM', 'normal')
  } else {
    add('destination', 'Check local weather and travel advisories', 'normal', {
      note: 'Check weather forecasts and any local transport advisories before leaving.',
    })
    add('destination', 'Emergency contacts and accommodation address', 'normal')
  }

  return items
}
