-- Audit potentially mis-scoped compaction reports.
-- A report is flagged when its subsection_id points to a subsection whose section_id
-- does not match psp_reports.unified_section_id.
select
  r.id,
  r.location_id,
  r.unified_section_id as report_section_id,
  r.subsection_id as report_subsection_id,
  ss.section_id as subsection_section_id,
  r.block_key,
  r.status,
  r.created_at
from psp_reports r
join subsections ss on ss.id = r.subsection_id
where r.report_type = 'compaction'
  and r.subsection_id is not null
  and (r.unified_section_id is distinct from ss.section_id)
order by r.created_at desc;

-- Optional one-time backfill:
-- realign report section id to the subsection's actual section id
-- for rows flagged by the audit query above.
--
-- update psp_reports r
-- set unified_section_id = ss.section_id
-- from subsections ss
-- where r.subsection_id = ss.id
--   and r.report_type = 'compaction'
--   and r.subsection_id is not null
--   and (r.unified_section_id is distinct from ss.section_id);
