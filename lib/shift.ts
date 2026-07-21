/** Logika rekonsiliasi kas shift (murni, dapat diuji). */

export type Bank = "BNI" | "BCA" | "BSI";

export type PaymentBreakdown = {
  cash: number;
  qris: number;
  transfer: number;
  gofood: number;
  shopeefood: number;
  transferByBank: Record<Bank, number>;
  count: number; // jumlah transaksi selesai
};

export function emptyBreakdown(): PaymentBreakdown {
  return {
    cash: 0,
    qris: 0,
    transfer: 0,
    gofood: 0,
    shopeefood: 0,
    transferByBank: { BNI: 0, BCA: 0, BSI: 0 },
    count: 0,
  };
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Total seluruh transaksi = cash + qris + transfer + gofood + shopeefood. */
export function grandTotal(b: {
  cash: number;
  qris: number;
  transfer: number;
  gofood?: number;
  shopeefood?: number;
}): number {
  return round2(
    b.cash + b.qris + b.transfer + (b.gofood ?? 0) + (b.shopeefood ?? 0),
  );
}

export type Reconciliation = {
  expectedCash: number; // uang awal + total penjualan cash
  variance: number; // dihitung - expected (lebih:+ / kurang:-)
};

/**
 * expected_cash = opening_balance + total penjualan CASH
 * variance      = counted_cash - expected_cash
 */
export function computeReconciliation(input: {
  openingBalance: number;
  totalCash: number;
  countedCash: number;
}): Reconciliation {
  const expectedCash = round2(input.openingBalance + input.totalCash);
  const variance = round2(input.countedCash - expectedCash);
  return { expectedCash, variance };
}
