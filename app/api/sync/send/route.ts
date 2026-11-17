import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ulid } from 'ulid'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { eventType, payload, senderDeviceId, targetUserIds } = body

    if (!eventType || !payload || !senderDeviceId) {
      return NextResponse.json(
        { error: 'eventType, payload, and senderDeviceId are required' },
        { status: 400 }
      )
    }

    const serverTs = Date.now()
    const eventId = `evt_${ulid()}`

    // Payload enriched with official server_ts
    const enrichedPayload = {
      ...payload,
      server_ts: serverTs,
      sender_id: user.id,
      sender_device_id: senderDeviceId,
    }

    // Tentukan user target yang perlu menerima event
    // Pastikan sender dimasukkan untuk fan-out (self-sync ke perangkat lain milik pengirim)
    const targetUsersSet = new Set<string>()
    if (Array.isArray(targetUserIds)) {
      targetUserIds.forEach((uid: string) => targetUsersSet.add(uid))
    }
    // Wajib sertakan sender sendiri untuk self-sync ke perangkat sender lainnya
    targetUsersSet.add(user.id)

    const allTargetUserList = Array.from(targetUsersSet)

    // Cari semua perangkat aktif milik target users
    const { data: devices, error: devError } = await supabase
      .from('user_devices')
      .select('device_id, user_id')
      .in('user_id', allTargetUserList)

    if (devError) {
      console.error('[API] Error fetching target devices:', devError)
    }

    const activeDevices = devices || []

    // Filter perangkat yang akan diberi antrean:
    // Jangan enqueue ke perangkat senderDeviceId pengirim saat ini
    const queueEntries = activeDevices
      .filter((dev) => dev.device_id !== senderDeviceId)
      .map((dev) => ({
        target_device_id: dev.device_id,
        target_user_id: dev.user_id,
        sender_id: user.id,
        sender_device_id: senderDeviceId,
        event_id: eventId,
        event_type: eventType,
        payload: enrichedPayload,
        server_ts: new Date(serverTs).toISOString(),
        expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      }))

    // Simpan ke antrean sementara (ephemeral store-and-forward)
    if (queueEntries.length > 0) {
      const { error: queueError } = await supabase
        .from('device_message_queue')
        .insert(queueEntries)

      if (queueError) {
        console.error('[API] Failed to enqueue ephemeral messages:', queueError)
      }
    }

    // Trigger Supabase Realtime broadcast ke masing-masing target user channel
    // Hal ini memungkinkan perangkat online menerima event secara langsung via WebSocket
    const syncEvent = {
      event_id: eventId,
      event_type: eventType,
      sender_id: user.id,
      sender_device_id: senderDeviceId,
      server_ts: serverTs,
      payload: enrichedPayload,
    }

    for (const targetUid of allTargetUserList) {
      try {
        const channel = supabase.channel(`sync:user:${targetUid}`)
        if (typeof (channel as any).httpSend === 'function') {
          await (channel as any).httpSend('sync_event', syncEvent)
        } else {
          await channel.send({
            type: 'broadcast',
            event: 'sync_event',
            payload: syncEvent,
          })
        }
        supabase.removeChannel(channel)
      } catch (broadcastErr) {
        console.warn(`[API] Broadcast failed for user ${targetUid}:`, broadcastErr)
      }
    }

    return NextResponse.json({
      success: true,
      eventId,
      serverTs,
      status: 1, // SENT
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
