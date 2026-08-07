-- Seed: industry taxonomy, context-dimension registry, Health Tourism funnel.
-- Adding a vertical/subcategory/dimension later is just another INSERT — no DDL
-- (docs/02 §3–4). Idempotent via ON CONFLICT on the natural keys.

-- ── verticals ───────────────────────────────────────────────────────────────
INSERT INTO taxonomy.node (parent_id, key, label, level, path) VALUES
  (NULL, 'health-tourism', 'Health Tourism', 0, 'health-tourism'),
  (NULL, 'ecommerce',      'E-commerce',     0, 'ecommerce'),
  (NULL, 'services',       'Services',       0, 'services')
ON CONFLICT (path) DO NOTHING;

-- ── Health Tourism subcategories ────────────────────────────────────────────
INSERT INTO taxonomy.node (parent_id, key, label, level, path)
SELECT ht.id, v.key, v.label, 1, 'health-tourism/' || v.key
FROM taxonomy.node ht
CROSS JOIN (VALUES
  ('rhinoplasty',      'Rhinoplasty'),
  ('dental',           'Dental'),
  ('facelift',         'Facelift'),
  ('breast-surgery',   'Breast Surgery'),
  ('hair-transplant',  'Hair Transplant'),
  ('bariatric-surgery','Bariatric Surgery'),
  ('body-contouring',  'Body Contouring')
) AS v(key, label)
WHERE ht.path = 'health-tourism'
ON CONFLICT (path) DO NOTHING;

-- ── context dimension registry ──────────────────────────────────────────────
INSERT INTO taxonomy.dimension (key, label, value_type, config) VALUES
  ('vertical',          'Vertical',           'taxonomy_ref', '{}'),
  ('subcategory',       'Subcategory',        'taxonomy_ref', '{}'),
  ('platform',          'Platform',           'enum', '{}'),
  ('country',           'Country',            'enum', '{}'),
  ('market',            'Market',             'enum', '{}'),
  ('language',          'Language',           'enum', '{}'),
  ('objective',         'Campaign Objective', 'enum', '{}'),
  ('conversion_type',   'Conversion Type',    'enum', '{}'),
  ('funnel_stage',      'Funnel Stage',       'enum', '{}'),
  ('budget_range',      'Budget Range',       'range', '{"buckets":["low","mid","high"]}'),
  ('account_maturity',  'Account Maturity',   'range', '{"buckets":["new","ramping","mature"]}'),
  ('campaign_maturity', 'Campaign Maturity',  'range', '{"buckets":["learning","stabilizing","mature"]}'),
  ('creative_format',   'Creative Format',    'enum', '{}'),
  ('creative_attributes','Creative Attributes','embedding', '{"dims":1024}'),
  ('offer_type',        'Offer Type',         'enum', '{}'),
  ('seasonality',       'Seasonality',        'enum', '{}'),
  ('lead_quality',      'Lead Quality',       'range', '{"buckets":["low","mid","high"]}'),
  ('sales_quality',     'Sales Quality',      'range', '{"buckets":["standard","premium"]}')
ON CONFLICT (key) DO NOTHING;

-- a few controlled values for enum/range dims (examples; extensible)
INSERT INTO taxonomy.dimension_value (dimension_id, value, ordinal)
SELECT d.id, v.value, v.ordinal FROM taxonomy.dimension d
JOIN (VALUES
  ('platform','meta',NULL::int), ('platform','google',NULL), ('platform','tiktok',NULL),
  ('budget_range','low',0), ('budget_range','mid',1), ('budget_range','high',2),
  ('campaign_maturity','learning',0), ('campaign_maturity','stabilizing',1), ('campaign_maturity','mature',2),
  ('conversion_type','form-lead',NULL), ('conversion_type','call',NULL),
  ('conversion_type','purchase',NULL), ('conversion_type','booking',NULL)
) AS v(dim,value,ordinal) ON d.key = v.dim
ON CONFLICT (dimension_id, value) DO NOTHING;

-- ── Health Tourism funnel (Ad→Lead→…→Sale→Revenue), stages are DATA ─────────
INSERT INTO crm.funnel_stage (vertical_node_id, key, label, ordinal)
SELECT ht.id, s.key, s.label, s.ordinal
FROM taxonomy.node ht
JOIN (VALUES
  ('lead',                 'Lead',                 1),
  ('contacted',            'Contacted',            2),
  ('qualified',            'Qualified',            3),
  ('commercial_opportunity','Commercial Opportunity',4),
  ('booking',              'Booking',              5),
  ('sale',                 'Sale',                 6)
) AS s(key,label,ordinal) ON true
WHERE ht.path = 'health-tourism'
ON CONFLICT (vertical_node_id, key) DO NOTHING;
