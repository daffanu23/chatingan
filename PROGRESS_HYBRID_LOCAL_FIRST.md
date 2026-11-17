# 📋 Progress Refactoring: Hybrid Local-First Multi-Device Chat Architecture

Dokumen ini mencatat seluruh progres implementasi, keputusan arsitektur, berkas yang dibuat/diubah, serta langkah lanjutan untuk melanjutkan pengembangan aplikasi chat **Pulse (Chatingan)**.

---

## 1. Ringkasan Arsitektur Baru

Aplikasi telah berhasil direfaktor dari arsitektur klasik (riwayat chat permanen di server PostgreSQL) menjadi arsitektur **Hybrid Local-First Multi-Device**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       SERVER DATABASE (Supabase PostgreSQL)                │
├──────────────────────────────────────┬──────────────────────────────────────┤
│ PERSISTENT DATA:                     │ EPHEMERAL STORE-AND-FORWARD BROKER:  │
│  - profiles (Auth & @username search)│  - device_message_queue (TTL 14 hari)│
│  - user_devices (Sesi device aktif)  │    * Wajib LANGSUNG HAPUS saat ACK!  │
└──────────────────────────────────────┴──────────────────────────────────────┘
                                ▲      │ WebSocket Realtime (Postgres Changes
                       ACK /    │      │ & Broadcast)
                      Register  │      ▼
                                │  Push Events (Pesan, Status, Tombstone)
                                │      │
┌───────────────────────────────┴──────┴──────────────────────────────────────┐
│                    CLIENT BROWSER (Dexie.js / IndexedDB)                    │
├─────────────────────────────────────────────────────────────────────────────┤
│ LOCAL STORAGE 100% PERSISTENT (navigator.storage.persist()):                 │
│  - conversations (Daftar room, last message, unread count)                   │
│  - messages (ID ULID, isi chat, status monotonic 0..3, tombstone, server_ts)│
│  - tombstones (Pencegah balapan event hapus vs event pesan masuk)            │
│  - device_meta (device_id unik per peramban, nama gawai, kursor sinkronisasi)│
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Berkas yang Telah Dibuat & Diperbarui

### A. Skema Database & Migrasi SQL
* `supabase/migrations/20261117_hybrid_local_first.sql`
  * Tabel `user_devices`: Mencatat perangkat aktif per pengguna (`device_id`, `device_name`, `device_type`, `last_active_at`).
  * Tabel `device_message_queue`: Antrean sementara (*ephemeral*) pesan tertunda untuk perangkat tujuan.
  * Fungsi pembersihan otomatis TTL 14 hari: `cleanup_expired_device_queue()`.
  * Publikasi Supabase Realtime untuk antrean: `ALTER PUBLICATION supabase_realtime ADD TABLE device_message_queue;`.
  * Pembersihan penyimpanan pesan permanen lama di server (`messages`).

### B. Database Lokal (Dexie.js / IndexedDB)
* `lib/db/types.ts`: Tipe data lokal, representasi status pengiriman monotonic (`0: PENDING`, `1: SENT`, `2: DELIVERED`, `3: READ`), dan struktur `SyncEvent`.
* `lib/db/schema.ts`: Database `ChatinganLocalDB` dengan tabel `conversations`, `messages`, `tombstones`, dan `device_meta`. Dilengkapi pemanggilan `navigator.storage.persist()`, helper monotonic status, dan tombstone pattern.
* `lib/db/backup.ts`: Helper ekspor dan impor seluruh percakapan dan riwayat chat lokal ke/dari format file `.json`.

### C. Manajemen Perangkat & Engine Sinkronisasi
* `lib/device/client-device.ts`: Menghasilkan `device_id` unik persisten (`dev_<ulid>`), deteksi tipe browser/OS, dan registrasi perangkat ke server.
* `lib/sync/sync-engine.ts`: Core client sync engine:
  * Mengintegrasikan Supabase Realtime WebSocket (kombinasi `postgres_changes` pada `device_message_queue` dan `broadcast`).
  * Mengelola pengiriman pesan (`sendMessage`) dari status lokal `0: PENDING` hingga dikonfirmasi `1: SENT`.
  * Menangani status monotonic (`DELIVERED` saat diterima penerima, `READ` saat obrolan dibuka).
  * Menangani `tombstone` saat pesan dihapus agar tidak terjadi kesalahan jika event hapus tiba lebih dulu (*out-of-order delivery*).
  * Mengirim `ACK` ke server yang **langsung menghapus fisik** baris event terkait dari antrean database server.
  * Menarik (*drain*) antrean pesan tertunda saat perangkat baru online (`drainPendingQueue`).

### D. Server Route Handlers (API Next.js)
* `app/api/devices/register/route.ts`: Endpoint registrasi perangkat dengan pemisahan query `SELECT maybeSingle()` ➔ `UPDATE` / `INSERT` untuk menghindari konflik RLS `USING` clause.
* `app/api/sync/send/route.ts`: Endpoint *fan-out* pesan, penyematan stempel waktu resmi server (`server_ts`), *enqueue* ke `device_message_queue` untuk semua gawai penerima dan gawai lain pengirim (*self-sync*), serta broadcast via `httpSend`.
* `app/api/sync/pull/route.ts`: Endpoint untuk menarik pesan tertunda untuk `deviceId` tertentu saat perangkat online.
* `app/api/sync/ack/route.ts`: Endpoint konfirmasi `ACK` yang langsung menjalankan `DELETE FROM device_message_queue`.
* `app/api/users/search/route.ts`: Endpoint pencarian user berdasarkan `@username` dari tabel `profiles` server.

### E. Komponen Antarmuka Pengguna (UI)
* `components/chat/chat-layout.tsx`: Reaktif membaca percakapan dari IndexedDB via `useLiveQuery`, inisialisasi `syncEngine`, dynamic title badge unread.
* `components/chat/sidebar.tsx`: Menampilkan obrolan lokal dari IndexedDB, filter pencarian & tab, status perangkat, dan tombol cadangan.
* `components/chat/chat-area.tsx`: Menampilkan pesan 100% dari IndexedDB lokal, status centang monotonic (🕒 Pending, ✓ Terkirim, ✓✓ Abu Delivered, ✓✓ Biru Read), bubble tombstone pesan terhapus, reply quote, dan pengiriman foto/teks.
* `components/chat/new-chat-modal.tsx`: Pencarian `@username` ke server dan inisialisasi room chat di IndexedDB lokal.
* `components/chat/new-group-modal.tsx`: Pembuatan room grup chat di IndexedDB lokal.
* `components/chat/backup-modal.tsx`: Dialog interaktif untuk mengunduh dan memulihkan cadangan chat `.json`.
* `app/chat/page.tsx`: Disederhanakan untuk hanya memverifikasi autentikasi pengguna tanpa membaca riwayat pesan dari server.

---

## 3. Perbaikan Bug yang Sudah Diterapkan

1. **Fix RLS Error Code `42501` & Race Condition `23505` pada Registrasi Perangkat:**
   * **Akar Masalah Utama:** Ketika 1 peramban/browser yang sama digunakan untuk berganti akun (logout ➔ login akun lain), `localStorage` menyimpan `device_id` yang sama. Saat akun kedua login, browser mencoba meng-update baris perangkat milik akun pertama. PostgreSQL menolaknya karena klausa `USING (auth.uid() = user_id)` (melanggar kepemilikan antar akun).
   * **Solusi Namespacing Per-User:** `getClientDeviceInfo(userId)` kini men-generate dan mengisolasi `device_id` berdasarkan ID pengguna (`dev_<userPrefix>_<ulid>`). Setiap akun memiliki namespace perangkatnya masing-masing di `localStorage` dan tabel `user_devices`.
   * Di `/api/devices/register`: Menggunakan `upsert` atomik dengan `onConflict: 'device_id'` serta fallback update otomatis jika terjadi race condition (kode `23505`) saat React 19 Strict Mode memicu request registrasi ganda secara paralel.
2. **Fix Realtime `httpSend` Signature & Deprecation Warning:**
   * Mengoreksi parameter pemanggilan `channel.httpSend('sync_event', syncEvent)` sesuai signature Supabase Realtime SDK (sebelumnya membungkus payload dalam satu objek tunggal yang memicu `Payload is required for httpSend()`).
3. **Fix Prop TypeScript:**
   * Menyesuaikan prop `onSelect` pada `IosEmojiPicker` dan `isOpen` pada `CameraModal`.
4. **Verifikasi Build:**
   * Perintah `npm run build` berhasil dijalankan **100% sukses tanpa error**.

---

## 4. Status Integrasi & Debugging Langsung ke Supabase

Integrasi **Supabase MCP** telah berhasil terhubung langsung ke proyek **chat (`lxgwwaxmfxtmqakdufhu`)**. Langkah-langkah audit dan optimasi yang telah dieksekusi secara otomatis ke database:

1. **Verifikasi Skema & Realtime:**
   - Tabel `user_devices` dan `device_message_queue` aktif dan berfungsi.
   - Publikasi `supabase_realtime` telah mencakup tabel `device_message_queue` sehingga notifikasi WebSocket otomatis bekerja saat pesan baru di-enqueue.
2. **Perbaikan & Penguatan Keamanan Fungsi (Security Advisor):**
   - Fungsi `public.cleanup_expired_device_queue()` telah diperbaiki dengan parameter `SET search_path = ''` dan hak akses `EXECUTE` telah dicabut dari publik/anonim (`REVOKE EXECUTE FROM PUBLIC, anon; GRANT EXECUTE TO service_role`).
3. **Optimasi Kinerja RLS (Performance Advisor):**
   - Seluruh evaluasi `auth.uid()` pada policy `user_devices` dan `device_message_queue` telah dioptimalkan menjadi `(select auth.uid())` (InitPlan caching), mencegah eksekusi fungsi per-baris berulang saat query berjalan dalam skala besar.
   - Menambahkan covering index foreign key:
     - `idx_device_queue_sender` pada `public.device_message_queue(sender_id)`
     - `idx_conversations_created_by` pada `public.conversations(created_by)`
4. **Verifikasi Sesi Perangkat:**
   - Perangkat aktif berhasil terdaftar di tabel `user_devices` tanpa adanya kendala RLS.
   - Tabel antrean `device_message_queue` bersih sesuai prinsip *store-and-forward* (pesan langsung terhapus saat diterima client tujuan via ACK).

---

## 5. Rencana Langkah Saat Melanjutkan Nanti

1. **Menghubungkan Plugin Supabase (Opsional):**
   * Lakukan *sign-in* pada plugin Supabase MCP jika ingin agen AI dapat menjalankan migrasi dan membaca log database secara otomatis tanpa manual buka dashboard.
2. **Pengujian Pengalaman Pengguna (End-to-End Testing):**
   * Jalankan `npm run dev`.
   * Buka dua browser/tab berbeda untuk menguji:
     * Pengiriman pesan instan (🕒 ➔ ✓ ➔ ✓✓ abu ➔ ✓✓ biru).
     * Self-sync multi-device (1 akun di 2 browser berbeda).
     * Pesan offline (matikan browser penerima, kirim pesan, nyalakan kembali penerima).
     * Hapus pesan (tombstone pattern).
     * Ekspor dan impor file cadangan `.json`.
