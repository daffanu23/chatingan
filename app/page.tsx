import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ThemeToggle } from '@/components/theme-toggle'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    redirect('/chat')
  }

  return (
    <div className="min-h-[100dvh] flex flex-col justify-between bg-gradient-to-b from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 px-4 py-8">
      {/* Header bar */}
      <header className="max-w-5xl mx-auto w-full flex items-center justify-between py-4">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white font-bold text-base shadow-md shadow-indigo-500/20">
            ✦
          </div>
          <span className="font-semibold text-lg tracking-tight text-slate-900 dark:text-white">
            Pulse
          </span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link
            href="/login"
            className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            Masuk
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-3xl mx-auto w-full text-center py-12 sm:py-20 flex flex-col items-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/60 dark:border-indigo-800/40 text-indigo-600 dark:text-indigo-400 text-xs font-medium mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
          Realtime Messaging & Compressed Media
        </div>

        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight text-slate-900 dark:text-white leading-[1.15]">
          Ruang obrolan cepat, <br />
          <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
            bersih dan estetik.
          </span>
        </h1>

        <p className="mt-5 text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed">
          Platform chat modern untuk komunikasi privat dan grup. Dilengkapi sistem kompresi gambar otomatis agar pengiriman selalu ringan dan hemat data.
        </p>

        {/* CTA Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <Link
            href="/signup"
            className="w-full sm:w-auto px-7 py-3 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-medium text-sm hover:opacity-90 transition-all shadow-lg shadow-slate-900/10 text-center"
          >
            Mulai Percakapan
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto px-7 py-3 rounded-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900/60 text-slate-700 dark:text-slate-200 font-medium text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-center"
          >
            Masuk ke Akun
          </Link>
        </div>

        {/* Features Minimalist Pill Grid */}
        <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl text-left">
          <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 backdrop-blur-sm">
            <div className="text-indigo-500 text-lg mb-1.5">⚡</div>
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white">Realtime Supabase</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Pesan terkirim instan tanpa perlu refresh halaman.</p>
          </div>
          <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 backdrop-blur-sm">
            <div className="text-violet-500 text-lg mb-1.5">🗜️</div>
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white">Kompresi Gambar</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Foto otomatis dikompresi di browser sebelum diunggah.</p>
          </div>
          <div className="p-4 rounded-2xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800/60 backdrop-blur-sm">
            <div className="text-pink-500 text-lg mb-1.5">👥</div>
            <h3 className="text-xs font-semibold text-slate-900 dark:text-white">Privat & Grup</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Mendukung obrolan 1-on-1 maupun grup bersama teman.</p>
          </div>
        </div>
      </main>

      <footer className="text-center py-4 text-xs text-slate-400">
        Pulse Chat &bull; 2026
      </footer>
    </div>
  )
}
