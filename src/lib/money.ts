export type Cents = number;

export const dollars = (n: number): Cents => Math.round(n * 100);

export function formatMoney(c: Cents, opts?: { cents?: boolean }): string {
  const sign = c < 0 ? '-' : '';
  const abs = Math.abs(c);
  if (!opts?.cents) return `${sign}$${Math.round(abs / 100).toLocaleString('en-US')}`;
  return `${sign}$${Math.floor(abs / 100).toLocaleString('en-US')}.${String(abs % 100).padStart(2, '0')}`;
}

export function formatMoneyShort(c: Cents): string {
  const d = Math.abs(c) / 100;
  const sign = c < 0 ? '-' : '';
  if (d >= 1000) return `${sign}$${(d / 1000).toFixed(1)}k`;
  return `${sign}$${Math.round(d)}`;
}

export const ceilTo = (c: Cents, step: Cents): Cents => Math.ceil(c / step) * step;

export function pct(rate: number, digits = 1): string {
  return Number.isFinite(rate) ? `${(rate * 100).toFixed(digits)}%` : '—';
}

export const safeRate = (num: number, den: number): number => (den === 0 ? NaN : num / den);
