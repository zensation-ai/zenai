# SQL Migrations

## Current State
All database schemas are managed via manual migrations applied through Supabase SQL Editor.
There is no automated migration runner.

## Archive
The `archive/` directory contains all 104 historical migrations from Phases 1-118.
These are preserved for reference but should not be re-run on existing databases.

## Schema Structure
- **personal** — Personal context data
- **work** — Work context data
- **learning** — Learning context data
- **creative** — Creative context data
- **public** — Shared tables (users, auth, agent config)

Each context schema contains ~95 identical tables with schema isolation via `SET search_path`.

## Consolidated on
2026-03-21 (Phase 119 Quality Audit)
