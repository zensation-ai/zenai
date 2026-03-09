# CI/CD Pipeline

> ZenAI - Enterprise AI Platform
> Last updated: 2026-03-09

## Overview

The CI/CD pipeline runs on GitHub Actions and validates every push to `main` and every pull request targeting `main`. It ensures code quality, type safety, test coverage, and build integrity before changes reach production.

## Pipeline Architecture

```
                    ┌─────────┐
                    │ install │
                    └────┬────┘
                         │
            ┌────────────┼────────────┐
            │            │            │
   ┌────────▼───┐  ┌─────▼─────┐  ┌──▼──────────┐
   │lint-backend│  │test-backend│  │lint-frontend │
   └────────┬───┘  └────────────┘  └──┬──────────┘
            │                         │
   ┌────────▼────┐            ┌───────▼───────┐
   │build-backend│            │build-frontend │
   └─────────┬───┘            └───────┬───────┘
             │                        │
             │   ┌──────────────┐     │
             └──►│ deploy-ready │◄────┘
                 │  (main only) │◄──── test-backend
                 └──────────────┘◄──── test-frontend
```

## Jobs

| Job | Depends On | Timeout | Purpose |
|-----|-----------|---------|---------|
| `install` | - | default | Install pnpm dependencies, cache `node_modules` |
| `lint-backend` | install | 10 min | TypeScript `tsc --noEmit` + ESLint for `backend/` |
| `lint-frontend` | install | 10 min | TypeScript `tsc --noEmit` for `frontend/` |
| `test-backend` | install | 15 min | Jest tests (2350+ tests, `--maxWorkers=2`) |
| `test-frontend` | install | 10 min | Vitest tests (548+ tests) |
| `build-frontend` | lint-frontend | 10 min | Vite production build |
| `build-backend` | lint-backend | 10 min | TypeScript compilation |
| `deploy-ready` | all above | default | Gate for deployment (main branch only) |

## Triggers

- **Push to `main`**: Full pipeline including deploy-ready gate
- **Pull request to `main`**: Full pipeline (deploy-ready skipped)

Concurrent runs on the same branch are cancelled automatically (`concurrency` setting).

## Caching

Dependencies are cached using the `actions/cache` action:

- **Key**: `pnpm-{os}-{hash(pnpm-lock.yaml)}`
- **Paths**: `node_modules`, `frontend/node_modules`, `backend/node_modules`, `packages/*/node_modules`
- The `install` job saves the cache; all other jobs restore it
- Each job includes a fallback `pnpm install --frozen-lockfile` in case cache misses

## Environment Variables in CI

| Variable | Value | Purpose |
|----------|-------|---------|
| `NODE_ENV` | `test` | Backend test environment |
| `CI` | `true` | Signals CI environment |
| `SKIP_EXTERNAL_SERVICES` | `true` | Skips DB, Redis, external API calls in tests |
| `NODE_OPTIONS` | `--max-old-space-size=4096` | Prevents OOM in large test suites |

## Production Deployment

Deployment is handled automatically by external services, not by GitHub Actions:

| Service | Platform | Trigger |
|---------|----------|---------|
| **Backend** | Railway | Auto-deploy on push to `main` |
| **Frontend** | Vercel | Auto-deploy on push to `main` |

The `deploy-ready` job serves as a gate confirming all checks passed.

## Running Locally

```bash
# Full pipeline equivalent
pnpm install
cd backend && npx tsc --noEmit && pnpm run lint && pnpm test
cd ../frontend && npx tsc --noEmit && pnpm test && pnpm run build
```

## PR Template

A pull request template at `.github/pull_request_template.md` provides a standard checklist:

- Summary and change description
- Test plan with checkboxes
- Checklist: TypeScript clean, no console.log, tests added, screenshots for UI changes
