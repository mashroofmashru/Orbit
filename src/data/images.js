// Curated Unsplash photos (Unsplash License). Every image is rendered through
// <SmartImage>, which shows a branded gradient fallback if a photo fails to load.
const PHOTOS = {
  traveler: '1517400508447-f8dd518b86db',
  station: '1532105956626-9569c03602f6',
  mapFlatlay: '1488646953014-85cb44e25828',
  latteCheers: '1495474472287-4d71bcdd2085',
  lattePlants: '1509042239860-f550ce710b93',
  cafeInterior: '1555396273-367ea4eb4db5',
  cafeGreen: '1600093463592-8e36ae95ef56',
  coffeeBeans: '1447933601403-0c6688de566e',
  foodSpread: '1504674900247-0877df9cc836',
  foodBowl: '1490645935967-10de6ba17061',
  restaurant: '1517248135467-4c7edcad34c4',
  shop: '1441986300917-64674bd600d8',
  camera: '1502920917128-1aa500764cbd',
  yoga: '1506126613408-eca07ce68773',
  books: '1513475382585-d06e58bcb0e0',
  lanternAlley: '1528360983277-13d401cdc186',
  trail: '1580058572462-98e2c0e0e2f0',
  greenHills: '1501854140801-50d01698950b',
  fort: '1599661046289-e31897846e41',
  indiaGate: '1587474260584-136574528ed5',
  mumbaiHeritage: '1566552881560-0be862a7c445',
  marineDrive: '1567157577867-05ccb1388e66',
  gatewayOfIndia: '1570168007204-dfb528c6958f',
  bengaluruSkyline: '1596176530529-78163a4f7af2',
  friends: '1529156069898-49953e39b3ac',
  stars: '1519681393784-d120267933ba',
  craftsman: '1558618666-fcd25c85cd64',
  walk: '1534531173927-aeb928d54385',
  lake: '1501785888041-af3ef285b470',
}

export function photoUrl(key, width = 800) {
  if (!key) return null
  if (typeof key === 'string' && (key.startsWith('http://') || key.startsWith('https://'))) {
    return key
  }
  const id = PHOTOS[key]
  if (!id) return null
  return `https://images.unsplash.com/photo-${id}?w=${width}&q=70&auto=format&fit=crop`
}

