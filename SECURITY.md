# Security Policy

## Supported Versions

We actively support the following versions of SyncKit with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| 0.1.x   | :white_check_mark: |
| < 0.1.0 | :x:                |

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in SyncKit, please report it to us privately:

### How to Report

1. **Email:** danbitengo@gmail.com (preferred)
   - Subject: "[SECURITY] SyncKit - Brief description"
   - Include: Detailed description, steps to reproduce, impact assessment

2. **GitHub Security Advisory**
   - Visit: https://github.com/Dancode-188/synckit/security/advisories
   - Click "Report a vulnerability"

### What to Include

Please include as much information as possible:

- Type of vulnerability (e.g., XSS, SQL injection, authentication bypass)
- Full description of the vulnerability
- Step-by-step instructions to reproduce
- Proof-of-concept or exploit code (if possible)
- Impact assessment (who is affected, severity)
- Suggested fix (if you have one)

### What to Expect

- **Initial Response:** Within 48 hours
- **Status Update:** Within 7 days
- **Fix Timeline:** We aim to patch critical vulnerabilities within 30 days

### Our Commitment

We will:
- Acknowledge your email within 48 hours
- Keep you informed of our progress
- Credit you in the security advisory (unless you prefer to remain anonymous)
- Work with you to understand and resolve the issue

### Disclosure Policy

- Please give us reasonable time to address the vulnerability before public disclosure
- We follow coordinated vulnerability disclosure practices
- We will credit researchers who report vulnerabilities responsibly

### Security Best Practices

When using SyncKit in production:

1. **Keep Updated:** Always use the latest stable version
2. **Authentication:** Implement proper authentication for your sync server
3. **Authorization:** Use RBAC to control document access
4. **HTTPS Only:** Always use HTTPS/WSS in production
5. **Input Validation:** Validate all user input before syncing
6. **Rate Limiting:** Implement rate limiting on your server
7. **Monitoring:** Monitor for unusual sync patterns

### Known Security Considerations

SyncKit is designed with security in mind:

- **Data Encryption:** Transport encryption via WSS (WebSocket Secure)
- **Authentication:** JWT-based authentication system
- **Authorization:** Role-based access control (RBAC)
- **Input Sanitization:** All sync data is validated
- **No Eval:** No use of eval() or similar dangerous functions

### Public Disclosure Timeline

1. **Day 0:** Vulnerability reported privately
2. **Day 0-7:** Vulnerability validated and fix developed
3. **Day 7-30:** Patch released and deployed
4. **Day 30+:** Public disclosure with credit to reporter

### Bug Bounty Program

We currently do not have a formal bug bounty program, but we deeply appreciate security researchers who help keep SyncKit safe. We will acknowledge your contribution publicly (unless you prefer otherwise).

### Contact

For any questions about this policy or security concerns:
- Email: danbitengo@gmail.com
- GitHub: [@Dancode-188](https://github.com/Dancode-188)

---

Thank you for helping keep SyncKit and our users safe! 🛡️
