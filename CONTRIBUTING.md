# Contributing to ZenAI

Thank you for your interest in contributing to ZenAI!

## Getting Started

1. Fork the repo
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/zenai.git`
3. Install dependencies: `cd backend && npm install && cd ../frontend && npm install`
4. Copy env: `cp backend/.env.example backend/.env`
5. Run tests: `cd backend && npm test`
6. Create a branch: `git checkout -b my-feature`

## Development

### Backend
```bash
cd backend && npm run dev    # Start dev server (port 3000)
cd backend && npm test       # Run tests (9,228 tests)
cd backend && npm run build  # TypeScript build
```

### Frontend
```bash
cd frontend && npm run dev   # Start Vite dev server (port 5173)
cd frontend && npx vitest run  # Run tests
cd frontend && npm run build   # Production build
```

## Code Standards

- TypeScript with `strict: true`
- All new code must have tests
- Run `npm run build` before committing (must pass with 0 errors)
- Use `asyncHandler` wrapper for all Express routes
- Use `queryContext(context, sql, params)` for database queries (not raw pool.query)
- 4 DB contexts: `personal`, `work`, `learning`, `creative`

## Pull Requests

- One feature per PR
- Include tests for new functionality
- Update API docs if adding/changing endpoints
- Reference related issues
- Keep PRs focused — large PRs are harder to review

## Architecture

See [CLAUDE.md](./CLAUDE.md) for the full architecture guide, API endpoints, and key files.

## License

By contributing, you agree that your contributions will be licensed under Apache 2.0.
