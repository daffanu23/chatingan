import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
    const { deviceId, queueIds, eventIds } = body

    if (!deviceId || (!queueIds && !eventIds)) {
      return NextResponse.json(
        { error: 'deviceId and either queueIds or eventIds are required' },
        { status: 400 }
      )
    }

    let query = supabase
      .from('device_message_queue')
      .delete()
      .eq('target_device_id', deviceId)
      .eq('target_user_id', user.id)

    if (Array.isArray(queueIds) && queueIds.length > 0) {
      query = query.in('id', queueIds)
    } else if (Array.isArray(eventIds) && eventIds.length > 0) {
      query = query.in('event_id', eventIds)
    }

    const { error } = await query

    if (error) {
      console.error('[API] Failed to delete ACKed queue items:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, deleted: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
