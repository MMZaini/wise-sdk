# Changelog

## 0.1.1

- Apply TypeScript request deadlines and cancellation while waiting for tokens or headers, without interrupting shared token rotation.
- Validate OAuth expiry metadata, use the earlier refresh expiry and reject invalid Python tokens before persistence.
- Reject unknown TypeScript OAuth authorization environments.
- Require review for webhook and callback model updates; verify PyPI release hashes through the installation index.
- Clarify the SDK rationale and migration documentation.

## 0.1.0

- Add TypeScript and sync/async Python clients for Wise's 2026Q3 API.
- Add personal-token and partner OAuth authentication, rotation, mTLS, pagination and webhook helpers.
- Add statement downloads and React account components.
- Add specification updates, generation checks and automatic package releases.
