import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/chat')
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] dark:bg-[#0c1317] flex flex-col justify-between">
      {/* Top Green Banner (WA Web Style) */}
      <div className="h-32 bg-[#00a884] dark:bg-[#008069] w-full" />

      {/* Main Content Card */}
      <div className="-mt-16 flex-1 flex items-center justify-center px-4 mb-8">
        <div className="w-full max-w-md bg-white dark:bg-[#111b21] rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-8 text-center space-y-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#e7fce3] dark:bg-[#005c4b] text-3xl shadow-inner">
            💬
          </div>

          <div>
            <h1 className="text-2xl font-bold text-[#111b21] dark:text-[#e9edef] tracking-tight">
              WhatsApp Web Clone
            </h1>
            <p className="mt-2 text-sm text-[#667781] dark:text-[#8696a0]">
              Kirim pesan dan gambar cepat & terkompresi secara real-time.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <Link
              href="/login"
              className="block w-full py-3 px-4 rounded-xl bg-[#00a884] hover:bg-[#008f6f] text-white font-medium text-sm transition-all shadow hover:shadow-md"
            >
              Masuk ke Akun
            </Link>
            <Link
              href="/signup"
              className="block w-full py-3 px-4 rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-[#202c33] text-[#111b21] dark:text-[#e9edef] font-medium text-sm transition-all"
            >
              Daftar Akun Baru
            </Link>
          </div>

          <div className="pt-4 border-t border-gray-100 dark:border-gray-800 text-xs text-[#8696a0]">
            🔒 Terenkripsi & Didukung Supabase Realtime + Storage
          </div>
        </div>
      </div>

      <footer className="py-4 text-center text-xs text-[#8696a0]">
        Prototype Chat App &copy; 2026
      </footer>
    </div>
  )
}
