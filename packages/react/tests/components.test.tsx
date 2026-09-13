import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AccountCard, AccountDetails, Balance, formatMoney } from "../src/index.js";
import type * as Wise from "../../../sdks/typescript/src/generated/api/index.js";

const account: Wise.BankAccountDetails = {
  title: "British pound", currency: { code: "GBP" }, status: "ACTIVE", receiveOptions: [
    { type: "LOCAL", title: "Local details", details: [
      { type: "ACCOUNT_NUMBER", title: "Account number", body: "12345678" },
      { type: "SORT_CODE", title: "Sort code", body: "04-00-00" },
      { type: "INTERNAL", title: "Hidden", body: "never-display", hidden: true },
    ] },
  ],
};
const balance: Wise.Balance = { currency: "GBP", amount: { value: 123.45, currency: "GBP" } };

test("accepts SDK response shapes and masks account details by default", () => {
  const html = renderToStaticMarkup(<AccountCard account={account} balance={balance} />);
  assert(html.includes("British pound") && html.includes("£123.45"));
  assert(!html.includes("12345678") && !html.includes("04-00-00"));
  assert(html.includes("ending 5678"));
  assert(!html.includes("never-display"));
});

test("explicit reveal respects hidden fields and unissued or deprecated details", () => {
  const html = renderToStaticMarkup(<AccountDetails account={account} masked={false} />);
  assert(html.includes("12345678"));
  assert(!html.includes("never-display"));
  for (const inactive of [{ ...account, status: "AVAILABLE" }, { ...account, deprecated: true }, { ...account, status: undefined }]) {
    assert(!renderToStaticMarkup(<AccountDetails account={inactive} masked={false} />).includes("12345678"));
  }
});

test("loading, errors and currency mismatches do not display balances", () => {
  for (const status of ["loading", "error"] as const) {
    const html = renderToStaticMarkup(<AccountCard account={account} balance={balance} status={status} masked={false} />);
    assert(!html.includes("12345678") && !html.includes("123.45"));
    assert(html.includes(status === "loading" ? 'role="status"' : 'role="alert"'));
  }
  const mismatch = renderToStaticMarkup(<AccountCard account={account} balance={{ amount: { value: 123.45, currency: "USD" } }} />);
  assert(mismatch.includes("balance unavailable") && !mismatch.includes("123.45"));
  assert(!renderToStaticMarkup(<Balance amount={balance.amount} masked />).includes("123.45"));
});

test("renders text safely and masks very short values completely", () => {
  const html = renderToStaticMarkup(<AccountDetails account={{ status: "ACTIVE", receiveOptions: [{ details: [
    { title: "<script>bad</script>", body: "123" },
  ] }] }} />);
  assert(!html.includes("<script>") && !html.includes("123"));
  assert(html.includes("&lt;script&gt;"));
  assert(renderToStaticMarkup(<AccountCard />).includes("unavailable"));
});

test("formats major units and exact decimal strings with currency precision", () => {
  assert.equal(formatMoney({ currency: "GBP", value: 12.34 }), "£12.34");
  assert.equal(formatMoney({ currency: "GBP", value: "9007199254740993.01" }), "£9,007,199,254,740,993.01");
  assert.equal(formatMoney({ currency: "GBP", value: "-0.01" }), "-£0.01");
  assert.equal(formatMoney({ currency: "GBP", value: "1.005" }), "£1.01");
  assert.equal(formatMoney({ currency: "EUR", value: "12.34" }, "de-DE"), "12,34\u00a0€");
  assert.equal(formatMoney({ currency: "JPY", value: "1234" }), "JP¥1,234");
  assert.equal(formatMoney({ currency: "KWD", value: "1.2345" }), "KWD\u00a01.235");
});

test("invalid or rounded amounts display as unavailable", () => {
  for (const value of [NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "", " ", "12.3.4", "Infinity"]) {
    assert.throws(() => formatMoney({ currency: "GBP", value }), RangeError);
    assert(renderToStaticMarkup(<Balance amount={{ currency: "GBP", value }} />).includes("unavailable"));
  }
});
