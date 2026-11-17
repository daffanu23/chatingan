import { localDb } from './schema'
import type { LocalConversation, LocalMessage, LocalTombstone } from './types'

export type ChatBackupData = {
  version: 1
  exported_at: string
  device_id: string
  conversations: LocalConversation[]
  messages: LocalMessage[]
  tombstones: LocalTombstone[]
}

/**
 * Mengekspor seluruh data riwayat percakapan dan pesan dari IndexedDB lokal ke format JSON.
 */
export async function exportLocalChatData(deviceId: string): Promise<string> {
  const conversations = await localDb.conversations.toArray()
  const messages = await localDb.messages.toArray()
  const tombstones = await localDb.tombstones.toArray()

  const backup: ChatBackupData = {
    version: 1,
    exported_at: new Date().toISOString(),
    device_id: deviceId,
    conversations,
    messages,
    tombstones,
  }

  return JSON.stringify(backup, null, 2)
}

/**
 * Mengimpor file backup JSON ke IndexedDB lokal pada browser baru.
 */
export async function importLocalChatData(
  jsonData: string
): Promise<{ success: boolean; importedConvs: number; importedMsgs: number }> {
  try {
    const data: ChatBackupData = JSON.parse(jsonData)

    if (!data.version || !Array.isArray(data.conversations) || !Array.isArray(data.messages)) {
      throw new Error('Format file cadangan tidak valid.')
    }

    let importedConvs = 0
    let importedMsgs = 0

    await localDb.transaction('rw', [localDb.conversations, localDb.messages, localDb.tombstones], async () => {
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
    })

    return { success: true, importedConvs, importedMsgs }
  } catch (err) {
    console.error('[Backup] Import error:', err)
    throw err
  }
}
