import { describe, expect, it } from "vitest";

import { computeCartTotals, lineTotal } from "./cart";

const noTax = { taxEnabled: false, taxPercent: 11, taxInclusive: false };

describe("lineTotal", () => {
  it("mengurangi diskon per baris dan tidak minus", () => {
    expect(lineTotal({ unitPrice: 4000, qty: 3, discount: 2000, isTaxable: false })).toBe(10000);
    expect(lineTotal({ unitPrice: 4000, qty: 1, discount: 9999, isTaxable: false })).toBe(0);
  });
});

describe("computeCartTotals — tanpa pajak", () => {
  it("subtotal, diskon, dan total benar", () => {
    const t = computeCartTotals(
      [
        { unitPrice: 4000, qty: 2, discount: 0, isTaxable: false },
        { unitPrice: 15000, qty: 1, discount: 1000, isTaxable: false },
      ],
      2000,
      noTax,
    );
    expect(t.grossSubtotal).toBe(23000);
    expect(t.discountTotal).toBe(3000); // 1000 baris + 2000 order
    expect(t.taxTotal).toBe(0);
    expect(t.grandTotal).toBe(20000);
  });
});

describe("computeCartTotals — PPN eksklusif 11%", () => {
  it("pajak ditambahkan di atas item kena pajak", () => {
    const t = computeCartTotals(
      [{ unitPrice: 100000, qty: 1, discount: 0, isTaxable: true }],
      0,
      { taxEnabled: true, taxPercent: 11, taxInclusive: false },
    );
    expect(t.taxTotal).toBe(11000);
    expect(t.grandTotal).toBe(111000);
  });
});

describe("computeCartTotals — PPN inklusif 11%", () => {
  it("pajak dipisah dari harga; total = harga", () => {
    const t = computeCartTotals(
      [{ unitPrice: 111000, qty: 1, discount: 0, isTaxable: true }],
      0,
      { taxEnabled: true, taxPercent: 11, taxInclusive: true },
    );
    expect(t.taxTotal).toBe(11000);
    expect(t.grandTotal).toBe(111000);
  });
});
