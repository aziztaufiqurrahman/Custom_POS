import { describe, expect, it } from "vitest";

import { computeReconciliation, grandTotal } from "./shift";

describe("computeReconciliation", () => {
  it("menghitung expected & variance saat uang pas", () => {
    const r = computeReconciliation({
      openingBalance: 100000,
      totalCash: 250000,
      countedCash: 350000,
    });
    expect(r.expectedCash).toBe(350000);
    expect(r.variance).toBe(0);
  });

  it("selisih lebih (surplus) bernilai positif", () => {
    const r = computeReconciliation({
      openingBalance: 100000,
      totalCash: 200000,
      countedCash: 305000,
    });
    expect(r.expectedCash).toBe(300000);
    expect(r.variance).toBe(5000);
  });

  it("selisih kurang (deficit) bernilai negatif", () => {
    const r = computeReconciliation({
      openingBalance: 50000,
      totalCash: 150000,
      countedCash: 180000,
    });
    expect(r.expectedCash).toBe(200000);
    expect(r.variance).toBe(-20000);
  });

  it("tanpa penjualan cash, expected = uang awal", () => {
    const r = computeReconciliation({
      openingBalance: 100000,
      totalCash: 0,
      countedCash: 100000,
    });
    expect(r.expectedCash).toBe(100000);
    expect(r.variance).toBe(0);
  });

  it("pengeluaran kas tunai mengurangi kas seharusnya", () => {
    const r = computeReconciliation({
      openingBalance: 100000,
      totalCash: 250000,
      cashExpenses: 40000,
      countedCash: 310000,
    });
    expect(r.expectedCash).toBe(310000); // 100000 + 250000 - 40000
    expect(r.variance).toBe(0);
  });
});

describe("grandTotal", () => {
  it("menjumlahkan semua metode bayar", () => {
    expect(grandTotal({ cash: 100000, qris: 50000, transfer: 25000 })).toBe(
      175000,
    );
  });
});
