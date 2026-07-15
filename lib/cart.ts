/**
 * Perhitungan total keranjang — SELARAS dengan RPC create_sale di database
 * (harga & pajak dihitung ulang otoritatif di server; ini untuk pratinjau UI).
 *
 * line_total     = max(0, unit_price * qty - discount)
 * gross_subtotal = Σ unit_price * qty
 * discount_total = Σ line discount + order_discount
 * pajak dihitung hanya bila tax_enabled (inklusif/eksklusif)
 * grand_total    = gross_subtotal - discount_total + tax_total  (eksklusif/tanpa pajak)
 *                = gross_subtotal - order_discount              (inklusif; pajak sudah termasuk)
 */

export type CartLineCalc = {
  unitPrice: number;
  qty: number;
  discount: number;
  isTaxable: boolean;
};

export type TaxSettings = {
  taxEnabled: boolean;
  taxPercent: number;
  taxInclusive: boolean;
};

export type CartTotals = {
  grossSubtotal: number;
  lineDiscountTotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function lineTotal(line: CartLineCalc): number {
  return Math.max(0, round2(line.unitPrice * line.qty - line.discount));
}

export function computeCartTotals(
  lines: CartLineCalc[],
  orderDiscount: number,
  tax: TaxSettings,
): CartTotals {
  let grossSubtotal = 0;
  let lineDiscountTotal = 0;
  let taxableNet = 0;

  for (const line of lines) {
    grossSubtotal += round2(line.unitPrice * line.qty);
    lineDiscountTotal += line.discount;
    if (line.isTaxable) taxableNet += lineTotal(line);
  }

  grossSubtotal = round2(grossSubtotal);
  const orderDisc = orderDiscount || 0;
  const discountTotal = round2(lineDiscountTotal + orderDisc);

  let taxTotal = 0;
  if (tax.taxEnabled) {
    const rate = (tax.taxPercent || 0) / 100;
    taxTotal = tax.taxInclusive
      ? round2(taxableNet - taxableNet / (1 + rate))
      : round2(taxableNet * rate);
  }

  const grandTotal =
    tax.taxEnabled && tax.taxInclusive
      ? Math.max(0, round2(grossSubtotal - orderDisc))
      : Math.max(0, round2(grossSubtotal - discountTotal + taxTotal));

  return { grossSubtotal, lineDiscountTotal, discountTotal, taxTotal, grandTotal };
}
