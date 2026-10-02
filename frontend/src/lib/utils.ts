import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function toFaDigits(value: string): string {
  return value.replace(/\d/g, (d) => FA_DIGITS[Number(d)] ?? d);
}

export function toEnDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (d) => String(FA_DIGITS.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

export function parseLooseNumber(value: string): number {
  const cleaned = toEnDigits(value)
    .replace(/[٬,\s]/g, "")
    .replace(/٫/g, ".")
    .trim();
  return Number(cleaned);
}

export function normalizeIranMobile(input: string): string | null {
  let d = toEnDigits(input).replace(/[^\d+]/g, "");
  if (d.startsWith("+98")) d = `0${d.slice(3)}`;
  else if (d.startsWith("0098")) d = `0${d.slice(4)}`;
  else if (d.startsWith("98") && d.length === 12) d = `0${d.slice(2)}`;
  else if (d.startsWith("9") && d.length === 10) d = `0${d}`;
  return /^09\d{9}$/.test(d) ? d : null;
}

export function isValidNationalCode(code: string): boolean {
  const c = toEnDigits(code).replace(/\D/g, "");
  if (!/^\d{10}$/.test(c)) return false;
  if (/^(\d)\1{9}$/.test(c)) return false;
  const check = Number(c[9]);
  const sum = c
    .slice(0, 9)
    .split("")
    .reduce((acc, digit, index) => acc + Number(digit) * (10 - index), 0);
  const remainder = sum % 11;
  return remainder < 2 ? check === remainder : check === 11 - remainder;
}

export function normalizeIban(input: string): string {
  return toEnDigits(input).replace(/[\s-]/g, "").toUpperCase();
}

export function isValidIban(input: string): boolean {
  const compact = normalizeIban(input);
  if (!/^IR\d{24}$/.test(compact)) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let rem = 0;
  for (const ch of rearranged) {
    const chunk = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const digit of chunk) rem = (rem * 10 + Number(digit)) % 97;
  }
  return rem === 1;
}

export function safeInternalPath(raw: string | null | undefined): string {
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return "/";
  }
  if (raw.startsWith("/login")) return "/";
  return raw;
}

export function formatSeconds(total: number): string {
  const safe = Math.max(0, Math.floor(total));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  const raw = `${m}:${String(s).padStart(2, "0")}`;
  return raw.replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

export function trimGrams(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  return n.toFixed(4).replace(/\.?0+$/, "");
}

export function isAmbiguousFailure(err: unknown): boolean {
  return !(err as { response?: unknown })?.response;
}

export function formatRial(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "۰";
  return new Intl.NumberFormat("fa-IR").format(Math.round(n));
}

export function formatGrams(value: number | string): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "۰";
  return new Intl.NumberFormat("fa-IR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format(n);
}

export function formatRelativeFa(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("fa-IR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function txTypeLabel(type: string): string {
  const map: Record<string, string> = {
    DEPOSIT: "واریز",
    WITHDRAW: "برداشت",
    BUY_GOLD: "خرید طلا",
    SELL_GOLD: "فروش طلا",
    DELIVER_GOLD: "تحویل فیزیکی",
  };
  return map[type] ?? type;
}

export function txStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING: "در انتظار",
    COMPLETED: "موفق",
    FAILED: "ناموفق",
    CANCELED: "لغو شده",
  };
  return map[status] ?? status;
}

export function getErrorMessage(err: unknown, fallback = "خطایی رخ داد"): string {
  const msg = (err as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;
  if (Array.isArray(msg)) return msg[0] ?? fallback;
  if (typeof msg === "string") return msg;
  return fallback;
}
