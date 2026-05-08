# ZenAI Production Runbook

## Post-Deployment Checklist

Run this after every production deployment:

- [ ] `GET /api/health/detailed` returns all services green
- [ ] Test login flow (email/password + OAuth)
- [ ] Verify chat streaming works (send a test message)
- [ ] Check `/api/metrics` is reachable (Prometheus scraping)
- [ ] Review Sentry for new errors in the last 5 minutes

## Environment Setup

### Required Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL + pgvector | `postgresql://user:pass@host:5432/db` |
| `ANTHROPIC_API_KEY` | Claude API | `sk-ant-...` |
| `JWT_SECRET` | Token signing | min. 32 random chars |
| `ENCRYPTION_KEY` | AES-256 field encryption | 32-byte hex string |

Generate secrets:
```bash
# JWT_SECRET
openssl rand -base64 32

# ENCRYPTION_KEY (32 bytes hex)
openssl rand -hex 32
```

### Database Initialization

First deploy only:
```bash
# Via Railway/Docker:
cd backend && npm run db:init

# This runs all migrations and creates the 4 context schemas:
# personal, work, learning, creative + demo
```

### Database Migrations (subsequent deploys)

ZenAI runs migrations automatically on startup (`npm run db:init` is idempotent). Manual trigger:
```bash
cd backend && npm run db:init
```

If a migration fails:
1. Check logs for the failing SQL statement
2. Connect to DB: `psql $DATABASE_URL`
3. Run the failing migration manually
4. Re-run `npm run db:init` to continue

## Domain & SSL (Railway + Vercel)

### Backend (Railway)
1. Railway Settings → Networking → Add Custom Domain
2. Add CNAME record: `api.yourdomain.com` → `your-app.railway.app`
3. Railway auto-provisions Let's Encrypt SSL

### Frontend (Vercel)
1. Vercel Dashboard → Project → Settings → Domains
2. Add domain: `app.yourdomain.com`
3. Add CNAME to DNS: `app.yourdomain.com` → `cname.vercel-dns.com`
4. Vercel auto-provisions SSL

### Environment Variables for Custom Domain
```bash
# Backend: set these in Railway
FRONTEND_URL=https://app.yourdomain.com
CORS_ORIGIN=https://app.yourdomain.com

# Frontend: set in Vercel
VITE_API_URL=https://api.yourdomain.com
```

## Database Backups

### Supabase (Recommended)
Supabase auto-backs up daily on paid plans. Manual backup:
```bash
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

### Railway
Railway Postgres: Settings → Backups → Enable automatic backups (daily, 7-day retention).

### Restore
```bash
psql $DATABASE_URL < backup-YYYYMMDD.sql
```

## Monitoring

### Health Endpoints
| Endpoint | Purpose | Auth |
|----------|---------|------|
| `GET /api/health/live` | Liveness probe | None |
| `GET /api/health/ready` | Readiness probe | None |
| `GET /api/health/detailed` | Full system status | Optional |
| `GET /api/metrics` | Prometheus metrics | None |

### Sentry
Set `SENTRY_DSN` in environment. Errors are automatically captured with context.

### Logs (Railway)
```bash
railway logs --tail
railway logs --filter "ERROR"
```

## Scaling

### Horizontal Scaling
The backend is stateless except for:
- In-memory document store (generated files): evicted after 1h, acceptable to lose on restart
- WebSocket voice sessions: sticky sessions recommended

For Railway: increase replicas in Settings → Deploy → Instances.

### Redis for Session Sharing
When running multiple backend instances, ensure `REDIS_URL` is set — session data and BullMQ queues are stored in Redis automatically.

## Common Issues

### "Cannot connect to database"
1. Check `DATABASE_URL` format: `postgresql://user:pass@host:port/dbname`
2. Verify pgvector extension is installed: `SELECT * FROM pg_extension WHERE extname = 'vector';`
3. Check network rules allow backend → database connection

### "Claude API errors / fallback to Ollama"
1. Verify `ANTHROPIC_API_KEY` is set and valid
2. Check usage limits at console.anthropic.com
3. If `OLLAMA_URL` is set, the system falls back automatically

### "JWT invalid" after deploy
1. Ensure `JWT_SECRET` has not changed between deploys
2. All active sessions use the old secret — users must log in again if changed

### "BullMQ workers not processing jobs"
1. Verify `REDIS_URL` is set and reachable
2. Check Redis memory: `redis-cli info memory`
3. Workers restart automatically on next deploy

### "Embedding drift detected in logs"
Normal behavior. The embedding drift worker runs daily and logs when semantic drift exceeds 10%. No action needed unless drift > 30%.

## Rollback Procedure

### Railway
```bash
railway rollback  # reverts to previous deployment
```

Or via dashboard: Deployments → select previous → Redeploy.

### Database Rollback
ZenAI migrations are additive (no destructive DDL). If a migration caused issues:
1. Rollback the code deployment
2. The old code works with the new schema (additive changes are backwards-compatible)
3. If column was dropped, restore from backup

## Emergency Contacts
- Anthropic status: status.anthropic.com
- Railway status: status.railway.app
- Vercel status: vercel-status.com
- Supabase status: status.supabase.com
