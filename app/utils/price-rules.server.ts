export type EndingValue = "0.95" | "0.99";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parsePrice(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatPrice(value: number): string {
  return round2(value).toFixed(2);
}

export function forceCents(price: number, ending: EndingValue): number {
  const endingNum = Number.parseFloat(ending);
  const integerPart = Math.floor(price);
  return round2(integerPart + endingNum);
}

export function roundToTierTop(
  price: number,
  ending: EndingValue,
  blockSize: number = 5,
): number {
  const endingNum = Number.parseFloat(ending);
  const n = Math.floor(price);
  const base = n - (n % blockSize);
  const top = base + (blockSize - 1);
  return round2(top + endingNum);
}

export function shouldUpdate(current: number, target: number): boolean {
  return Math.abs(current - target) > 0.0001;
}
