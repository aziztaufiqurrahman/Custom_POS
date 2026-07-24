import { z } from "zod";

/**
 * UUID-format LONGGAR: menerima id yang secara format 8-4-4-4-12 hex namun bukan
 * UUID RFC yang ketat (mis. id tetap Cabang Utama `00000000-...-0000000000c1`,
 * versi 0). Zod v4 `z.string().uuid()` menolak id semacam itu, sehingga untuk
 * kolom yang bisa berisi id cabang bawaan kita pakai validator ini.
 */
export const uuidish = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    "ID tidak valid",
  );
