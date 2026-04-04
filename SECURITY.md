# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.2.x   | ✅ Yes     |
| < 0.2   | ❌ No      |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability, report it privately using one of these methods:

1. **GitHub Private Vulnerability Reporting** (preferred):  
   Go to [Security → Report a vulnerability](https://github.com/naml14/axiom-framework/security/advisories/new)

2. **Email**:  
   Send details to the maintainer via the email listed on the [GitHub profile](https://github.com/naml14).

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

### Response timeline

- **Acknowledgment**: within 48 hours
- **Initial assessment**: within 7 days
- **Fix + disclosure**: coordinated with the reporter

## Scope

This library runs in the browser (client-side only). There is no server-side execution, no network requests, and no data persistence. The attack surface is limited to:

- Prototype pollution via `ComponentNode` props
- XSS via unsanitized `textContent` or `attrs` values passed by the consuming application
- Dependency vulnerabilities (scanned weekly via GitHub Actions + CodeQL)

## Out of Scope

- Vulnerabilities in the consuming application's own code
- Issues that require physical access to the user's machine
- Theoretical vulnerabilities without a proof of concept
