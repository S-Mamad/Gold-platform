const RIYAL_MAX = 1_000_000_000_000;
const GRAM_MAX = 1_000;

export function rialMax() {
  return RIYAL_MAX;
}

export function gramMax() {
  return GRAM_MAX;
}

/** Rejects non-finite, non-positive, over-cap, and values that are not 4-decimal money. */
export function assertMoney(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("amount must be a positive number");
  }
  const rounded = Number(value.toFixed(4));
  if (!(rounded > 0) || rounded > max) {
    throw new Error("amount is outside the allowed range");
  }
  if (Math.abs(value - rounded) > 1e-8) {
    throw new Error("amount has more than 4 decimal places");
  }
  return rounded;
}

export function assertRial(value: number) {
  return assertMoney(value, RIYAL_MAX);
}

export function assertGrams(value: number) {
  return assertMoney(value, GRAM_MAX);
}

/** ISO 13616 mod-97. Accepts IR plus 24 digits. */
export function isValidIranIban(input: string): boolean {
  const compact = input.replace(/\s|-/g, "").toUpperCase();
  if (!/^IR\d{24}$/.test(compact)) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const chunk = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of chunk) {
      rem = (rem * 10 + Number(digit)) % 97;
    }
  }
  return rem === 1;
}

export function assertAdultIsoDate(iso: string, now = new Date()): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error("birthDate must be YYYY-MM-DD");
  }
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const real =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  if (!real || year < 1900) {
    throw new Error("birthDate must be a real calendar date");
  }
  const adultAt = new Date(Date.UTC(year + 18, month - 1, day));
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  if (adultAt > today) {
    throw new Error("account holder must be at least 18");
  }
}

export type SideQuote = {
  mid: string;
  ask: string;
  bid: string;
  feeBps: number;
};

export function quoteFromMid(
  mid: number,
  buySpreadBps: number,
  sellSpreadBps: number,
  feeBps: number,
): SideQuote {
  if (!Number.isFinite(mid) || mid <= 0) {
    throw new Error("Live gold price is invalid");
  }
  const ask = mid * (1 + buySpreadBps / 10_000);
  const bid = mid * (1 - sellSpreadBps / 10_000);
  if (!(bid > 0) || bid > ask) {
    throw new Error("Live gold price is invalid");
  }
  return {
    mid: mid.toFixed(4),
    ask: ask.toFixed(4),
    bid: bid.toFixed(4),
    feeBps,
  };
}

export function parseQuote(raw: string | null): SideQuote | null {
  if (!raw) return null;
  if (raw.startsWith("{")) {
    try {
      const data = JSON.parse(raw) as SideQuote;
      if (!data.ask || !data.bid || !data.mid) return null;
      return data;
    } catch {
      return null;
    }
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return quoteFromMid(n, 0, 0, 0);
}

export function ttlFromExpiry(spec: string): number {
  const match = /^(\d+)([smhd])$/.exec(spec.trim());
  if (!match) return 7 * 24 * 3600;
  const n = Number(match[1]);
  const unit = { s: 1, m: 60, h: 3600, d: 86400 }[match[2] as "s" | "m" | "h" | "d"];
  return n * unit;
}
