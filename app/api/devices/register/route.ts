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
    const { deviceId, deviceName, deviceType } = body

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()

    // Gunakan upsert dengan onConflict: 'device_id'
    const { error: upsertError } = await supabase.from('user_devices').upsert(
      {
        device_id: deviceId,
        user_id: user.id,
        device_name: deviceName || 'Web Browser',
        device_type: deviceType || 'desktop',
        last_active_at: nowIso,
      },
      { onConflict: 'device_id' }
    )

    if (upsertError) {
      // Jika terjadi race condition konkuren (code 23505), lakukan fallback update
      if (upsertError.code === '23505') {
        const { error: updateError } = await supabase
          .from('user_devices')
          .update({
            user_id: user.id,
            device_name: deviceName || 'Web Browser',
            device_type: deviceType || 'desktop',
            last_active_at: nowIso,
          })
          .eq('device_id', deviceId)

        if (updateError) {
          console.error('[API] Device registration fallback update error:', updateError)
          return NextResponse.json({ error: updateError.message }, { status: 500 })
        }
        return NextResponse.json({ success: true, deviceId })
      }

      console.error('[API] Device registration error:', upsertError)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, deviceId })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal Server Error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
