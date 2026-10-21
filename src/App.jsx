import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { LoaderCircle } from 'lucide-react'
import { MotionConfig } from 'motion/react'
import Layout from './components/layout/Layout'
import Home from './pages/Home'
import NotFound from './pages/NotFound'

// Map-heavy pages are split out so the homepage loads fast
const AdventurePreferences = lazy(() => import('./pages/AdventurePreferences'))
const Results = lazy(() => import('./pages/Results'))
const AdventureDetails = lazy(() => import('./pages/AdventureDetails'))
const LiveAdventure = lazy(() => import('./pages/LiveAdventure'))
const Saved = lazy(() => import('./pages/Saved'))
const TripsDashboard = lazy(() => import('./pages/TripsDashboard'))
const TripSetup = lazy(() => import('./pages/TripSetup'))
const TripChecklist = lazy(() => import('./pages/TripChecklist'))
const Profile = lazy(() => import('./pages/Profile'))
const DiscoverPlaces = lazy(() => import('./pages/DiscoverPlaces'))

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sky" role="status" aria-label="Loading page">
      <LoaderCircle className="size-8 animate-spin" />
    </div>
  )
}

const page = (el) => <Suspense fallback={<PageLoader />}>{el}</Suspense>

export default function App() {
  return (
    // Honour the OS "reduce motion" setting for every Motion animation
    <MotionConfig reducedMotion="user">
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="adventure">
            <Route index element={page(<AdventurePreferences />)} />
            {/* Static segments rank above the dynamic :id, so "live" and "results" are never treated as ids */}
            <Route path="results" element={page(<Results />)} />
            <Route path="live" element={page(<LiveAdventure />)} />
            <Route path="discover" element={page(<DiscoverPlaces />)} />
            <Route path=":id" element={page(<AdventureDetails />)} />
          </Route>
          <Route path="saved" element={page(<Saved />)} />
          {/* "Did I Forget Something?" — "new" is a static segment, so it is never treated as a trip id */}
          <Route path="trips">
            <Route index element={page(<TripsDashboard />)} />
            <Route path="new" element={page(<TripSetup />)} />
            <Route path=":id" element={page(<TripChecklist />)} />
          </Route>
          <Route path="profile" element={page(<Profile />)} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </MotionConfig>
  )
}
