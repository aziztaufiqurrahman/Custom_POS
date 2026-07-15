import { notFound } from "next/navigation";

import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";

import { OpnameClient, type OpnameRow } from "./opname-client";

export default async function OpnameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { profile } = await requireAuth();
  const supabase = await createClient();

  const { data: opname } = await supabase
    .from("stock_opnames")
    .select("id, code, status, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!opname) notFound();

  const [{ data: allProducts }, { data: activeProducts }, { data: items }] =
    await Promise.all([
      supabase.from("products_public").select("id, name"),
      supabase
        .from("products_public")
        .select("id, name, sku, unit, stock")
        .is("deleted_at", null)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("stock_opname_items")
        .select("product_id, system_qty, physical_qty, difference, reason")
        .eq("opname_id", id),
    ]);

  const nameById = new Map((allProducts ?? []).map((p) => [p.id, p.name]));
  const existing = new Map((items ?? []).map((it) => [it.product_id, it]));

  let rows: OpnameRow[];
  if (opname.status === "completed") {
    rows = (items ?? []).map((it) => ({
      product_id: it.product_id,
      name: nameById.get(it.product_id) ?? "(produk dihapus)",
      sku: "",
      unit: "",
      system_qty: it.system_qty,
      physical_qty: it.physical_qty,
      reason: it.reason ?? "",
    }));
  } else {
    rows = (activeProducts ?? []).map((p) => {
      const prev = existing.get(p.id!);
      return {
        product_id: p.id!,
        name: p.name!,
        sku: p.sku!,
        unit: p.unit!,
        system_qty: p.stock!, // stok sistem terkini
        physical_qty: prev ? prev.physical_qty : p.stock!,
        reason: prev?.reason ?? "",
      };
    });
  }

  return (
    <OpnameClient
      opnameId={opname.id}
      code={opname.code}
      status={opname.status}
      canEdit={opname.status === "draft" && can(profile, "stock.opname")}
      initialRows={rows}
    />
  );
}
