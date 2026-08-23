export type CurrencyCode = "USD";

export function formatMoney(amountCents: number, currency: CurrencyCode = "USD"): string {
  const sign = amountCents < 0 ? "-" : "";
  const abs = Math.abs(amountCents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = (abs % 100).toString().padStart(2, "0");
  return `${sign}$${whole}.${frac} ${currency}`;
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}
