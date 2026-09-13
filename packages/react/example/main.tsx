import { useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  AccountCard,
  AccountDetails,
  Balance,
  formatMoney,
  type BankAccountDetails,
} from "../src/index.js";
import "../styles.css";
import "./page.css";

const currencies = ["GBP", "EUR", "USD"] as const;
type Currency = (typeof currencies)[number];
const examples: Record<
  Currency,
  { account: BankAccountDetails; value: string }
> = {
  GBP: {
    value: "2486.50",
    account: {
      title: "British pound",
      currency: { code: "GBP" },
      status: "ACTIVE",
      receiveOptions: [
        {
          type: "LOCAL",
          title: "Local account details",
          details: [
            {
              type: "ACCOUNT_NUMBER",
              title: "Account number",
              body: "12345678",
            },
            { type: "SORT_CODE", title: "Sort code", body: "04-00-00" },
          ],
        },
      ],
    },
  },
  EUR: {
    value: "856.24",
    account: {
      title: "Euro",
      currency: { code: "EUR" },
      status: "ACTIVE",
      receiveOptions: [
        {
          type: "INTERNATIONAL",
          title: "International account details",
          details: [
            { type: "IBAN", title: "IBAN", body: "BE00 0000 0000 0000" },
            { type: "SWIFT_CODE", title: "BIC / SWIFT", body: "TESTBEBBXXX" },
          ],
        },
      ],
    },
  },
  USD: {
    value: "12450.00",
    account: {
      title: "US dollar",
      currency: { code: "USD" },
      status: "ACTIVE",
      receiveOptions: [
        {
          type: "LOCAL",
          title: "Local account details",
          details: [
            {
              type: "ACCOUNT_NUMBER",
              title: "Account number",
              body: "000123456789",
            },
            {
              type: "ROUTING_NUMBER",
              title: "Routing number",
              body: "000000000",
            },
          ],
        },
      ],
    },
  },
};
const sections = [
  { id: "overview", label: "Overview", number: "" },
  { id: "account-card", label: "Account card", number: "01" },
  { id: "account-details", label: "Account details", number: "02" },
  { id: "balance", label: "Balance", number: "03" },
  { id: "states", label: "States & fallbacks", number: "" },
  { id: "get-started", label: "Get started", number: "" },
];
const install = "npm install @mmzaini/wise-react";

function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d={diagonal ? "M6 18 18 6M6 6h12v12" : "M4 12h16m-6-6 6 6-6 6"} />
    </svg>
  );
}

function CopyButton({
  text,
  label = "Copy code",
}: {
  text: string;
  label?: string;
}) {
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (message === "Copied") {
      const timer = window.setTimeout(() => setMessage(""), 2500);
      return () => window.clearTimeout(timer);
    }
  }, [message]);
  return (
    <span className="copy-wrap">
      <button
        className="demo-copy"
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setMessage("Copied");
          } catch {
            setMessage("Select the code to copy manually.");
          }
        }}
        aria-label={message === "Copied" ? `${label}: copied` : label}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V4H4v12h4" />
        </svg>
        {message === "Copied" ? "Copied" : "Copy"}
      </button>
      <span className="copy-feedback" role="status">
        {message && message !== "Copied" ? (
          message
        ) : (
          <span className="sr-only">{message}</span>
        )}
      </span>
    </span>
  );
}

function Code({ children }: { children: string }) {
  return (
    <div className="demo-code">
      <div className="code-heading">
        <span>TSX</span>
        <CopyButton text={children} />
      </div>
      <pre tabIndex={0} aria-label="Code example">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function Example({
  id,
  children,
  controls,
  code,
  caption,
}: {
  id: string;
  children: ReactNode;
  controls: ReactNode;
  code: string;
  caption: string;
}) {
  const [view, setView] = useState("preview");
  return (
    <div className="example-shell">
      <div className="example-toolbar">
        <div
          className="view-switch"
          role="group"
          aria-label={`${caption} example view`}
        >
          <button
            type="button"
            className="demo-tab"
            aria-pressed={view === "preview"}
            aria-controls={`${id}-panel`}
            onClick={() => setView("preview")}
          >
            Preview
          </button>
          <button
            type="button"
            className="demo-tab"
            aria-pressed={view === "code"}
            aria-controls={`${id}-panel`}
            onClick={() => setView("code")}
          >
            <span aria-hidden="true">&lt;/&gt;</span> Code
          </button>
        </div>
        <span className="example-label">{caption}</span>
      </div>
      <div
        id={`${id}-panel`}
        className={view === "preview" ? "example-body" : "example-source"}
      >
        {view === "preview" ? (
          <>
            <div className={`preview-stage preview-${id}`}>{children}</div>
            <div className="example-controls">
              <p className="controls-title">PLAYGROUND</p>
              {controls}
            </div>
          </>
        ) : (
          <Code>{code}</Code>
        )}
      </div>
    </div>
  );
}

function SectionHeading({
  number,
  name,
  description,
}: {
  number: string;
  name: string;
  description: string;
}) {
  return (
    <div className="section-heading">
      <div className="section-name">
        <span className="section-number">{number}</span>
        <h2>{name}</h2>
      </div>
      <p>{description}</p>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="demo-toggle">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="toggle-track" aria-hidden="true" />
    </label>
  );
}

function App() {
  const [active, setActive] = useState("overview");
  const [currency, setCurrency] = useState<Currency>("GBP");
  const [visible, setVisible] = useState(false);
  const [hideBalance, setHideBalance] = useState(false);
  const [footer, setFooter] = useState(true);
  const [cardStatus, setCardStatus] = useState<"ready" | "loading" | "error">(
    "ready",
  );
  const [detailsCurrency, setDetailsCurrency] = useState<Currency>("EUR");
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [balanceCurrency, setBalanceCurrency] = useState<Currency>("GBP");
  const [amount, setAmount] = useState("2486.50");
  const [locale, setLocale] = useState("en-GB");
  const [masked, setMasked] = useState(false);
  const current = examples[currency];
  const detailsAccount: BankAccountDetails = {
    ...examples[detailsCurrency].account,
    receiveOptions: examples[detailsCurrency].account.receiveOptions?.map(
      (option) => ({
        ...option,
        title:
          option.type === "INTERNATIONAL"
            ? "International receiving details"
            : "Local receiving details",
      }),
    ),
  };
  let formatted = "Unavailable";
  let invalidAmount = false;
  try {
    formatted = formatMoney(
      { currency: balanceCurrency, value: amount },
      locale,
    );
  } catch {
    invalidAmount = true;
  }

  useEffect(() => {
    const update = () => {
      const nearBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4;
      const passed = sections.filter(
        (section) =>
          (document.getElementById(section.id)?.getBoundingClientRect().top ??
            Infinity) <= 180,
      );
      setActive(nearBottom ? "get-started" : (passed.at(-1)?.id ?? "overview"));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = new ResizeObserver(update);
    const main = document.getElementById("main-content");
    if (main) observer.observe(main);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    // Keep the current section visible in the horizontally scrolling mobile nav.
    const nav = document.querySelector<HTMLElement>(".sidebar nav");
    const link = nav?.querySelector<HTMLElement>("[aria-current]");
    if (!nav || !link || nav.scrollWidth <= nav.clientWidth) return;
    const bounds = nav.getBoundingClientRect();
    const current = link.getBoundingClientRect();
    if (current.left < bounds.left || current.right > bounds.right) {
      nav.scrollLeft +=
        current.left - bounds.left - (bounds.width - current.width) / 2;
    }
  }, [active]);

  const cardCode = `import { AccountCard } from "@mmzaini/wise-react";\nimport "@mmzaini/wise-react/styles.css";\n\nconst account = ${JSON.stringify(current.account, null, 2)};\nconst balance = {\n  currency: "${currency}",\n  amount: { currency: "${currency}", value: "${current.value}" },\n};\n\n<AccountCard\n  account={account}\n  balance={balance}\n  status="${cardStatus}"\n  masked={${!visible}}\n  hideBalance={${hideBalance}}\n  locale="en-GB"\n${footer ? `>\n  <span>Receive ${currency} with ${currency === "EUR" ? "international" : "local"} account details.</span>\n</AccountCard>` : "/>"}`;
  const detailsCode = `import { AccountDetails } from "@mmzaini/wise-react";\nimport "@mmzaini/wise-react/styles.css";\n\nconst account = ${JSON.stringify(detailsAccount, null, 2)};\n\n<AccountDetails account={account} masked={${!detailsVisible}} />`;
  const balanceCode = `import { Balance, formatMoney } from "@mmzaini/wise-react";\nimport "@mmzaini/wise-react/styles.css";\n\n<Balance\n  amount={{ currency: "${balanceCurrency}", value: ${JSON.stringify(amount)} }}\n  locale="${locale}"\n  masked={${masked}}\n/>\n\n// The formatter can also be used without React.\n${invalidAmount ? "// This input throws a RangeError; Balance displays unavailable.\n" : ""}formatMoney({ currency: "${balanceCurrency}", value: ${JSON.stringify(amount)} }, "${locale}");${invalidAmount ? "" : `\n// ${formatted}`}`;

  return (
    <div className="showcase">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="site-header">
        <a className="brand" href="#overview" aria-label="Wise React overview">
          <span>
            wise<span className="brand-divider">/</span>
            <span className="brand-product">react</span>
          </span>
        </a>
        <div className="header-links">
          <a
            href="https://github.com/MMZaini/wise-sdk/tree/main/packages/react"
            target="_blank"
            rel="noreferrer"
          >
            GitHub <Arrow diagonal />
          </a>
        </div>
      </header>
      <div className="site-layout">
        <aside className="sidebar">
          <div className="sidebar-inner">
            <nav aria-label="On this page">
              {sections.map((section) => (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  aria-current={active === section.id ? "location" : undefined}
                >
                  <span>{section.label}</span>
                  {section.number && (
                    <span className="nav-number">{section.number}</span>
                  )}
                </a>
              ))}
            </nav>
            <a
              className="package-link"
              href="https://www.npmjs.com/package/@mmzaini/wise-react"
              target="_blank"
              rel="noreferrer"
            >
              View on npm <Arrow diagonal />
            </a>
          </div>
        </aside>
        <main id="main-content" tabIndex={-1}>
          <section id="overview" className="overview">
            <h1>
              Money, clearly
              <br />
              presented.
            </h1>
            <p className="hero-description">
              Account details and balances, ready for your React app.
              <br className="desktop-break" /> Three focused components. Explore
              every detail.
            </p>
            <div className="hero-actions">
              <a className="primary-link" href="#account-card">
                Explore components <Arrow />
              </a>
              <a className="text-link" href="#get-started">
                Get started <span aria-hidden="true">↗</span>
              </a>
            </div>
            <div className="overview-meta">
              <span>
                <span className="meta-number">03</span> React components
              </span>
              <span>Accessible states</span>
              <span>Display-only · No credentials</span>
            </div>
          </section>

          <section id="account-card" className="catalog-section">
            <SectionHeading
              number="01"
              name="Account card"
              description="The complete picture. A currency, its balance, and the details to receive money."
            />
            <Example
              id="card"
              caption="AccountCard"
              code={cardCode}
              controls={
                <>
                  <label className="demo-field">
                    Currency
                    <select
                      value={currency}
                      onChange={(event) =>
                        setCurrency(event.target.value as Currency)
                      }
                    >
                      {currencies.map((code) => (
                        <option key={code}>{code}</option>
                      ))}
                    </select>
                  </label>
                  <label className="demo-field">
                    State
                    <select
                      value={cardStatus}
                      onChange={(event) =>
                        setCardStatus(event.target.value as typeof cardStatus)
                      }
                    >
                      <option value="ready">Ready</option>
                      <option value="loading">Loading</option>
                      <option value="error">Error</option>
                    </select>
                  </label>
                  <div className="control-divider" />
                  <Toggle
                    label="Hide balance"
                    checked={hideBalance}
                    onChange={setHideBalance}
                  />
                  <Toggle
                    label="Show footer"
                    checked={footer}
                    onChange={setFooter}
                  />
                  <button
                    className="demo-button"
                    type="button"
                    aria-pressed={visible}
                    aria-controls="accounts"
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? "Hide" : "Show"} account details
                  </button>
                  <p className="control-hint">
                    Details are masked by default. Try revealing the fictional
                    data.
                  </p>
                </>
              }
            >
              <div id="accounts" className="card-preview">
                <AccountCard
                  account={current.account}
                  balance={{
                    currency,
                    amount: { currency, value: current.value },
                  }}
                  status={cardStatus}
                  masked={!visible}
                  hideBalance={hideBalance}
                >
                  {footer && (
                    <span>
                      Receive {currency} with{" "}
                      {currency === "EUR" ? "international" : "local"} account
                      details.
                    </span>
                  )}
                </AccountCard>
                <span className="preview-footnote">
                  <span className="small-dot" /> Fictional account · Live
                  component
                </span>
              </div>
            </Example>
            <div className="section-footnote">
              <code>&lt;AccountCard /&gt;</code>
              <span>
                Composes Balance and AccountDetails. Accepts a custom footer.
              </span>
            </div>
          </section>

          <section id="account-details" className="catalog-section">
            <SectionHeading
              number="02"
              name="Account details"
              description="Receiving details that stand on their own, with local and international formats."
            />
            <Example
              id="details"
              caption="AccountDetails"
              code={detailsCode}
              controls={
                <>
                  <label className="demo-field">
                    Receiving option
                    <select
                      value={detailsCurrency}
                      onChange={(event) =>
                        setDetailsCurrency(event.target.value as Currency)
                      }
                    >
                      <option value="EUR">EUR · International</option>
                      <option value="GBP">GBP · Local</option>
                      <option value="USD">USD · Local</option>
                    </select>
                  </label>
                  <button
                    className="demo-button"
                    type="button"
                    aria-pressed={detailsVisible}
                    aria-controls="standalone-details"
                    onClick={() => setDetailsVisible(!detailsVisible)}
                  >
                    {detailsVisible ? "Mask fields" : "Reveal fields"}
                  </button>
                  <p className="control-hint">
                    Labels and receiving groups come directly from the account
                    data.
                  </p>
                </>
              }
            >
              <div className="standalone-surface" id="standalone-details">
                <AccountDetails
                  account={detailsAccount}
                  masked={!detailsVisible}
                />
              </div>
            </Example>
            <div className="section-footnote">
              <code>&lt;AccountDetails /&gt;</code>
              <span>
                Hidden fields stay hidden. Only active details are shown.
              </span>
            </div>
          </section>

          <section id="balance" className="catalog-section">
            <SectionHeading
              number="03"
              name="Balance"
              description="One amount, in the right format. Explore currencies, locales, and visual masking."
            />
            <Example
              id="balance"
              caption="Balance"
              code={balanceCode}
              controls={
                <>
                  <label className="demo-field">
                    Amount
                    <input
                      value={amount}
                      type="text"
                      inputMode="decimal"
                      aria-invalid={invalidAmount}
                      aria-describedby={
                        invalidAmount ? "amount-error" : undefined
                      }
                      onChange={(event) => setAmount(event.target.value)}
                    />
                  </label>
                  {invalidAmount && (
                    <p id="amount-error" className="input-error">
                      Enter a decimal amount, for example 2486.50.
                    </p>
                  )}
                  <div className="control-pair">
                    <label className="demo-field">
                      Currency
                      <select
                        value={balanceCurrency}
                        onChange={(event) =>
                          setBalanceCurrency(event.target.value as Currency)
                        }
                      >
                        {currencies.map((code) => (
                          <option key={code}>{code}</option>
                        ))}
                      </select>
                    </label>
                    <label className="demo-field">
                      Locale
                      <select
                        value={locale}
                        onChange={(event) => setLocale(event.target.value)}
                      >
                        <option value="en-GB">en-GB</option>
                        <option value="en-US">en-US</option>
                        <option value="de-DE">de-DE</option>
                        <option value="fr-FR">fr-FR</option>
                      </select>
                    </label>
                  </div>
                  <Toggle
                    label="Mask amount"
                    checked={masked}
                    onChange={setMasked}
                  />
                  <p className="control-hint">
                    Amounts use major currency units. Decimal strings preserve
                    precision.
                  </p>
                </>
              }
            >
              <div className="balance-preview">
                <div className="standalone-surface">
                  <Balance
                    amount={{ currency: balanceCurrency, value: amount }}
                    locale={locale}
                    masked={masked}
                  />
                </div>
                <div className="formatter-result">
                  <span>formatMoney()</span>
                  <output aria-label="Formatted amount">{formatted}</output>
                </div>
              </div>
            </Example>
            <div className="section-footnote">
              <code>&lt;Balance /&gt;</code>
              <span>
                The formatMoney utility is also available without React.
              </span>
            </div>
          </section>

          <section id="states" className="catalog-section">
            <SectionHeading
              number="—"
              name="Ready for the in-between."
              description="Loading, errors, and missing data are part of the experience, too."
            />
            <div className="states-grid">
              <div className="state-example">
                <span className="state-label">01 / LOADING</span>
                <AccountCard title="Loading account" status="loading" />
                <p>Announces progress with an accessible status message.</p>
              </div>
              <div className="state-example">
                <span className="state-label">02 / ERROR</span>
                <AccountCard title="Account error" status="error" />
                <p>Replaces account content with a clear error alert.</p>
              </div>
              <div className="state-example">
                <span className="state-label">03 / EMPTY</span>
                <AccountCard title="No account data" />
                <p>Missing data is shown as unavailable, never as zero.</p>
              </div>
            </div>
            <details className="states-code">
              <summary>
                View state examples <span aria-hidden="true">&lt;/&gt;</span>
              </summary>
              <Code>{`import { AccountCard } from "@mmzaini/wise-react";\nimport "@mmzaini/wise-react/styles.css";\n\n<AccountCard title="Loading account" status="loading" />\n<AccountCard title="Account error" status="error" />\n<AccountCard title="No account data" />`}</Code>
            </details>
          </section>

          <section id="get-started" className="get-started">
            <div>
              <p className="eyebrow">FROM PREVIEW TO PROJECT</p>
              <h2>
                A small install.
                <br />A clear starting point.
              </h2>
              <p>
                Bring the components into your app.
                <br />
                Import the stylesheet, then pass your display data.
              </p>
              <a
                className="text-link"
                href="https://github.com/MMZaini/wise-sdk/tree/main/packages/react#readme"
                target="_blank"
                rel="noreferrer"
              >
                Read the documentation <Arrow diagonal />
              </a>
            </div>
            <div className="install-examples">
              <div className="install-command">
                <code>
                  <span aria-hidden="true">$ </span>
                  {install}
                </code>
                <CopyButton text={install} label="Copy install command" />
              </div>
              <Code>{`import { Balance } from "@mmzaini/wise-react";\nimport "@mmzaini/wise-react/styles.css";\n\nexport default function MyBalance() {\n  return (\n    <Balance\n      amount={{ currency: "GBP", value: "2486.50" }}\n    />\n  );\n}`}</Code>
            </div>
          </section>
          <div className="implementation-note">
            <span className="note-mark" aria-hidden="true">
              i
            </span>
            <p>
              Fetch and authorize account data on your server. Masking only
              changes what is displayed; it does not remove values from browser
              props.
            </p>
          </div>
          <footer className="site-footer">
            <p>
              Community maintained. Not affiliated with Wise.
              <br />
              All balances and account details on this page are fictional.
            </p>
            <a
              href="https://github.com/MMZaini/wise-sdk/blob/main/packages/react/LICENSE"
              target="_blank"
              rel="noreferrer"
            >
              MIT licensed <Arrow diagonal />
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
