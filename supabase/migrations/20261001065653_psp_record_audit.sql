-- Audit trail for admin edits of psp_records.
-- Not applied until explicitly approved.
-- public.crews already exists in production; this migration does not recreate it.

create table public.psp_record_audit (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.psp_records(id) on delete restrict,
  crew_id uuid references public.crews(id) on delete set null,
  changed_by text not null,
  changed_at timestamptz not null default now(),
  reason text,
  action text not null check (action in ('edit', 'delete_layer', 'add_layer')),
  before jsonb not null,
  after jsonb not null
);

create index psp_record_audit_record_id_changed_at_idx
  on public.psp_record_audit (record_id, changed_at desc);

alter table public.psp_record_audit enable row level security;

create policy "service_role full access"
  on public.psp_record_audit
  for all
  to service_role
  using (true)
  with check (true);

revoke all on public.psp_record_audit from public, anon, authenticated;

create or replace function public.psp_record_admin_edit(
  p_record_id uuid,
  p_expected_updated_at timestamptz,
  p_layers_required integer,
  p_readings jsonb,
  p_changed_by text,
  p_reason text,
  p_action text
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  r public.psp_records%rowtype;
  v_cur jsonb;
  v_next jsonb;
  v_before jsonb;
  v_after jsonb;
  v_key text;
  v_val jsonb;
  v_layer int;
  v_suffix text;
  v_int int;
  v_was boolean := true;
  v_now boolean := true;
  v_completed timestamptz;
  v_updated timestamptz;
  v_crew uuid;
  v_reason text;
begin
  if p_changed_by is null or btrim(p_changed_by) = '' then
    raise exception 'psp_record_invalid_actor' using errcode = '22023';
  end if;
  if p_action not in ('edit', 'delete_layer', 'add_layer') then
    raise exception 'psp_record_invalid_action' using errcode = '22023';
  end if;
  if p_layers_required is null or p_layers_required < 1 or p_layers_required > 5 then
    raise exception 'psp_record_invalid_layers' using errcode = '22023';
  end if;
  if p_readings is null or jsonb_typeof(p_readings) <> 'object' then
    raise exception 'psp_record_invalid_readings' using errcode = '22023';
  end if;

  select * into r
  from public.psp_records
  where id = p_record_id
  for update;

  if not found then
    raise exception 'psp_record_not_found' using errcode = 'P0002';
  end if;

  if r.updated_at is distinct from p_expected_updated_at then
    raise exception 'psp_record_conflict' using errcode = 'P0001';
  end if;

  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if r.sign_off_at is not null and v_reason is null then
    raise exception 'psp_record_reason_required' using errcode = '22023';
  end if;

  if p_layers_required > coalesce(r.layers_required, 3) + 1 then
    raise exception 'psp_record_invalid_layers' using errcode = '22023';
  end if;
  if p_action = 'add_layer' and p_layers_required <> coalesce(r.layers_required, 3) + 1 then
    raise exception 'psp_record_invalid_action' using errcode = '22023';
  end if;
  if p_action = 'delete_layer' and p_layers_required >= coalesce(r.layers_required, 3) then
    raise exception 'psp_record_invalid_action' using errcode = '22023';
  end if;
  if p_action = 'edit' and p_layers_required <> coalesce(r.layers_required, 3) then
    raise exception 'psp_record_invalid_action' using errcode = '22023';
  end if;

  for v_key, v_val in select key, value from jsonb_each(p_readings)
  loop
    if v_key !~ '^l[1-5]_(150|450|750)$' then
      raise exception 'psp_record_invalid_readings' using errcode = '22023';
    end if;
    v_layer := substring(v_key from 2 for 1)::int;
    if jsonb_typeof(v_val) = 'null' then
      continue;
    end if;
    if jsonb_typeof(v_val) <> 'number' then
      raise exception 'psp_record_invalid_readings' using errcode = '22023';
    end if;
    begin
      v_int := (p_readings->>v_key)::numeric::int;
    exception when others then
      raise exception 'psp_record_invalid_readings' using errcode = '22023';
    end;
    if v_int < 0 or v_int > 35 then
      raise exception 'psp_record_invalid_readings' using errcode = '22023';
    end if;
    if v_layer > p_layers_required then
      raise exception 'psp_record_layer_gap' using errcode = '22023';
    end if;
  end loop;

  v_cur := to_jsonb(r);
  v_next := '{}'::jsonb;
  for v_layer in 1..5 loop
    foreach v_suffix in array array['150', '450', '750'] loop
      v_key := format('l%s_%s', v_layer, v_suffix);
      if v_layer > p_layers_required then
        v_next := v_next || jsonb_build_object(v_key, null);
      elsif p_readings ? v_key and jsonb_typeof(p_readings->v_key) = 'null' then
        v_next := v_next || jsonb_build_object(v_key, null);
      elsif p_readings ? v_key then
        v_next := v_next || jsonb_build_object(v_key, (p_readings->>v_key)::numeric::int);
      else
        v_next := v_next || jsonb_build_object(v_key, v_cur->v_key);
      end if;
    end loop;
  end loop;

  v_was := true;
  for v_layer in 1..coalesce(r.layers_required, 3) loop
    if v_cur->>format('l%s_150', v_layer) is null
       or v_cur->>format('l%s_450', v_layer) is null
       or v_cur->>format('l%s_750', v_layer) is null then
      v_was := false;
    end if;
  end loop;

  v_now := true;
  for v_layer in 1..p_layers_required loop
    if v_next->>format('l%s_150', v_layer) is null
       or v_next->>format('l%s_450', v_layer) is null
       or v_next->>format('l%s_750', v_layer) is null then
      v_now := false;
    end if;
  end loop;

  if v_now then
    if v_was and r.completed_at is not null then
      v_completed := r.completed_at;
    else
      v_completed := now();
    end if;
  else
    v_completed := null;
  end if;

  v_before := jsonb_build_object(
    'layers_required', r.layers_required,
    'completed_at', r.completed_at,
    'l1_150', r.l1_150, 'l1_450', r.l1_450, 'l1_750', r.l1_750,
    'l2_150', r.l2_150, 'l2_450', r.l2_450, 'l2_750', r.l2_750,
    'l3_150', r.l3_150, 'l3_450', r.l3_450, 'l3_750', r.l3_750,
    'l4_150', r.l4_150, 'l4_450', r.l4_450, 'l4_750', r.l4_750,
    'l5_150', r.l5_150, 'l5_450', r.l5_450, 'l5_750', r.l5_750
  );

  update public.psp_records set
    layers_required = p_layers_required,
    l1_150 = nullif(v_next->>'l1_150', '')::int,
    l1_450 = nullif(v_next->>'l1_450', '')::int,
    l1_750 = nullif(v_next->>'l1_750', '')::int,
    l2_150 = nullif(v_next->>'l2_150', '')::int,
    l2_450 = nullif(v_next->>'l2_450', '')::int,
    l2_750 = nullif(v_next->>'l2_750', '')::int,
    l3_150 = nullif(v_next->>'l3_150', '')::int,
    l3_450 = nullif(v_next->>'l3_450', '')::int,
    l3_750 = nullif(v_next->>'l3_750', '')::int,
    l4_150 = nullif(v_next->>'l4_150', '')::int,
    l4_450 = nullif(v_next->>'l4_450', '')::int,
    l4_750 = nullif(v_next->>'l4_750', '')::int,
    l5_150 = nullif(v_next->>'l5_150', '')::int,
    l5_450 = nullif(v_next->>'l5_450', '')::int,
    l5_750 = nullif(v_next->>'l5_750', '')::int,
    completed_at = v_completed,
    updated_at = now()
  where id = p_record_id
  returning updated_at into v_updated;

  v_after := v_next || jsonb_build_object(
    'layers_required', p_layers_required,
    'completed_at', v_completed,
    'updated_at', v_updated
  );

  if r.location_id is not null then
    select crew_id into v_crew from public.locations where id = r.location_id;
  else
    select crew_id into v_crew from public.sections where id = r.unified_section_id;
  end if;

  insert into public.psp_record_audit (
    record_id, crew_id, changed_by, reason, action, before, after
  ) values (
    p_record_id, v_crew, btrim(p_changed_by), v_reason, p_action, v_before, v_after
  );

  return v_after;
end;
$fn$;

revoke all on function public.psp_record_admin_edit(uuid, timestamptz, integer, jsonb, text, text, text)
  from public, anon, authenticated;
grant execute on function public.psp_record_admin_edit(uuid, timestamptz, integer, jsonb, text, text, text)
  to service_role;
