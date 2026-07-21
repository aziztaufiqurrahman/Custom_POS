"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { formatNumber, parseRupiah } from "@/lib/format";

type RupiahInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "onChange" | "type" | "inputMode"
> & {
  value: number;
  onValueChange: (value: number) => void;
};

/**
 * Input angka rupiah yang otomatis menampilkan pemisah ribuan (mis. 10000 -> 10.000).
 * Menyimpan nilai sebagai number murni via onValueChange.
 */
function RupiahInput({ value, onValueChange, ...props }: RupiahInputProps) {
  const display = value ? formatNumber(value) : "";
  return (
    <Input
      inputMode="numeric"
      value={display}
      onChange={(e) => onValueChange(parseRupiah(e.target.value))}
      {...props}
    />
  );
}

export { RupiahInput };
