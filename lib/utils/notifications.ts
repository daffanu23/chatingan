/**
 * Notification Sound & Desktop Notification Utilities
 */

// Simple pre-generated base64 WAV sound for instant, reliable notification across all browsers
// A pleasant two-tone WhatsApp-style "ding"
const BEEP_WAV =
  'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVoGAACBhYqFbF1fdJivrJBhNjVgodDbqWEzHByc2/LDnlo2EhSY1/TOpV03FRSY2PPPpl85FhOZ2fTPqGE7FhKZ2fTQqmI9GBGZ2fTRrGU/GBCZ2PTRrWdAGBCY2PTRrmhCGBCY2PTPsGpDGQ+Y2PTOsmxEGQ+X2PTPtG1FGQ+X2PTOtm5GGQ+X2PTOt29GGQ6X'

let sharedAudioContext: AudioContext | null = null

// Initialize audio after user gesture
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      if (!sharedAudioContext) {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        if (AudioContextClass) {
          sharedAudioContext = new AudioContextClass()
        }
      }
      if (sharedAudioContext && sharedAudioContext.state === 'suspended') {
        sharedAudioContext.resume()
      }
    } catch {
      // Ignore
    }
  }

  window.addEventListener('click', unlockAudio, { once: true, passive: true })
  window.addEventListener('keydown', unlockAudio, { once: true, passive: true })
}

export function playNotificationSound() {
  if (typeof window === 'undefined') return

  // Method 1: Try Web Audio API with synth frequencies
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext

    if (!sharedAudioContext && AudioContextClass) {
      sharedAudioContext = new AudioContextClass()
    }

    if (sharedAudioContext) {
      if (sharedAudioContext.state === 'suspended') {
        sharedAudioContext.resume()
      }

      const ctx = sharedAudioContext
      const now = ctx.currentTime

      // Tone 1: 880Hz (A5)
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(880, now)
      gain1.gain.setValueAtTime(0.25, now)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.12)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.12)

      // Tone 2: 1318Hz (E6)
      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(1318.5, now + 0.08)
      gain2.gain.setValueAtTime(0.3, now + 0.08)
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.35)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(now + 0.08)
      osc2.stop(now + 0.35)
      return
    }
  } catch {
    // Fallback to HTML5 audio below
  }

  // Method 2: HTML5 Audio fallback
  try {
    const audio = new Audio(BEEP_WAV)
    audio.volume = 0.5
    audio.play().catch(() => {
      // Autoplay might be restricted until user interacts with document
    })
  } catch {
    // Ignore
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'denied'
  }

  try {
    const perm = await Notification.requestPermission()
    return perm
  } catch {
    return 'denied'
  }
}

export function showDesktopNotification(title: string, options?: NotificationOptions) {
  if (typeof window === 'undefined' || !('Notification' in window)) return

  if (Notification.permission === 'granted') {
    try {
      const notif = new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        silent: true, // We already play our own pleasant chime
        ...options,
      })

      setTimeout(() => notif.close(), 6000)
    } catch {
      // Ignore
    }
  }
}
