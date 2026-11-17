import { localDb } from './schema'
import type { LocalConversation, LocalMessage, LocalTombstone } from './types'

export type SerializedMediaFile = {
  id: string
  conversation_id: string
  data_base64: string
  mime_type: string
  size: number
  created_at: number
}

export type SerializedSticker = {
  id: string
  name: string
  data_base64: string
  mime_type: string
  size: number
  is_favorite: boolean
  pack_name?: string
  created_at: number
}

export type ChatBackupData = {
  version: 1 | 2 | 3
  exported_at: string
  device_id: string
  conversations: LocalConversation[]
  messages: LocalMessage[]
  tombstones: LocalTombstone[]
  media_files?: SerializedMediaFile[]
  custom_stickers?: SerializedSticker[]
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function base64ToBlob(base64: string): Blob {
  const parts = base64.split(',')
  const header = parts[0]
  const data = parts[1] || ''
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg'
  const binary = atob(data)
  const array = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i)
  }
  return new Blob([array], { type: mime })
}

/**
 * Mengekspor seluruh data riwayat percakapan, pesan, dan foto lokal dari IndexedDB ke format JSON.
 */
export async function exportLocalChatData(deviceId: string): Promise<string> {
  const conversations = await localDb.conversations.toArray()
  const messages = await localDb.messages.toArray()
  const tombstones = await localDb.tombstones.toArray()
  const mediaList = await localDb.media_files.toArray()

  // Serialisasi file media Blob ke Base64
  const serializedMedia: SerializedMediaFile[] = []
  for (const m of mediaList) {
    if (m.blob) {
      try {
        const base64 = await blobToBase64(m.blob)
        serializedMedia.push({
          id: m.id,
          conversation_id: m.conversation_id,
          data_base64: base64,
          mime_type: m.mime_type,
          size: m.size,
          created_at: m.created_at,
        })
      } catch (e) {
        console.warn(`[Backup] Failed to serialize media ${m.id}:`, e)
      }
    }
  }

  // Serialisasi stiker custom Blob ke Base64
  const stickerList = await localDb.custom_stickers.toArray()
  const serializedStickers: SerializedSticker[] = []
  for (const s of stickerList) {
    if (s.blob) {
      try {
        const base64 = await blobToBase64(s.blob)
        serializedStickers.push({
          id: s.id,
          name: s.name,
          data_base64: base64,
          mime_type: s.mime_type,
          size: s.size,
          is_favorite: s.is_favorite,
          pack_name: s.pack_name,
          created_at: s.created_at,
        })
      } catch (e) {
        console.warn(`[Backup] Failed to serialize sticker ${s.id}:`, e)
      }
    }
  }

  const backup: ChatBackupData = {
    version: 3,
    exported_at: new Date().toISOString(),
    device_id: deviceId,
    conversations,
    messages,
    tombstones,
    media_files: serializedMedia,
    custom_stickers: serializedStickers,
  }

  return JSON.stringify(backup, null, 2)
}

/**
 * Mengimpor file backup JSON ke IndexedDB lokal pada browser baru.
 */
export async function importLocalChatData(
  jsonData: string
): Promise<{ success: boolean; importedConvs: number; importedMsgs: number; importedMedia: number }> {
  try {
    const data: ChatBackupData = JSON.parse(jsonData)

    if (!data.version || !Array.isArray(data.conversations) || !Array.isArray(data.messages)) {
      throw new Error('Format file cadangan tidak valid.')
    }

    let importedConvs = 0
    let importedMsgs = 0
    let importedMedia = 0

    await localDb.transaction(
      'rw',
      [localDb.conversations, localDb.messages, localDb.tombstones, localDb.media_files, localDb.custom_stickers],
      async () => {
        // 1. Impor tombstones
        if (Array.isArray(data.tombstones)) {
          for (const t of data.tombstones) {
            await localDb.tombstones.put(t)
          }
        }

        // 2. Impor percakapan
        for (const conv of data.conversations) {
          const existing = await localDb.conversations.get(conv.id)
          if (!existing || conv.updated_at > (existing.updated_at || 0)) {
            await localDb.conversations.put(conv)
            importedConvs++
          }
        }

        // 3. Impor pesan
        for (const msg of data.messages) {
          const existing = await localDb.messages.get(msg.id)
          if (!existing) {
            await localDb.messages.put(msg)
            importedMsgs++
          } else if (msg.status > existing.status) {
            await localDb.messages.update(msg.id, {
              status: msg.status,
              server_ts: msg.server_ts || existing.server_ts,
            })
          }
        }

        // 4. Impor media files lokal
        if (Array.isArray(data.media_files)) {
          for (const media of data.media_files) {
            const existingMedia = await localDb.media_files.get(media.id)
            if (!existingMedia && media.data_base64) {
              try {
                const blob = base64ToBlob(media.data_base64)
                await localDb.media_files.put({
                  id: media.id,
                  conversation_id: media.conversation_id,
                  blob,
                  mime_type: media.mime_type,
                  size: media.size,
                  created_at: media.created_at,
                })
                importedMedia++
              } catch (err) {
                console.warn(`[Backup] Failed to import media ${media.id}:`, err)
              }
            }
          }
        }

        // 5. Impor stiker custom lokal
        if (Array.isArray(data.custom_stickers)) {
          for (const stk of data.custom_stickers) {
            const existingSticker = await localDb.custom_stickers.get(stk.id)
            if (!existingSticker && stk.data_base64) {
              try {
                const blob = base64ToBlob(stk.data_base64)
                await localDb.custom_stickers.put({
                  id: stk.id,
                  name: stk.name,
                  blob,
                  mime_type: stk.mime_type,
                  size: stk.size,
                  is_favorite: stk.is_favorite,
                  pack_name: stk.pack_name,
                  created_at: stk.created_at,
                })
              } catch (err) {
                console.warn(`[Backup] Failed to import sticker ${stk.id}:`, err)
              }
            }
          }
        }
      }
    )

    return { success: true, importedConvs, importedMsgs, importedMedia }
  } catch (err) {
    console.error('[Backup] Import error:', err)
    throw err
  }
}
