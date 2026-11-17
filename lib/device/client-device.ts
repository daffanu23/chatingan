import { ulid } from 'ulid'

export type ClientDeviceInfo = {
  deviceId: string
  deviceName: string
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'browser'
}

export function getClientDeviceInfo(userId?: string): ClientDeviceInfo {
  if (typeof window === 'undefined') {
    return {
      deviceId: 'server_dummy',
      deviceName: 'Server',
      deviceType: 'browser',
    }
  }

  // Namespace deviceId per user ID agar tidak terjadi tabrakan RLS jika 1 browser dipakai berganti akun
  const storageKey = userId ? `chatingan_client_device_id_${userId}` : 'chatingan_client_device_id'
  let deviceId = localStorage.getItem(storageKey)

  if (!deviceId) {
    const userPrefix = userId ? `${userId.replace(/-/g, '').slice(0, 8)}_` : ''
    deviceId = `dev_${userPrefix}${ulid().toLowerCase()}`
    localStorage.setItem(storageKey, deviceId)
  }

  const userAgent = navigator.userAgent
  let deviceType: 'desktop' | 'mobile' | 'tablet' | 'browser' = 'desktop'
  if (/iPad|tablet|(android(?!.*mobile))/i.test(userAgent)) {
    deviceType = 'tablet'
  } else if (/Mobile|Android|iP(hone|od)/i.test(userAgent)) {
    deviceType = 'mobile'
  }

  let browser = 'Browser'
  if (userAgent.includes('Firefox')) browser = 'Firefox'
  else if (userAgent.includes('Edg')) browser = 'Edge'
  else if (userAgent.includes('Chrome')) browser = 'Chrome'
  else if (userAgent.includes('Safari')) browser = 'Safari'

  let os = 'OS'
  if (userAgent.includes('Win')) os = 'Windows'
  else if (userAgent.includes('Mac')) os = 'macOS'
  else if (userAgent.includes('Android')) os = 'Android'
  else if (userAgent.includes('Linux')) os = 'Linux'
  else if (userAgent.includes('iPhone') || userAgent.includes('iPad')) os = 'iOS'

  const deviceName = `${browser} (${os})`

  return {
    deviceId,
    deviceName,
    deviceType,
  }
}

export async function registerDeviceOnServer(userId: string): Promise<boolean> {
  try {
    const info = getClientDeviceInfo(userId)
    const res = await fetch('/api/devices/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: info.deviceId,
        deviceName: info.deviceName,
        deviceType: info.deviceType,
        userId,
      }),
    })
    return res.ok
  } catch (err) {
    console.error('[Device] Registration failed:', err)
    return false
  }
}
