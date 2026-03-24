# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities to **security@zensation.ai**.

Do NOT create public GitHub issues for security vulnerabilities.

We will:
- Acknowledge receipt within 48 hours
- Provide an initial assessment within 5 business days
- Work with you on a fix timeline
- Credit you in the security advisory (unless you prefer anonymity)

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest release | Yes |
| Previous release | Security fixes only |

## Security Measures

ZenAI implements defense-in-depth security:

- **Authentication**: JWT (RS256) + API Key dual auth
- **Authorization**: RBAC middleware (admin/editor/viewer)
- **Database**: Application-level user isolation + prepared statements
- **Encryption**: AES-256-GCM field-level encryption for sensitive data
- **Rate Limiting**: Redis sliding window with tier-based limits
- **Audit Logging**: Structured security event log
- **Input Validation**: Zod schemas on all API inputs
- **Prompt Injection**: 14-pattern screening on AI inputs
