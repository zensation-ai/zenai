# Security Policy

## Reporting a Vulnerability

**Please do NOT create public GitHub issues for security vulnerabilities.**

Report security vulnerabilities to **security@zensation.ai**.

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

| Action | Timeframe |
|--------|-----------|
| Acknowledgment | Within 48 hours |
| Initial assessment | Within 5 business days |
| Fix timeline provided | Within 10 business days |
| Patch release | As soon as fix is verified |

## Security Design

ZenAI takes security seriously. Key protections in the production platform:

- **Field-level encryption** for sensitive data at rest (AES-256-GCM with key rotation)
- **Row-Level Security (RLS)** per context schema (operations, finance, people, strategy)
- **SSRF + DNS-rebinding protection** on outbound URL fetching
- **Prompt-injection guardrails** on AI tool calls
- **Three-tier content moderation** for user-generated AI inputs
- **GDPR-compliant** data handling: consent center, DSAR (Subject Access Request), account deletion, IP truncation
- **Stripe webhook deduplication + replay protection**
- **SIEM forwarding** for high-severity events (per-organization)
- **JWT with plan claim** to prevent privilege escalation across plan tiers
- **Rate limiting** (advanced, per-tier and per-route)

When self-hosting, ensure you set strong values for `JWT_SECRET`, `ENCRYPTION_KEY`, and database credentials in your `.env`. See `docs/getting-started.md`.

## Disclosure Policy

We follow a coordinated disclosure model:
1. You report the vulnerability privately.
2. We acknowledge, investigate, and develop a fix.
3. We coordinate a public disclosure window with you.
4. We publish an advisory after the patch is available.

Thank you for helping keep ZenAI users secure.
