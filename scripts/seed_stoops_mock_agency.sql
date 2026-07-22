-- =============================================================================
-- CENTRAVITY MOCK RESEED (PRODUCTION ONLY)
-- Stoops Insurance & Financial Services Inc.
-- Owner auth UUID (never inserted into auth.users):
--   92fd5ac9-2372-4817-b9be-a37b38f1e6b4
-- All activity/policy timestamps end at current_date - 1 (no today/future).
-- Product mix: Auto 50% | Fire 25% | Life 10% | Commercial 5% | Health 5% | Bank 5%
-- =============================================================================

BEGIN;

-- =============================================================================
-- STEP 1: WIPE prior mock agency + production records
-- =============================================================================

DO $$
DECLARE
  v_agency_id uuid := 'a1000001-0000-4000-8000-000000000001';
  v_owner_id  uuid := '92fd5ac9-2372-4817-b9be-a37b38f1e6b4';
  r record;
BEGIN
  -- Target by fixed seed id AND by agency name (covers either path)
  FOR r IN
    SELECT id FROM public.agencies
    WHERE id = v_agency_id
       OR name = 'Stoops Insurance & Financial Services Inc.'
  LOOP
    DELETE FROM public.manual_bonuses WHERE agency_id = r.id;
    DELETE FROM public.policies      WHERE agency_id = r.id;
    DELETE FROM public.activities    WHERE agency_id = r.id;

    -- Remove mock team profiles (keep owner row; unlink below)
    DELETE FROM public.profiles
    WHERE agency_id = r.id
      AND id <> v_owner_id;

    DELETE FROM public.comp_plans WHERE agency_id = r.id;

    UPDATE public.profiles
       SET office_id = NULL,
           comp_plan_id = NULL
     WHERE id = v_owner_id
       AND agency_id = r.id;

    DELETE FROM public.offices WHERE agency_id = r.id;

    -- Owner still references agency_id → clear only if column allows; else keep row and overwrite in STEP 2
    BEGIN
      UPDATE public.profiles
         SET agency_id = NULL
       WHERE id = v_owner_id
         AND agency_id = r.id;
    EXCEPTION WHEN not_null_violation THEN
      NULL; -- agency_id is NOT NULL; agency row kept until STEP 2 upsert reuses same id
    END;

    DELETE FROM public.agencies a
    WHERE a.id = r.id
      AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.agency_id = a.id);
  END LOOP;
END $$;

-- =============================================================================
-- STEP 2: REBUILD (production + pipeline only — no comp plans / admin tiers)
-- =============================================================================

DO $$
DECLARE
  v_agency_id  uuid := 'a1000001-0000-4000-8000-000000000001';
  v_office_id  uuid := 'a1000002-0000-4000-8000-000000000001';
  v_owner_id   uuid := '92fd5ac9-2372-4817-b9be-a37b38f1e6b4';
  v_keri_id    uuid := 'a2000001-0000-4000-8000-000000000001';
  v_graysen_id uuid := 'a2000002-0000-4000-8000-000000000001';
  v_alex_id    uuid := 'a2000003-0000-4000-8000-000000000001';
  v_stormy_id  uuid := 'a2000004-0000-4000-8000-000000000001';
  v_chelsy_id  uuid := 'a2000005-0000-4000-8000-000000000001';
  v_end_day    date := current_date - 1;
  v_start_day  date := current_date - 30;
BEGIN
  -- Minimal agency shell (no comp/tier/admin settings payloads)
  INSERT INTO public.agencies (id, name)
  VALUES (v_agency_id, 'Stoops Insurance & Financial Services Inc.')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

  INSERT INTO public.offices (id, agency_id, name)
  VALUES (v_office_id, v_agency_id, 'Main Street HQ')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, agency_id = EXCLUDED.agency_id;

  -- Profiles only (no auth.users inserts). Team UUIDs reuse prior mock auth stubs if present.
  INSERT INTO public.profiles (
    id, agency_id, office_id, comp_plan_id, is_floater,
    first_name, last_name, role, is_archived
  ) VALUES
    (v_owner_id,   v_agency_id, v_office_id, NULL, false, 'Agency',  'Owner',   'owner',    false),
    (v_keri_id,    v_agency_id, v_office_id, NULL, false, 'Keri',    'Mitchell','manager',  false),
    (v_graysen_id, v_agency_id, v_office_id, NULL, false, 'Graysen', 'Cole',    'producer', false),
    (v_alex_id,    v_agency_id, v_office_id, NULL, false, 'Alex',    'Rivera',  'producer', false),
    (v_stormy_id,  v_agency_id, v_office_id, NULL, false, 'Stormy',  'Blake',   'producer', false),
    (v_chelsy_id,  v_agency_id, v_office_id, NULL, false, 'Chelsy',  'Nguyen',  'producer', false)
  ON CONFLICT (id) DO UPDATE SET
    agency_id = EXCLUDED.agency_id,
    office_id = EXCLUDED.office_id,
    comp_plan_id = NULL,
    role = EXCLUDED.role,
    is_archived = false,
    is_floater = false,
    first_name = CASE WHEN public.profiles.id = v_owner_id THEN public.profiles.first_name ELSE EXCLUDED.first_name END,
    last_name  = CASE WHEN public.profiles.id = v_owner_id THEN public.profiles.last_name  ELSE EXCLUDED.last_name  END;

  -- --------------------------------------------------------------------------
  -- Outbound calls + quoting (through v_end_day only)
  -- --------------------------------------------------------------------------
  INSERT INTO public.activities (agency_id, office_id, user_id, activity_type, logged_at)
  SELECT
    v_agency_id,
    v_office_id,
    p.user_id,
    t.activity_type,
    (d.day::timestamp
      + make_interval(hours => 8 + (t.n % 9))
      + make_interval(mins => (t.n * 7) % 55))
  FROM generate_series(v_start_day, v_end_day, '1 day'::interval) AS d(day)
  CROSS JOIN (
    VALUES
      (v_graysen_id, 36, 7),
      (v_alex_id,    33, 6),
      (v_stormy_id,  31, 6),
      (v_chelsy_id,  29, 5),
      (v_keri_id,    12, 2),
      (v_owner_id,    8, 1)
  ) AS p(user_id, touch_n, quote_n)
  CROSS JOIN LATERAL (
    SELECT 'touchpoint'::text AS activity_type, g AS n
    FROM generate_series(
      1,
      CASE WHEN EXTRACT(DOW FROM d.day) BETWEEN 1 AND 5
           THEN p.touch_n ELSE GREATEST(3, p.touch_n / 5) END
    ) g
    UNION ALL
    SELECT 'quote', g
    FROM generate_series(
      1,
      CASE WHEN EXTRACT(DOW FROM d.day) BETWEEN 1 AND 5
           THEN p.quote_n ELSE GREATEST(1, p.quote_n / 4) END
    ) g
  ) AS t(activity_type, n);

  -- --------------------------------------------------------------------------
  -- Closed/won policies (bound/issued) — strict product mix + rising premium
  -- Mix index n%20 → 10 Auto, 5 Fire, 2 Life, 1 Commercial, 1 Health, 1 Bank
  -- --------------------------------------------------------------------------
  INSERT INTO public.policies (
    agency_id, office_id, user_id, customer_name, product_line,
    premium_amount, payment_cycle, status, logged_at, written_at, issued_at
  )
  SELECT
    v_agency_id,
    v_office_id,
    s.user_id,
    initcap(c.first) || ' ' || upper(left(c.last, 1)) || '.',
    s.product_line,
    round((s.base_prem * (1 + (s.day_idx * 0.025)))::numeric, 2),
    CASE WHEN s.product_line IN ('Life', 'Health', 'Bank') THEN 'annual'
         WHEN (s.day_idx % 3) = 0 THEN 'annual'
         ELSE 'monthly' END,
    CASE
      WHEN s.day_idx >= 20 THEN 'issued'
      WHEN s.day_idx >= 10 AND (s.seq % 4) = 0 THEN 'issued'
      ELSE 'bound'
    END,
    ((v_start_day + s.day_idx)::timestamp + make_interval(hours => 10 + (s.seq % 6))),
    ((v_start_day + s.day_idx)::timestamp + make_interval(hours => 10 + (s.seq % 6))),
    CASE
      WHEN s.day_idx >= 20 OR (s.day_idx >= 10 AND (s.seq % 4) = 0)
        THEN LEAST(
               (v_start_day + s.day_idx + 2),
               v_end_day
             )::timestamp + interval '11 hours'
      ELSE NULL
    END
  FROM (
    SELECT
      d.day_idx,
      p.user_id,
      p.seq,
      (ARRAY[
        'Auto','Auto','Auto','Auto','Auto','Auto','Auto','Auto','Auto','Auto',
        'Fire','Fire','Fire','Fire','Fire',
        'Life','Life',
        'Commercial',
        'Health',
        'Bank'
      ])[1 + ((d.day_idx * 3 + p.seq) % 20)] AS product_line,
      (ARRAY[1650, 1750, 1550, 1480, 1400])[1 + ((p.seq - 1) % 5)]::numeric AS base_prem
    FROM generate_series(0, (v_end_day - v_start_day)) AS d(day_idx)
    CROSS JOIN (
      VALUES
        (v_graysen_id, 1),
        (v_graysen_id, 2),
        (v_alex_id,    1),
        (v_alex_id,    2),
        (v_stormy_id,  1),
        (v_chelsy_id,  1),
        (v_keri_id,    1)
    ) AS p(user_id, seq)
    WHERE (d.day_idx + p.seq) % CASE
            WHEN p.user_id IN (v_graysen_id, v_alex_id) THEN 2
            WHEN p.user_id = v_keri_id THEN 5
            ELSE 3
          END = 0
  ) s
  CROSS JOIN LATERAL (
    SELECT
      (ARRAY['jordan','taylor','morgan','casey','riley','avery','quinn','parker','rowan','cameron',
             'harper','drew','skyler','jamie','reid','finley','sloane','emery','kennedy','payton'])[
        1 + ((s.day_idx * 3 + s.seq) % 20)
      ] AS first,
      (ARRAY['anderson','bennett','carter','diaz','edwards','foster','garcia','hayes','ingram','jones',
             'klein','lopez','morris','nelson','owens','patel','reed','sanders','turner','vaughn'])[
        1 + ((s.day_idx * 5 + s.seq * 2) % 20)
      ] AS last
  ) AS c
  WHERE (v_start_day + s.day_idx) <= v_end_day;

  -- --------------------------------------------------------------------------
  -- Active pipeline — 20 quoted prospects, same strict product mix
  -- --------------------------------------------------------------------------
  INSERT INTO public.policies (
    agency_id, office_id, user_id, customer_name, product_line,
    premium_amount, payment_cycle, status, logged_at, written_at, issued_at
  )
  SELECT
    v_agency_id,
    v_office_id,
    q.user_id,
    q.customer_name,
    q.product_line,
    q.premium_amount,
    q.payment_cycle,
    'quoted',
    (v_end_day - q.days_ago)::timestamp + q.tod,
    (v_end_day - q.days_ago)::timestamp + q.tod,
    NULL
  FROM (
    VALUES
      -- 10 Auto (50%)
      (v_graysen_id, 'Hannah W.', 'Auto',       1920::numeric, 'monthly', 1,  interval '10 hours'),
      (v_graysen_id, 'Theo A.',   'Auto',       2100,          'monthly', 0,  interval '9 hours'),
      (v_alex_id,    'Priya M.',  'Auto',       1680,          'monthly', 2,  interval '11 hours'),
      (v_alex_id,    'Chris B.',  'Auto',       1540,          'monthly', 4,  interval '14 hours'),
      (v_stormy_id,  'Ivy Q.',    'Auto',       1490,          'monthly', 1,  interval '8 hours'),
      (v_stormy_id,  'Mark D.',   'Auto',       1720,          'annual',  5,  interval '13 hours'),
      (v_chelsy_id,  'Nora J.',   'Auto',       1450,          'monthly', 0,  interval '15 hours'),
      (v_chelsy_id,  'Paul S.',   'Auto',       1630,          'monthly', 3,  interval '12 hours'),
      (v_keri_id,    'Dean P.',   'Auto',       1320,          'monthly', 2,  interval '10 hours'),
      (v_graysen_id, 'Amy R.',    'Auto',       1880,          'monthly', 6,  interval '16 hours'),
      -- 5 Fire (25%)
      (v_graysen_id, 'Bryce L.',  'Fire',       2450,          'annual',  2,  interval '11 hours'),
      (v_alex_id,    'Elena V.',  'Fire',       2050,          'monthly', 3,  interval '9 hours'),
      (v_stormy_id,  'Sage H.',   'Fire',       1880,          'monthly', 4,  interval '14 hours'),
      (v_chelsy_id,  'Rita M.',   'Fire',       2210,          'annual',  1,  interval '10 hours'),
      (v_keri_id,    'Willow S.', 'Fire',       1760,          'annual',  5,  interval '13 hours'),
      -- 2 Life (10%)
      (v_graysen_id, 'Nadia C.',  'Life',       4800,          'annual',  1,  interval '12 hours'),
      (v_stormy_id,  'Caleb N.',  'Life',       3900,          'annual',  3,  interval '15 hours'),
      -- 1 Commercial (5%)
      (v_alex_id,    'Marcus T.', 'Commercial', 5400,          'annual',  2,  interval '11 hours'),
      -- 1 Health (5%)
      (v_chelsy_id,  'Felix R.',  'Health',     2650,          'annual',  4,  interval '10 hours'),
      -- 1 Bank/Other (5%)
      (v_alex_id,    'Ruby K.',   'Bank',       1200,          'annual',  0,  interval '14 hours')
  ) AS q(user_id, customer_name, product_line, premium_amount, payment_cycle, days_ago, tod);

END $$;

COMMIT;
