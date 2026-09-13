# Wise React components

Display-only components for Wise account details and balances. Compatible with
React 18.3 and 19, server rendering and modern browsers. No SDK or credentials
are needed in the browser.

[Explore the live preview](https://mmzaini.github.io/wise-sdk/) — try all three
components, change their props, and copy the matching code. Uses fictional data.

```sh
npm install @mmzaini/wise-react
```

```tsx
import { AccountCard } from "@mmzaini/wise-react";
import "@mmzaini/wise-react/styles.css";

<AccountCard
  account={accountDetails}
  balance={balance}
  masked
  locale="en-GB"
/>
```

`accountDetails` is an item from `client.accountDetails.get({ profileId })` and
`balance` is the matching **STANDARD** balance from
`client.balances.list({ profileId, types: "STANDARD" })`. Match their currencies
on your server. Savings balances are separate and should not be presented as the
destination for those receiving details.

Use [@mmzaini/wise-sdk](https://www.npmjs.com/package/@mmzaini/wise-sdk) on your
server to fetch the data, check the signed-in user's access, and pass only the
display fields needed by the component. Convert any `bigint` IDs to strings or
omit them when serializing to a browser. These components do not need IDs.

## Components

| Component | Purpose | Main props |
| --- | --- | --- |
| `AccountCard` | Currency, available balance and receiving options | `account`, `balance`, `title`, `status`, `masked`, `hideBalance`, `locale`, `children` |
| `AccountDetails` | Local/international detail groups | `account`, `masked` |
| `Balance` | A major-unit currency amount | `amount`, `label`, `masked`, `locale` |

Account details are masked by default. Set `masked={false}` after an explicit user
action to reveal them. Masking is visual; it does not remove sensitive data from
JavaScript props. Fields marked `hidden` by Wise stay hidden. Preview, missing-status
and deprecated account details are not shown as usable receiving details.

`status="loading"` and `status="error"` replace account content with accessible
status messages. Missing or invalid balances display as unavailable. A currency
mismatch between the account and balance also displays as unavailable.

## Amounts and styling

```tsx
import { Balance, formatMoney } from "@mmzaini/wise-react";

<Balance amount={{ currency: "GBP", value: "12.34" }} />
formatMoney({ currency: "EUR", value: "12.34" }, "de-DE"); // 12,34 €
```

Amounts use major currency units, matching Wise. Decimal strings preserve values
that cannot be represented accurately as JavaScript numbers. Formatting uses
`Intl.NumberFormat` and each currency's usual display precision; it does not change
or calculate payment amounts. Use a runtime with modern decimal-string support in
`Intl.NumberFormat`, such as Node 22+ for server rendering.

Styles are optional. Components accept `className`; `AccountCard` also accepts
`style`. Customize `--wise-text`, `--wise-muted`, `--wise-border`, `--wise-surface`
and `--wise-accent` within your card styles.

## Example and development

From this package directory:

```sh
npm ci
npm run dev
npm run build:example
npm run preview:example
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

The single-page example showcases all three components and `formatMoney` with
live currency, locale, masking, footer and state controls. Each component includes
a copyable code example that follows its current settings. The page uses fictional
data, supports keyboard navigation and narrow screens, and includes loading, error
and empty states. `build:example` produces a static site in `example/dist` with
relative asset paths for hosting at a root or subdirectory. Browser tests build and
test this production site. The separate [preview workflow](../../.github/workflows/react-preview.yml)
checks changes and deploys `example/dist` to GitHub Pages after updates to `main`.
It does not publish packages or change the SDK release process.

Community maintained; not affiliated with Wise. [MIT](LICENSE).
