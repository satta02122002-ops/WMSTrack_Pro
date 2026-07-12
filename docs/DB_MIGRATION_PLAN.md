# Relational Database Migration Plan (M1 / M2)

Status: **design — not yet executed.** This is a deliberate, staged plan; it is
not a change to run blind against production. The current single-JSONB-document
store (`app_state`) works at present scale but caps querying, integrity, and
concurrent-write throughput. This document is the blueprint for moving the
high-volume, high-value data to real relational tables.

## Why staged, not big-bang

The whole stack — client store, sync engine, billing engine, every page — assumes
the whole-document model. A one-shot rewrite would touch all of it plus a data
migration and cannot be validated without a staging PostgreSQL instance and an
integration test suite. So the plan is incremental, reversible, and behind a
dual-write/dual-read seam.

## Target schema (first phase — transactional entities)

Keep reference/master data (customers, rates, activities, UOMs, …) in the JSONB
document initially; migrate the **append-heavy, query-heavy** entities first:

```
customers(id pk, name, currency, created_at, updated_at)         -- later phase
operations_activities(
  id pk, customer_id fk, customer_ref, activity_type, storage_type,
  status, owner_user_id, assigned_to_user_id, date, start_time, end_time,
  duration_seconds, qty_lines jsonb, cbm, storage_type_used, handling_mode,
  vehicle_type, truck_count, package_lines jsonb, outcome,
  created_at, updated_at)
  indexes: (date), (customer_id, date), (status), (owner_user_id)
storage_movements(
  id pk, customer_id fk, reference, date, type, cbm, storage_type,
  handling_mode, container_size, truck_count, package_lines jsonb,
  storage_days, apply_handling bool, source_activity_id fk, created_at)
  indexes: (date), (customer_id, date), (source_activity_id)
handling_charges(id pk, customer_id fk, date, reference, cbm,
  package_qty, package_uom, currency, created_at)
  indexes: (date), (customer_id, date)
vas_charges(id pk, customer_id fk, date, reference, quantity, charge, currency)
  indexes: (date), (customer_id, date)
attendance(id pk, user_id fk, date, check_in, check_out, hours,
  unique(user_id, date))  indexes: (date)
billed_records(id pk, period_key, billed_by, billed_date, created_at)
billed_lines(billed_record_id fk, line_id, unique(line_id))  -- line_id stays stable
audit_log(id pk, date_time, user_name, action, entity_type, details)
  indexes: (date_time desc)   -- capped/rotated
```

Notes:
- Keep the existing **stable billing line ids** (`act:…`, `sto:…:date`, `han:…`)
  so billed status survives the cutover.
- `qty_lines` / `package_lines` stay JSONB columns (naturally nested, not
  separately queried) — pragmatic, not a normalization failure.

## Phases

1. **Add tables + backfill (read still JSONB).** Create tables via a migration
   tool (e.g. `node-pg-migrate`). One-off script copies current JSONB arrays into
   tables. No behaviour change yet.
2. **Dual-write.** The sync endpoint continues to write JSONB *and* also writes
   the migrated collections to their tables in the same transaction. Reads still
   come from JSONB. Verify parity in staging.
3. **Cut reads over.** Add REST endpoints (`GET /api/operations?from&to&customer`
   with pagination, etc.) and point the relevant pages (Operations Monitor
   history, Monthly Billing, Reports) at them. The billing engine reads from
   tables for the requested range instead of the whole document.
4. **Client store split.** Move the migrated collections out of the in-memory
   whole-document; pages fetch per-view with pagination. Keep reference data in
   the light document (loaded once).
5. **Drop dual-write.** Once reads are fully on tables and verified, stop writing
   those arrays into JSONB. `app_state` shrinks to reference/settings only.

## Rollback

Each phase is independently reversible: phases 1–2 add only; phase 3 is a
per-page endpoint switch (revert the page); the JSONB copy remains authoritative
until phase 5. The backup/snapshot facility (already shipped) provides
point-in-time recovery throughout.

## Prerequisites before executing

- A **staging PostgreSQL** instance and seed/anonymized data.
- An **integration test** harness hitting a real database (the current unit
  tests cover pure logic only).
- A migration tool and CI step to run/verify migrations.

## Interim mitigations already shipped

- **Point-in-time backups** (`app_state_history` + Developer restore) close the
  zero-recovery data-integrity gap now.
- **Record-level sync** already avoids whole-document write clobbering.
- **Server-side per-collection authorization** limits who can write what.
