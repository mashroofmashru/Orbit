-- Add departure place (origin) to trips for domestic vs international travel detection
ALTER TABLE trips ADD COLUMN departure_city TEXT;
ALTER TABLE trips ADD COLUMN departure_country TEXT;

-- Infer departure country from departure_tz for existing trips
UPDATE trips
   SET departure_country = CASE
     WHEN departure_tz LIKE 'Asia/Kolkata' OR departure_tz LIKE 'Asia/Calcutta' THEN 'IN'
     WHEN departure_tz LIKE 'Asia/Dubai' THEN 'AE'
     WHEN departure_tz LIKE 'Europe/London' THEN 'GB'
     WHEN departure_tz LIKE 'America/%' THEN 'US'
     ELSE destination_country
   END
 WHERE departure_country IS NULL;

-- For domestic trips, remove obsolete international items (passport, visa, foreign entry advisories)
DELETE FROM checklist_items
 WHERE trip_id IN (SELECT id FROM trips WHERE departure_country = destination_country)
   AND origin = 'rules'
   AND completed = 0
   AND (
     title = 'Passport'
     OR title LIKE 'Visa%'
     OR title = 'Check local entry rules and travel advisories'
     OR title = 'Vaccination records — check if any are required'
     OR title = 'Travel plug adapter'
     OR title = 'Tell your bank about your trip'
   );

-- Add Government-issued photo ID for domestic trips if not already present
INSERT INTO checklist_items (
  id, trip_id, category, title, note, importance, kind, applicable, requirement_status, origin, completed, position, created_at, updated_at
)
SELECT
  'itm_mig_' || substr(t.id, 5),
  t.id,
  'documents',
  'Government-issued photo ID',
  'Driver’s license, Aadhaar card, voter ID, passport, or other valid photo ID required for security checks and hotel check-in.',
  'critical',
  'item',
  1,
  NULL,
  'rules',
  0,
  10,
  t.created_at,
  t.updated_at
FROM trips t
WHERE t.departure_country = t.destination_country
  AND NOT EXISTS (
    SELECT 1 FROM checklist_items i
     WHERE i.trip_id = t.id AND i.title = 'Government-issued photo ID'
  );

-- Add domestic weather check for domestic trips if not present
INSERT INTO checklist_items (
  id, trip_id, category, title, note, importance, kind, applicable, requirement_status, origin, completed, position, created_at, updated_at
)
SELECT
  'itm_mig_w_' || substr(t.id, 5),
  t.id,
  'destination',
  'Check local weather and travel advisories',
  'Check weather forecasts and any local transport advisories before leaving.',
  'normal',
  'item',
  1,
  NULL,
  'rules',
  0,
  10,
  t.created_at,
  t.updated_at
FROM trips t
WHERE t.departure_country = t.destination_country
  AND NOT EXISTS (
    SELECT 1 FROM checklist_items i
     WHERE i.trip_id = t.id AND i.title = 'Check local weather and travel advisories'
  );
