# 🚀 Panduan Hosting / Deployment Live

Aplikasi chat ini dibangun menggunakan **Next.js 16** dan **Supabase Backend**. Anda dapat men-deploy aplikasi ini ke **Vercel** (sangat direkomendasikan untuk Next.js), **Netlify**, atau platform lain seperti **Railway / VPS**.

---

## 1. Environment Variables yang Wajib Diset di Hosting

Ketika men-deploy ke penyedia hosting (misalnya di Dashboard Vercel / Netlify pada menu *Environment Variables*), masukkan variabel berikut:

| Key | Value | Keterangan |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://lxgwwaxmfxtmqakdufhu.supabase.co` | URL Project Supabase Anda |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` (lihat `.env.example`) | Anon Public Key Supabase |

---

## 2. Cara Deploy Paling Cepat: Vercel

1. **Push kode ke GitHub/GitLab/Bitbucket**:
   ```bash
   git add .
   git commit -m "Deploy production chat app"
   git push origin main
   ```
2. Buka [vercel.com](https://vercel.com) dan login.
3. Klik **"Add New Project"** dan pilih repository GitHub Anda.
4. Pada bagian **Environment Variables**, tambahkan 2 variabel di atas (`NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
5. Klik **"Deploy"**. Dalam ~1 menit web Anda sudah live dengan domain gratis (contoh: `https://chatingan-kamu.vercel.app`).

---

## 3. Konfigurasi Wajib di Supabase Dashboard (PENTING!)

Agar sistem Login & Session Cookie bekerja sempurna di domain live Anda:

1. Buka [Supabase Dashboard](https://supabase.com/dashboard/project/lxgwwaxmfxtmqakdufhu).
2. Pergi ke menu **Authentication** ➔ **URL Configuration**.
3. Pada **Site URL**, ubah dari `http://localhost:3000` menjadi domain live Anda (contoh: `https://chatingan-kamu.vercel.app`).
4. Pada **Redirect URLs**, tambahkan:
   - `https://chatingan-kamu.vercel.app/**`
5. Klik **Save**.

---

## 4. Fitur yang Sudah Siap Live
- ✅ **Koneksi Supabase Realtime** (Chat instan tanpa refresh)
- ✅ **Storage Gambar** (Tersimpan rapi per percakapan di bucket `chat-images`)
- ✅ **Kompresi Gambar Otomatis** (Mengecilkan ukuran foto di browser pengguna sebelum diupload)
- ✅ **Notifikasi Suara, Visual Toast & Badge Hijau**
- ✅ **Status Centang Pengiriman & Centang Biru (Read Receipts)**
