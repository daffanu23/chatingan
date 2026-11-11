'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'

export default function SignupPage() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
        },
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/chat')
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-[#f0f2f5] dark:bg-[#0c1317] flex flex-col justify-between">
      {/* Top Green Banner */}
      <div className="h-40 bg-[#00a884] dark:bg-[#008069] w-full flex items-center px-8">
        <div className="max-w-4xl mx-auto w-full flex items-center gap-3 text-white">
          <span className="text-2xl font-bold">💬 WhatsApp Web</span>
        </div>
      </div>

      {/* Signup Card */}
      <div className="-mt-20 flex-1 flex items-center justify-center px-4 mb-10">
        <div className="w-full max-w-md bg-white dark:bg-[#111b21] rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 p-8 space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-semibold text-[#111b21] dark:text-[#e9edef]">
              Buat Akun Baru
            </h1>
            <p className="text-xs text-[#667781] dark:text-[#8696a0]">
              Mulai terhubung dengan teman & grup Anda
            </p>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            {error && (
              <div className="rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 p-3 text-xs text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="username" className="block text-xs font-semibold uppercase tracking-wider text-[#667781] dark:text-[#8696a0] mb-1.5">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#202c33] px-3.5 py-2.5 text-sm text-[#111b21] dark:text-[#e9edef] placeholder:text-gray-400 focus:border-[#00a884] focus:bg-white dark:focus:bg-[#202c33] focus:ring-2 focus:ring-[#00a884]/20 focus:outline-none transition-all"
                placeholder="nama_kamu"
              />
            </div>

            <div>
              <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-[#667781] dark:text-[#8696a0] mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#202c33] px-3.5 py-2.5 text-sm text-[#111b21] dark:text-[#e9edef] placeholder:text-gray-400 focus:border-[#00a884] focus:bg-white dark:focus:bg-[#202c33] focus:ring-2 focus:ring-[#00a884]/20 focus:outline-none transition-all"
                placeholder="nama@email.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-[#667781] dark:text-[#8696a0] mb-1.5">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="block w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#202c33] px-3.5 py-2.5 text-sm text-[#111b21] dark:text-[#e9edef] placeholder:text-gray-400 focus:border-[#00a884] focus:bg-white dark:focus:bg-[#202c33] focus:ring-2 focus:ring-[#00a884]/20 focus:outline-none transition-all"
                placeholder="Minimal 6 karakter"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#00a884] hover:bg-[#008f6f] px-4 py-3 text-sm font-semibold text-white shadow hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? 'Mendaftarkan...' : 'Daftar Akun'}
            </button>
          </form>

          <p className="text-center text-xs text-[#667781] dark:text-[#8696a0]">
            Sudah punya akun?{' '}
            <Link href="/login" className="font-semibold text-[#00a884] hover:underline">
              Masuk di sini
            </Link>
          </p>
        </div>
      </div>

      <footer className="py-4 text-center text-xs text-[#8696a0]">
        WhatsApp Web Clone &copy; 2026
      </footer>
    </div>
  )
}
