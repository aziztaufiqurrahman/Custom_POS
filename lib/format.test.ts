import { describe, expect, it } from "vitest";

import { formatNumber, formatRupiah, parseRupiah } from "./format";

describe("formatRupiah", () => {
  it("memformat angka menjadi mata uang Rupiah tanpa desimal", () => {
    expect(formatRupiah(1234567)).toBe("Rp1.234.567");
  });

  it("menangani 0 dan nilai null/undefined", () => {
    expect(formatRupiah(0)).toBe("Rp0");
    expect(formatRupiah(null)).toBe("Rp0");
    expect(formatRupiah(undefined)).toBe("Rp0");
  });

  it("membulatkan pecahan ke bilangan bulat", () => {
    expect(formatRupiah(1000.6)).toBe("Rp1.001");
  });
});

describe("parseRupiah", () => {
  it("mengekstrak digit dari teks rupiah", () => {
    expect(parseRupiah("Rp1.234.567")).toBe(1234567);
    expect(parseRupiah("50000")).toBe(50000);
    expect(parseRupiah("")).toBe(0);
  });
});

describe("formatNumber", () => {
  it("menambahkan pemisah ribuan", () => {
    expect(formatNumber(1234567)).toBe("1.234.567");
  });
});
