'use client'

import { useState, useEffect } from 'react'
import { localDb, saveLocalMedia, getLocalMedia } from '@/lib/db/schema'

/**
 * Mengunduh media gambar dari URL cloud sementara (Supabase Storage)
 * dan menyimpannya 100% permanen ke IndexedDB lokal perangkat pengguna.
 */
export async function cacheRemoteMediaToLocal(
  messageId: string,
  conversationId: string,
  remoteUrl: string
): Promise<Blob | null> {
  try {
    // 1. Cek apakah sudah ada di IndexedDB lokal
    const existing = await getLocalMedia(messageId)
    if (existing && existing.blob) {
      return existing.blob
    }

    // 2. Unduh binary foto dari remote URL
    const response = await fetch(remoteUrl)
    if (!response.ok) {
      console.warn(`[LocalMedia] Failed to fetch remote media for ${messageId}:`, response.status)
      return null
    }

    const blob = await response.blob()

    // 3. Simpan permanen ke IndexedDB lokal perangkat
    await saveLocalMedia(messageId, conversationId, blob)
    return blob
  } catch (err) {
    console.warn(`[LocalMedia] Error caching remote media for ${messageId}:`, err)
    return null
  }
}

/**
 * React Hook untuk memuat gambar:
 * 1. Selalu memprioritaskan pemuatan dari IndexedDB lokal perangkat (0ms, offline).
 * 2. Jika belum ada di lokal tapi ada remoteUrl, unduh di background dan otomatis beralih ke lokal.
 */
export function useLocalMediaUrl(messageId: string, remoteUrl: string | null) {
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    let activeObjectUrl: string | null = null

    async function loadMedia() {
      try {
        // Cek storage lokal terlebih dahulu
        const local = await getLocalMedia(messageId)
        if (local && local.blob) {
          activeObjectUrl = URL.createObjectURL(local.blob)
          if (isMounted) {
            setMediaUrl(activeObjectUrl)
            setLoading(false)
          }
          return
        }

        // Jika belum ada di lokal, gunakan remoteUrl sementara
        if (remoteUrl) {
          if (isMounted) {
            setMediaUrl(remoteUrl)
            setLoading(false)
          }

          // Unduh di background dan simpan ke lokal
          const blob = await fetch(remoteUrl).then((r) => (r.ok ? r.blob() : null)).catch(() => null)
          if (blob && isMounted) {
            // Dapatkan conversationId dari pesan jika ada
            const msg = await localDb.messages.get(messageId)
            const convId = msg?.conversation_id || 'general'
            await saveLocalMedia(messageId, convId, blob)

            const newObjectUrl = URL.createObjectURL(blob)
            activeObjectUrl = newObjectUrl
            if (isMounted) {
              setMediaUrl(newObjectUrl)
            }
          }
        } else {
          if (isMounted) {
            setLoading(false)
          }
        }
      } catch (err) {
        console.warn('[useLocalMediaUrl] Error loading media:', err)
        if (isMounted) {
          setMediaUrl(remoteUrl)
          setLoading(false)
        }
      }
    }

    loadMedia()

    return () => {
      isMounted = false
      if (activeObjectUrl && activeObjectUrl.startsWith('blob:')) {
        URL.revokeObjectURL(activeObjectUrl)
      }
    }
  }, [messageId, remoteUrl])

  return { mediaUrl, loading }
}
