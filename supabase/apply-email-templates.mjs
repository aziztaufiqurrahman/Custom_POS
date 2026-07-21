// Terapkan template & subjek email Auth (Bahasa Indonesia, branding Pudingkuu
// Lucky) ke project Supabase via Management API.
//
// PRASYARAT: project HARUS memakai SMTP kustom (Auth > SMTP Settings di
// dashboard). Free tier dengan email provider bawaan TIDAK mengizinkan kustom
// template.
//
// Cara pakai (PowerShell):
//   $env:SUPABASE_ACCESS_TOKEN="sbp_xxx"; $env:SUPABASE_PROJECT_REF="qeoeqspinyydcmoysbrb"
//   node supabase/apply-email-templates.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;
if (!TOKEN || !REF) {
  console.error("Set SUPABASE_ACCESS_TOKEN dan SUPABASE_PROJECT_REF dulu.");
  process.exit(1);
}

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => readFileSync(join(here, "email-templates", f), "utf8");

const body = {
  mailer_subjects_invite: "Undangan Bergabung — Pudingkuu Lucky",
  mailer_templates_invite_content: read("invite.html"),
  mailer_subjects_recovery: "Atur Ulang Kata Sandi — Pudingkuu Lucky",
  mailer_templates_recovery_content: read("recovery.html"),
  mailer_subjects_confirmation: "Konfirmasi Email Anda — Pudingkuu Lucky",
  mailer_templates_confirmation_content: read("confirmation.html"),
};

const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  method: "PATCH",
  headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
const text = await res.text();
if (!res.ok) {
  console.error(`[GAGAL ${res.status}] ${text.slice(0, 800)}`);
  process.exit(1);
}
console.log("[OK] Template & subjek email Auth berhasil diperbarui.");
