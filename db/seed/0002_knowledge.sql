-- Seed: a starter slice of RTN Strategy Memory (idempotent).

INSERT INTO knowledge.playbook (scope, title, body_md, source)
SELECT '{"vertical":"health-tourism","subcategory":"rhinoplasty","platform":"meta"}'::jsonb,
       'Rhinoplasty on Meta — RTN playbook',
       '# Rhinoplasty / Meta\n- Lead on qualified-lead economics, not blended CPL.\n- Doctor-present before/after video historically lifts qualification.\n- Protect learning-phase ad sets from budget shocks.',
       'rtn-strategy'
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge.playbook
  WHERE scope = '{"vertical":"health-tourism","subcategory":"rhinoplasty","platform":"meta"}'::jsonb
);

INSERT INTO knowledge.benchmark_ref (scope, metric, value, unit, sample, source)
SELECT v.scope::jsonb, v.metric, v.value, v.unit, v.sample::jsonb, 'rtn-strategy'
FROM (VALUES
  ('{"vertical":"health-tourism","subcategory":"rhinoplasty","market":"uk"}', 'cost_per_qualified_lead', 6000, 'GBP_minor', '{"campaigns":22,"conversions":3100}'),
  ('{"vertical":"health-tourism","subcategory":"rhinoplasty","market":"uk"}', 'cpl', 4500, 'GBP_minor', '{"campaigns":22,"conversions":8200}'),
  ('{"vertical":"health-tourism","subcategory":"dental","market":"de"}', 'cpl', 5200, 'EUR_minor', '{"campaigns":15,"conversions":5400}')
) AS v(scope, metric, value, unit, sample)
WHERE NOT EXISTS (
  SELECT 1 FROM knowledge.benchmark_ref b
  WHERE b.scope = v.scope::jsonb AND b.metric = v.metric
);
