import {
  assertAdultIsoDate,
  assertGrams,
  assertRial,
  isValidIranIban,
  quoteFromMid,
} from "./checks";

describe("money bounds", () => {
  it("accepts a 4-decimal rial amount", () => {
    expect(assertRial(1500.5)).toBe(1500.5);
  });

  it("rejects dust that rounds to zero", () => {
    expect(() => assertGrams(0.00001)).toThrow(/range|positive/);
  });

  it("rejects more than 4 decimal places", () => {
    expect(() => assertRial(1.23456)).toThrow(/4 decimal/);
  });

  it("rejects amounts above the cap", () => {
    expect(() => assertRial(2_000_000_000_000)).toThrow(/range/);
    expect(() => assertGrams(1001)).toThrow(/range/);
  });
});

describe("iran iban", () => {
  it("accepts a checksum-valid IBAN and rejects a mutated one", () => {
    const body = "1701200000000123456789";
    const rearranged = `${body}IR00`;
    let rem = 0;
    for (const ch of rearranged) {
      const chunk = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
      for (const digit of chunk) rem = (rem * 10 + Number(digit)) % 97;
    }
    const check = String(98 - rem).padStart(2, "0");
    const iban = `IR${check}${body}`;
    expect(isValidIranIban(iban)).toBe(true);
    expect(isValidIranIban(`${iban.slice(0, -1)}1`)).toBe(false);
    expect(isValidIranIban("IR000000000000000000000000")).toBe(false);
  });
});

describe("adult birth date", () => {
  const now = new Date("2026-09-30T00:00:00Z");

  it("accepts an adult and rejects a minor and an impossible day", () => {
    expect(() => assertAdultIsoDate("1990-01-01", now)).not.toThrow();
    expect(() => assertAdultIsoDate("2015-01-01", now)).toThrow(/18/);
    expect(() => assertAdultIsoDate("2020-02-31", now)).toThrow(/real calendar/);
  });
});

describe("quote", () => {
  it("puts the buy price above the sell price", () => {
    const quote = quoteFromMid(1_000_000, 50, 50, 20);
    expect(Number(quote.ask)).toBeGreaterThan(Number(quote.mid));
    expect(Number(quote.bid)).toBeLessThan(Number(quote.mid));
    expect(quote.feeBps).toBe(20);
  });
});
