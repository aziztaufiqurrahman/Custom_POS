"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Pagination sisi-klien: memotong array menjadi halaman. Cocok untuk daftar
 * berukuran wajar (sudah dibatasi query di server). Halaman otomatis reset ke 1
 * saat jumlah item berubah (mis. setelah filter/pencarian).
 */
export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [items.length]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => items.slice((current - 1) * pageSize, current * pageSize),
    [items, current, pageSize],
  );

  return {
    page: current,
    setPage,
    totalPages,
    pageItems,
    total: items.length,
    pageSize,
    from: items.length === 0 ? 0 : (current - 1) * pageSize + 1,
    to: Math.min(current * pageSize, items.length),
  };
}

export function Pagination({
  page,
  totalPages,
  from,
  to,
  total,
  onPage,
  className,
  unit = "item",
}: {
  page: number;
  totalPages: number;
  from: number;
  to: number;
  total: number;
  onPage: (p: number) => void;
  className?: string;
  unit?: string;
}) {
  if (total === 0) return null;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 pt-3 text-sm",
        className,
      )}
    >
      <span className="text-muted-foreground">
        {from}–{to} dari {total} {unit}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPage(page - 1)}
          >
            <ChevronLeft className="size-4" /> Sebelumnya
          </Button>
          <span className="px-2 text-xs text-muted-foreground">
            Hal {page}/{totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPage(page + 1)}
          >
            Berikutnya <ChevronRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
