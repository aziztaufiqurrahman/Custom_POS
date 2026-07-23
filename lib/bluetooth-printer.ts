"use client";

/**
 * Klien pencetakan langsung ke printer thermal Bluetooth (BLE) via Web
 * Bluetooth API. Hanya tersedia di browser berbasis Chromium (Chrome/Edge)
 * pada HTTPS/localhost — mis. Chrome Android yang dipakai kasir.
 *
 * Alur: pilih perangkat sekali (dialog browser) -> simpan referensi ->
 * kirim byte ESC/POS. Koneksi di-cache selama sesi; bila terputus akan
 * disambungkan ulang otomatis tanpa dialog.
 */

// UUID service yang lazim dipakai printer thermal BLE. Dipakai sebagai
// optionalServices agar characteristic-nya bisa diakses setelah connect.
const PRINTER_SERVICES: Array<number | string> = [
  0x18f0, // umum ("Printer") — banyak printer 58mm portable
  0xff00,
  0xffe0, // modul HM-10
  0xff12,
  0xfee7,
  "49535343-fe7d-4ae5-8fa9-9fafd205e455", // ISSC/Microchip transparent UART
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
];

let cachedDevice: BluetoothDevice | null = null;
let cachedChar: BluetoothRemoteGATTCharacteristic | null = null;

/** Apakah pencetakan Bluetooth didukung di browser ini. */
export function isBluetoothPrintingSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

/** Nama printer yang sedang tersambung (untuk ditampilkan di UI). */
export function connectedPrinterName(): string | null {
  return cachedDevice?.name ?? null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Cari characteristic yang bisa ditulisi dari semua service printer. */
async function findWritableChar(
  server: BluetoothRemoteGATTServer,
): Promise<BluetoothRemoteGATTCharacteristic> {
  const services = await server.getPrimaryServices();
  for (const svc of services) {
    let chars: BluetoothRemoteGATTCharacteristic[];
    try {
      chars = await svc.getCharacteristics();
    } catch {
      continue;
    }
    // Utamakan writeWithoutResponse (lebih cepat untuk stream byte panjang).
    const woResp = chars.find((c) => c.properties.writeWithoutResponse);
    if (woResp) return woResp;
    const withResp = chars.find((c) => c.properties.write);
    if (withResp) return withResp;
  }
  throw new Error(
    "Printer tersambung, tetapi tidak ditemukan jalur cetak yang cocok.",
  );
}

/** Pastikan ada koneksi + characteristic siap tulis (sambung ulang bila perlu). */
async function ensureConnected(): Promise<BluetoothRemoteGATTCharacteristic> {
  if (cachedDevice?.gatt?.connected && cachedChar) return cachedChar;

  if (cachedDevice?.gatt) {
    const server = await cachedDevice.gatt.connect();
    cachedChar = await findWritableChar(server);
    return cachedChar;
  }

  throw new Error("Belum ada printer yang dipilih.");
}

/**
 * Minta pengguna memilih printer (dialog browser). Wajib dipanggil dari
 * gesture pengguna (mis. klik tombol). Menyimpan perangkat untuk cetak
 * berikutnya.
 */
export async function selectPrinter(): Promise<void> {
  if (!navigator.bluetooth) throw new Error("Web Bluetooth tidak didukung.");

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: PRINTER_SERVICES,
  });

  device.addEventListener("gattserverdisconnected", () => {
    cachedChar = null;
  });

  cachedDevice = device;
  cachedChar = null;

  if (!device.gatt) throw new Error("Perangkat tidak mendukung GATT.");
  const server = await device.gatt.connect();
  cachedChar = await findWritableChar(server);
}

/** Lupakan printer tersimpan (agar bisa memilih perangkat lain). */
export function forgetPrinter(): void {
  try {
    cachedDevice?.gatt?.disconnect();
  } catch {
    /* abaikan */
  }
  cachedDevice = null;
  cachedChar = null;
}

/** Kirim byte mentah ke printer, dipecah menjadi paket kecil (batas MTU BLE). */
async function writeBytes(
  char: BluetoothRemoteGATTCharacteristic,
  data: Uint8Array,
): Promise<void> {
  const CHUNK = 180;
  const canNoResp = char.properties.writeWithoutResponse;
  for (let i = 0; i < data.length; i += CHUNK) {
    const slice = data.slice(i, i + CHUNK);
    if (canNoResp) await char.writeValueWithoutResponse(slice);
    else await char.writeValueWithResponse(slice);
    // Jeda kecil agar buffer printer tidak melimpah pada kiriman panjang.
    await sleep(20);
  }
}

/**
 * Cetak byte ESC/POS ke printer. Bila belum ada printer terpilih, minta
 * pengguna memilih lebih dulu (dialog). Aman dipanggil berulang.
 */
export async function printEscpos(data: Uint8Array): Promise<void> {
  if (!navigator.bluetooth) throw new Error("Web Bluetooth tidak didukung.");
  if (!cachedDevice) await selectPrinter();
  const char = await ensureConnected();
  await writeBytes(char, data);
}
