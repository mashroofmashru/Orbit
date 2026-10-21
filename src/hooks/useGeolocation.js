import { useCallback, useState } from 'react'

export const GEO_MESSAGES = {
  unsupported: 'Your browser doesn’t support location access. Please type your location instead.',
  denied: 'Location permission was denied. You can type your location instead, or allow access in your browser settings.',
  unavailable: 'We couldn’t determine your location right now. Please type it instead.',
  timeout: 'Finding your location took too long. Try again or type your location.',
  granted: 'Location found. Your coordinates stay on this device.',
  granted_network: 'Approximate location detected from your network connection.',
}

async function fetchNetworkLocation() {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch('https://ipwho.is/', { signal: ctrl.signal })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json()
      if (data && data.success !== false && Number.isFinite(data.latitude) && Number.isFinite(data.longitude)) {
        return {
          coords: [data.latitude, data.longitude],
          city: data.city || data.region,
          region: data.region,
          country: data.country,
        }
      }
    }
  } catch {
    // try fallback
  }

  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 4000)
    const res = await fetch('https://freeipapi.com/api/json', { signal: ctrl.signal })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json()
      if (Number.isFinite(data.latitude) && Number.isFinite(data.longitude)) {
        return {
          coords: [data.latitude, data.longitude],
          city: data.cityName || data.regionName,
          region: data.regionName,
          country: data.countryName,
        }
      }
    }
  } catch {
    // ignore
  }

  return null
}

async function reverseGeocode(lat, lon) {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 2500)
    const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}`, { signal: ctrl.signal })
    clearTimeout(timer)
    if (res.ok) {
      const data = await res.json()
      const city = data.locality || data.city || data.principalSubdivision
      const region = data.principalSubdivision
      return { city, region }
    }
  } catch {
    // ignore
  }
  return null
}

/** Requests the browser location only when `request()` is called — never on load. */
export function useGeolocation() {
  const [state, setState] = useState({ status: 'idle', coords: null, accuracy: null, source: null })

  const request = useCallback(() => {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation?.getCurrentPosition) {
        // Even if navigator.geolocation is missing, try network location
        fetchNetworkLocation().then((net) => {
          if (net) {
            const coords = net.coords
            coords.city = net.city
            coords.region = net.region
            coords.country = net.country
            coords.source = 'network'
            const placeStr = net.region && net.region !== net.city ? `${net.city}, ${net.region}` : net.city
            coords.label = `Current location · near ${placeStr}`
            setState({ status: 'granted', coords, accuracy: 5000, source: 'network' })
            resolve(coords)
          } else {
            setState({ status: 'unsupported', coords: null, source: null })
            resolve(null)
          }
        })
        return
      }

      setState((s) => ({ ...s, status: 'requesting' }))

      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const coords = [pos.coords.latitude, pos.coords.longitude]
          const geoInfo = await reverseGeocode(coords[0], coords[1])
          if (geoInfo?.city) {
            coords.city = geoInfo.city
            coords.region = geoInfo.region
            const placeStr = geoInfo.region && geoInfo.region !== geoInfo.city ? `${geoInfo.city}, ${geoInfo.region}` : geoInfo.city
            coords.label = `Current location · ${placeStr}`
          }
          coords.source = 'device'
          setState({ status: 'granted', coords, accuracy: pos.coords.accuracy, source: 'device' })
          resolve(coords)
        },
        async (err) => {
          // If browser/OS location fails (e.g. Windows blocks Chrome or desktop lacks Wi-Fi triangulation),
          // fallback to network IP location automatically so user is never stuck!
          const net = await fetchNetworkLocation()
          if (net) {
            const coords = net.coords
            coords.city = net.city
            coords.region = net.region
            coords.country = net.country
            coords.source = 'network'
            const placeStr = net.region && net.region !== net.city ? `${net.city}, ${net.region}` : net.city
            coords.label = `Current location · near ${placeStr}`
            setState({ status: 'granted', coords, accuracy: 5000, source: 'network' })
            resolve(coords)
            return
          }

          const status = err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable'
          setState({ status, coords: null, source: null })
          resolve(null)
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
      )
    })
  }, [])

  const reset = useCallback(() => setState({ status: 'idle', coords: null, source: null }), [])

  const messageKey = state.source === 'network' && state.status === 'granted' ? 'granted_network' : state.status
  return { ...state, request, reset, message: GEO_MESSAGES[messageKey] ?? null }
}
