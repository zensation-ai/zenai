# Runbook — ENCRYPTION_KEY Rotation (Dual-Key)

**Sprint:** 1.5 (Security-Hardening Woche 5, Item 3)
**Scope:** Zero-Downtime-Rotation des AES-256-GCM Field-Encryption-Keys.
**Zielgruppe:** Security-Oncall + SRE.
**Zuletzt validiert:** 2026-04-19 (Sprint 1.5-Rollout).

---

## Wann rotieren?

- **Plan-mäßig:** alle 12 Monate (NIST SP 800-57 Rev. 5, §5.3.6 — "moderate"-Lifetime für Storage-Keys).
- **Ad-hoc:** Key-Leak-Verdacht, Mitarbeiter-Offboarding mit Key-Zugriff, nach einem Sicherheitsvorfall.

**Nicht während:** Feature-Freeze für Major-Release, laufende Migration, offene P0-Incidents.

---

## Vorbedingungen

- [ ] Backend läuft mit Sprint 1.5+ (`field-encryption.ts` mit Dual-Key-Support; `isDualKeyModeActive` existiert).
- [ ] DB-Backup der letzten 24h verfügbar (oder PITR-Point).
- [ ] Runbook im eigenen Terminal-Tab geöffnet.
- [ ] `docs/SECURITY-AUDIT-RLS-PER-CONTEXT.md` als Kontext gelesen.

---

## Schritt-für-Schritt

### Phase 0 — Neuen Key generieren

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# oder:
npx tsx -e "import { generateEncryptionKey } from './backend/src/services/security/field-encryption'; console.log(generateEncryptionKey())"
```

Ergibt einen 64-stelligen Hex-String. **Niemals** via Slack/Email senden — nur via
Password-Manager oder Secrets-Manager (1Password, Vault, AWS Secrets Manager).

### Phase 1 — ENV-Swap

Im Secrets-Store (Railway / Supabase / 1Password):

```
ENCRYPTION_KEY_PREVIOUS = <aktueller ENCRYPTION_KEY>   # vorher kopiert!
ENCRYPTION_KEY           = <neuer 64-Zeichen-Hex>
```

Deploy das Backend neu. Logs-Check:

```
[grep] "Field-level encryption initialized (dual-key mode)"
```

**Health-Check:**
```bash
curl https://api.example.com/api/health/detailed | jq .encryption
# Expected: { "available": true, "dual_key_mode": true }
```

### Phase 2 — Rotation-Script dry-run

```bash
export DATABASE_URL="postgres://…"
export ENCRYPTION_KEY="<neuer key>"
export ENCRYPTION_KEY_PREVIOUS="<alter key>"

npx tsx scripts/rotate-encryption-key.ts --dry-run --json > /tmp/rotation-preview.json
```

Prüfe den Summary: wie viele Zeilen würden rotiert werden? Plausibilisierung.

### Phase 3 — Rotation durchführen

```bash
npx tsx scripts/rotate-encryption-key.ts --batch-size=1000 2>&1 | tee /tmp/rotation-$(date +%F).log
```

Erwartetes Verhalten:
- Scannt alle P0 + P1-Encrypted-Felder.
- Skippt alle Zeilen, die bereits `enc:v1:A:` sind (idempotent).
- Re-encrypted `enc:v1:B:…`- und Legacy-`enc:v1:…`-Werte mit dem neuen CURRENT-Key.
- Progress-Log alle 100 rotierten Zeilen.

**Exit-Codes:**
- `0` — erfolgreich.
- `1` — mindestens eine Zeile fehlgeschlagen (siehe Log, welche `id`).
- `2` — Konfigurations-Fehler (keys fehlen, DATABASE_URL fehlt).

**Bei Fehler:** sofortiger Stop — siehe Rollback.

### Phase 4 — Smoke-Test

```bash
# Stichprobe: pick 10 rotierte Zeilen, verifiziere read-path.
psql $DATABASE_URL -c "SELECT id, left(mfa_secret, 10) FROM public.users WHERE mfa_secret IS NOT NULL LIMIT 10;"
# Alle sollten mit 'enc:v1:A:' starten.

# Integration: Login eines Test-Users mit MFA-Secret durchführen.
```

### Phase 5 — Alt-Key-Karenzzeit (7 Tage)

`ENCRYPTION_KEY_PREVIOUS` bleibt gesetzt für 7 Tage. Grund: falls ein gecachter
Legacy-Ciphertext (z.B. aus BullMQ-Queue, aus Offline-Client) auftaucht, kann er
noch entschlüsselt werden.

Nach 7 Tagen + verifiziertem Rotation-Log:

```
ENCRYPTION_KEY_PREVIOUS =   (leeren oder löschen)
```

Deploy. Logs-Check:
```
[grep] "Field-level encryption initialized (single-key mode)"
```

---

## Rollback

Rotation ist idempotent und non-destruktiv — aber falls das Rotation-Script
mitten im Durchlauf abbricht oder Fehler produziert:

### Option A: Re-run (bevorzugt)

Das Script skippt bereits rotierte Zeilen automatisch.

```bash
npx tsx scripts/rotate-encryption-key.ts --batch-size=500
```

Wenn einzelne Rows fehlschlagen (z.B. Auth-Tag-Mismatch → möglicherweise
PREVIOUS-Key ist falsch): die ID aus dem Log pasten, manuell prüfen.

### Option B: Env zurückrollen

Falls der neue `ENCRYPTION_KEY` grundsätzlich falsch war (z.B. vertippt):

```
ENCRYPTION_KEY          = <alter ENCRYPTION_KEY>
ENCRYPTION_KEY_PREVIOUS = <ursprünglich alter ENCRYPTION_KEY>   # oder leer
```

Deploy. Bisher rotierte Zeilen (`enc:v1:A:…` mit dem falschen Key) bleiben lesbar,
weil PREVIOUS jetzt der neue (falsche) Key ist. Neue Writes gehen auf den
alten — OK.

Dann erneut Phase 0 mit korrektem neuen Key durchlaufen.

### Option C: Selective DB-Restore

Wenn durch einen bug-im-Script falsche Daten geschrieben wurden (nicht erwartet,
aber theoretisch möglich): PITR auf Zeitpunkt vor Rotation, manuelle Analyse.

**Vorbedingung:** Backup-/PITR-Window ist noch offen (Supabase: 24h Free, 7d
Pro, 30d Enterprise).

---

## Troubleshooting

### "[rotate] X rows failed"

1. Log-Line suchen: `[rotate] {schema}.{table}.{col} id={uuid} failed:`
2. Typische Ursachen:
   - **Auth-Tag-Mismatch:** Zeile wurde möglicherweise bereits vorher mit einem
     drittem Key encrypted (unbekannte Historie) → manuelle Analyse.
   - **Invalid envelope:** Daten sind korrupt → PII-Löschung + User informieren.
   - **Column-Constraint-Fehler:** neuer Envelope ist länger, Spalten-Limit
     überschritten → Limit hochsetzen (P1: alle TEXT-Spalten haben kein Limit).

### "dual_key_mode: false" nach Phase 1

- ENV-Variable nicht im gleichen Process-Scope? → Backend-Restart erzwingen.
- Hex-String ungültig? → Logs nach `ENCRYPTION_KEY_PREVIOUS must be a 64-character hex string` durchsuchen.

### "Decryption failed: data integrity check failed"

- Der CURRENT-Key kann diese Zeile nicht entschlüsseln.
- Falls `keyId` im Envelope `A` ist → Ziel-Key ist falsch (PREVIOUS war CURRENT
  zum Zeitpunkt des Schreibens; Key-Reihenfolge verifizieren).
- Rollback via Option B; danach erneute Analyse.

---

## Audit-Trail

- Rotation-Log unter `/tmp/rotation-{date}.log` nach `s3://zenai-audit/security/`
  archivieren (Retention 7 Jahre).
- Security-Audit-Doc `docs/SECURITY-AUDIT-RLS-PER-CONTEXT.md` + Master-Plan
  Sektion 20 mit Datum + Rotation-Reason aktualisieren.
- Slack-Channel `#security-changes` benachrichtigen.

---

## Referenzen

- NIST SP 800-57 Part 1 Rev. 5, §5 — Key Management Lifecycle.
- Sprint 1.3 Migration (`backend/sql/migrations/sprint_1_3_encrypt_sensitive_fields.sql`) — P0 field list.
- Sprint 1.5 Migration (`backend/sql/migrations/sprint_1_5_context_schema_check_constraints.sql`) — P1 field list.
- `backend/src/services/security/field-encryption.ts` — Implementation (dual-key mode).
- `scripts/rotate-encryption-key.ts` — Rotation script.
