export interface Money {
  currency: string;
  /** Major currency units, such as 12.34 GBP. Decimal strings preserve large values. */
  value: number | string;
}

/** Format a major-unit amount using the currency's standard display precision. */
export function formatMoney(amount: Money, locale = "en-GB"): string {
  if (!/^[A-Z]{3}$/.test(amount.currency)) throw new RangeError("currency must be an uppercase ISO currency code");
  const value = amount.value;
  if ((typeof value !== "string" && typeof value !== "number") || !Number.isFinite(Number(value)) ||
      (typeof value === "string" && !/^-?\d+(?:\.\d+)?$/.test(value)) ||
      (typeof value === "number" && Number.isInteger(value) && !Number.isSafeInteger(value))) {
    throw new RangeError("Provide a finite amount; use a decimal string for large values");
  }
  const formatter = new Intl.NumberFormat(locale, { style: "currency", currency: amount.currency });
  // ECMA-402 accepts decimal strings without converting them to binary floating point.
  return (formatter.format as (value: number | string) => string)(value);
}
