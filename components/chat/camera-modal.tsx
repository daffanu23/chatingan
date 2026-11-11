'use client'

import { useState, useEffect, useRef } from 'react'

export function CameraModal({
  isOpen,
  onClose,
  onCapture,
}: {
  isOpen: boolean
  onClose: () => void
  onCapture: (file: File) => void
}) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // Check available cameras
  useEffect(() => {
    if (!isOpen) return
    async function checkDevices() {
      try {
        if (navigator.mediaDevices?.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices()
          const videoInputs = devices.filter((d) => d.kind === 'videoinput')
          setHasMultipleCameras(videoInputs.length > 1)
        }
      } catch (_) {}
    }
    checkDevices()
  }, [isOpen])

  // Start video stream when open or facingMode changes
  useEffect(() => {
    if (!isOpen) {
      stopStream()
      return
    }

    let isMounted = true

    async function startCamera() {
      setErrorMsg(null)
      stopStream()

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Browser tidak mendukung akses kamera langsung.')
        }

        const constraints: MediaStreamConstraints = {
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: false,
        }

        let mediaStream: MediaStream
        try {
          mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
        } catch {
          // Fallback to basic video constraint if ideal failed
          mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
        }

        if (!isMounted) {
          mediaStream.getTracks().forEach((t) => t.stop())
          return
        }

        setStream(mediaStream)
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
          videoRef.current.play().catch(() => {})
        }
      } catch (err: any) {
        if (!isMounted) return
        console.error('Camera error:', err)
        setErrorMsg(
          err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
            ? 'Izin kamera ditolak. Harap izinkan akses kamera di browser Anda.'
            : 'Tidak dapat mengakses kamera. Pastikan kamera tidak digunakan aplikasi lain.'
        )
      }
    }

    startCamera()

    return () => {
      isMounted = false
      stopStream()
    }
  }, [isOpen, facingMode])

  function stopStream() {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      setStream(null)
    }
  }

  // Handle snap photo
  function handleSnap() {
    if (!videoRef.current || !canvasRef.current) return
    const video = videoRef.current
    const canvas = canvasRef.current

    canvas.width = video.videoWidth || 1280
    canvas.height = video.videoHeight || 720

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // If front camera, mirror image
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0)
      ctx.scale(-1, 1)
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (blob) => {
        if (blob) {
          setCapturedBlob(blob)
          const url = URL.createObjectURL(blob)
          setPreviewUrl(url)
        }
      },
      'image/jpeg',
      0.92
    )
  }

  // Retake photo
  function handleRetake() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setCapturedBlob(null)
    setPreviewUrl(null)
  }

  // Confirm and send photo
  function handleConfirmSend() {
    if (!capturedBlob) return
    const file = new File([capturedBlob], `camera-${Date.now()}.jpg`, {
      type: 'image/jpeg',
    })
    onCapture(file)
    handleClose()
  }

  function handleClose() {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setCapturedBlob(null)
    setPreviewUrl(null)
    setErrorMsg(null)
    stopStream()
    onClose()
  }

  function toggleFacingMode() {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'))
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="relative w-full h-full sm:h-auto sm:max-w-lg sm:aspect-[4/3] bg-black sm:rounded-3xl overflow-hidden flex flex-col justify-between shadow-2xl border border-white/10">
        {/* Top Floating Controls */}
        <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
          <button
            type="button"
            onClick={handleClose}
            className="h-10 w-10 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/70 backdrop-blur-md transition-colors"
            title="Tutup Kamera"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          {!previewUrl && hasMultipleCameras && (
            <button
              type="button"
              onClick={toggleFacingMode}
              className="h-10 w-10 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/70 backdrop-blur-md transition-colors"
              title="Balik Kamera (Depan / Belakang)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
                <path d="M16 16h5v5"/>
              </svg>
            </button>
          )}
        </div>

        {/* Viewfinder / Preview Area */}
        <div className="relative flex-1 w-full h-full bg-black flex items-center justify-center overflow-hidden">
          {errorMsg ? (
            <div className="p-6 text-center text-white max-w-sm">
              <div className="h-12 w-12 rounded-2xl bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m2 2 20 20"/>
                  <path d="M7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16"/>
                  <path d="M9.5 4h5L17 7h3a2 2 0 0 1 2 2v7.5"/>
                  <circle cx="12" cy="13" r="3"/>
                </svg>
              </div>
              <p className="text-sm font-semibold mb-1">Akses Kamera Gagal</p>
              <p className="text-xs text-slate-300 leading-relaxed mb-4">{errorMsg}</p>
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-medium transition-colors"
              >
                Tutup
              </button>
            </div>
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt="Hasil foto kamera"
              className="w-full h-full object-cover"
            />
          ) : (
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${
                facingMode === 'user' ? 'scale-x-[-1]' : ''
              }`}
            />
          )}

          {/* Hidden Canvas for Frame Capture */}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Bottom Shutter / Action Controls */}
        <div className="absolute bottom-0 left-0 right-0 z-20 p-5 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-center gap-6">
          {previewUrl ? (
            // Review actions after snap
            <div className="flex items-center gap-4 w-full max-w-xs justify-center">
              <button
                type="button"
                onClick={handleRetake}
                className="flex-1 py-3 px-4 rounded-2xl bg-white/15 hover:bg-white/25 text-white font-medium text-xs backdrop-blur-md transition-all flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                  <path d="M3 3v5h5"/>
                </svg>
                <span>Foto Ulang</span>
              </button>

              <button
                type="button"
                onClick={handleConfirmSend}
                className="flex-1 py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
              >
                <span>Kirim</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/>
                  <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
              </button>
            </div>
          ) : !errorMsg ? (
            // Live Shutter button (iOS style)
            <button
              type="button"
              onClick={handleSnap}
              className="group relative h-18 w-18 rounded-full border-4 border-white flex items-center justify-center transition-transform active:scale-90"
              title="Ambil Foto"
              aria-label="Ambil Foto"
            >
              <span className="h-14 w-14 rounded-full bg-white group-hover:scale-95 group-active:scale-90 transition-transform" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
