# Security

Report vulnerabilities through
[GitHub private vulnerability reporting](https://github.com/MMZaini/wise-sdk/security/advisories/new).
Include affected versions, impact and a minimal reproduction using synthetic data.
Do not put credentials, private keys or account information in public issues.

Security fixes target the latest release. Upgrade before reporting an issue that
may already be fixed.

Keep Wise credentials on your server, verify webhook signatures over the original
body, and follow the [authentication guide](docs/authentication.md). Display masking
in the React package is a visual feature; omit fields from the response when the
browser must not receive them.
