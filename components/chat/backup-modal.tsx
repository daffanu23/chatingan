'use client'

import { useState, useRef } from 'react'
import { exportLocalChatData, importLocalChatData } from '@/lib/db/backup'
import { getClientDeviceInfo } from '@/lib/device/client-device'

export function BackupModal({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState<'export' | 'import'>('export')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const { deviceId } = getClientDeviceInfo()
      const jsonString = await exportLocalChatData(deviceId)

      const blob = new Blob([jsonString], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `chatingan-backup-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setMessage('Riwayat chat berhasil diekspor ke file JSON.')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal mengekspor riwayat chat.'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const text = await file.text()
      const res = await importLocalChatData(text)
      setMessage(
        `Sukses! Berhasil memulihkan ${res.importedConvs} percakapan, ${res.importedMsgs} pesan, dan ${res.importedMedia || 0} foto ke perangkat ini.`
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'File cadangan tidak valid.'
      setError(msg)
    } finally {
      setLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-sm font-bold">
              💾
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Cadangan Lokal (Multi-Device Sync)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Pindahkan riwayat chat antar peramban/perangkat
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </div>

        {/* Mode Selector */}
        <div className="flex gap-2 my-4 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl">
          <button
            onClick={() => {
              setMode('export')
              setMessage(null)
              setError(null)
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              mode === 'export'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Ekspor Cadangan
          </button>
          <button
            onClick={() => {
              setMode('import')
              setMessage(null)
              setError(null)
            }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              mode === 'import'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Impor Cadangan
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 py-2">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs">
              {error}
            </div>
          )}
          {message && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 text-xs">
              {message}
            </div>
          )}

          {mode === 'export' ? (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Karena riwayat chat disimpan 100% di IndexedDB perangkat Anda (Local-First),
                Anda dapat mengunduh seluruh obrolan dalam satu file <code>.json</code> untuk dipindahkan ke laptop atau HP lain.
              </p>
              <button
                onClick={handleExport}
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs transition-colors flex items-center justify-center gap-2"
              >
                {loading ? 'Mengekspor...' : '📥 Unduh File Cadangan (.json)'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Pilih file <code>.json</code> hasil ekspor dari perangkat lama untuk memulihkan percakapan di browser baru ini.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-medium text-xs hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
              >
                {loading ? 'Memproses...' : '📤 Pilih File Cadangan (.json)'}
              </button>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}
