# Changelog

## 0.2.0

- Add `simulations.changeSanctionCaseState` for Wise's new sanction case simulation endpoint.
- Breaking: Wise moved error responses to RFC 9457 problem details. `ErrorResponse` now carries
  `type`, `title` and `status` in place of `error`, `message` and `timestamp`, and adds `detail`,
  `instance` and `code`. `ValidationError` now carries `code`, `ref` and `detail` in place of
  `field`, `message` and `rejectedValue`.
- Breaking: `Error422UnprocessableEntity` and `BusinessProfileIndustryCategories` are gone;
  `Error409Conflict`, `SubmissionDataFile` and `BusinessProfileType` replace them.
- Add the `FILE_SUBMISSION` case message type and business profile industry category fields.

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
