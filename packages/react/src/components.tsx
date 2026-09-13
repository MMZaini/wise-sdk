import type { CSSProperties, ReactNode } from "react";
import { formatMoney, type Money } from "./money.js";

/** Structural subset of Wise's BankAccountDetails response. */
export interface BankAccountDetails {
  currency?: { code?: string };
  title?: string;
  status?: string;
  deprecated?: boolean;
  receiveOptions?: readonly {
    type?: string;
    title?: string;
    details?: readonly { type?: string; title?: string; body?: string; hidden?: boolean }[];
  }[];
}

export interface BalanceProps {
  amount?: Partial<Money> | null;
  label?: string;
  locale?: string;
  masked?: boolean;
  className?: string;
}

export function Balance({ amount, label = "Available balance", locale = "en-GB", masked = false, className = "" }: BalanceProps) {
  let formatted: string | undefined;
  if (amount?.value !== undefined && amount.currency && !masked) {
    try { formatted = formatMoney({ value: amount.value, currency: amount.currency }, locale); }
    catch (error) { if (!(error instanceof RangeError)) throw error; }
  }
  return <div className={`wise-balance ${className}`}>
    <p className="wise-label">{label}</p>
    <p className="wise-balance-value" aria-label={masked ? `${label} hidden` : formatted ? `${label}: ${formatted}` : `${label} unavailable`}>
      {masked ? "••••" : formatted ?? "—"}
    </p>
  </div>;
}

export interface AccountDetailsProps {
  account?: BankAccountDetails | null;
  /** Visual masking only. Authorize the full values before passing them to a browser. */
  masked?: boolean;
  className?: string;
}

export function AccountDetails({ account, masked = true, className = "" }: AccountDetailsProps) {
  if (account?.deprecated) return <p className={`wise-empty ${className}`}>These account details have been replaced.</p>;
  if (account?.status !== "ACTIVE") return <p className={`wise-empty ${className}`}>Account details unavailable</p>;
  const groups = (account.receiveOptions ?? []).map((option) => ({ ...option,
    details: (option.details ?? []).filter((field) => !field.hidden && typeof field.body === "string" && field.body.trim().length > 0),
  })).filter((option) => option.details.length);
  if (!groups.length) return <p className={`wise-empty ${className}`}>Account details unavailable</p>;
  return <div className={`wise-receive-options ${className}`}>
    {groups.map((option, index) => <section className="wise-receive-option" key={`${option.type}-${index}`} aria-label={option.title ?? option.type ?? "Receiving details"}>
      <h3>{option.title ?? option.type ?? "Receiving details"}</h3>
      <dl className="wise-details">
        {option.details.map((field, fieldIndex) => {
          const label = field.title ?? field.type ?? "Account detail";
          const value = field.body!;
          const compact = value.replace(/\s+/g, "");
          const tail = compact.length > 4 ? compact.slice(-Math.min(4, compact.length - 4)) : "";
          return <div className="wise-detail" key={`${field.type}-${fieldIndex}`}>
            <dt>{label}</dt>
            <dd aria-label={masked ? `${label} hidden${tail ? `, ending ${tail}` : ""}` : undefined}>
              {masked ? `••••${tail}` : value}
            </dd>
          </div>;
        })}
      </dl>
    </section>)}
  </div>;
}

export interface AccountCardProps {
  account?: BankAccountDetails | null;
  balance?: { name?: string | null; currency?: string; amount?: Partial<Money> } | null;
  title?: string;
  status?: "ready" | "loading" | "error";
  masked?: boolean;
  hideBalance?: boolean;
  locale?: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** Display-only account summary. Fetch and authorize its data on your server. */
export function AccountCard({ account, balance, title, status = "ready", masked = true, hideBalance = false,
  locale = "en-GB", children, className = "", style }: AccountCardProps) {
  const heading = title ?? balance?.name ?? account?.title ?? "Account";
  const currency = account?.currency?.code ?? balance?.currency ?? balance?.amount?.currency;
  const amount = balance?.amount?.currency === currency ? balance?.amount : undefined;
  return <section className={`wise-card ${className}`} style={style} aria-label={heading} aria-busy={status === "loading"}>
    <header className="wise-card-header">
      <h2>{heading}</h2>
      {status === "ready" && currency && <span className="wise-currency">{currency}</span>}
    </header>
    {status === "loading" ? <p className="wise-state" role="status">Loading account…</p>
      : status === "error" ? <p className="wise-state" role="alert">Unable to load this account.</p>
        : <>
          <Balance amount={amount} locale={locale} masked={hideBalance} />
          <AccountDetails account={account} masked={masked} />
          {children && <footer className="wise-card-footer">{children}</footer>}
        </>}
  </section>;
}
