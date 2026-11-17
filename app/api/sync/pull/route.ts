import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get('deviceId')

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })
    }

    // Ambil antrean tertunda untuk device ini
    const { data: queueItems, error } = await supabase
      .from('device_message_queue')
      .select('*')
      .eq('target_device_id', deviceId)
      .eq('target_user_id', user.id)
      .order('id', { ascending: true })
      .limit(200)

    if (error) {
      console.error('[API] Failed to fetch device queue:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      events: queueItems || [],
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
