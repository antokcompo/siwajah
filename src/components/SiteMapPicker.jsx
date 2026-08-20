import { useEffect, useRef, useState } from 'react'
import { MapPin, Navigation, Crosshair, Lock, Unlock, Check, X, Target, ShieldCheck } from 'lucide-react'

export default function SiteMapPicker({ lat, lng, radius = 500, onChange }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)
  const circleRef = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [gettingGps, setGettingGps] = useState(false)
  const [isEditMode, setIsEditMode] = useState(false)
  const [pendingPos, setPendingPos] = useState(null)

  const numLat = Number(lat) || -4.824405
  const numLng = Number(lng) || 136.844816
  const numRadius = Number(radius) || 500

  // Load Leaflet CSS & JS dynamically
  useEffect(() => {
    if (window.L) {
      setMapLoaded(true)
      return
    }

    const cssLink = document.createElement('link')
    cssLink.rel = 'stylesheet'
    cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(cssLink)

    const script = document.createElement('script')
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.async = true
    script.onload = () => {
      setMapLoaded(true)
    }
    document.body.appendChild(script)
  }, [])

  // Ref to hold current state inside Leaflet event listeners
  const isEditModeRef = useRef(isEditMode)
  useEffect(() => {
    isEditModeRef.current = isEditMode
    if (markerRef.current) {
      if (isEditMode) {
        markerRef.current.dragging.enable()
      } else {
        markerRef.current.dragging.disable()
        setPendingPos(null)
      }
    }
  }, [isEditMode])

  // Initialize and update Leaflet Map
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return

    const L = window.L

    if (!mapInstanceRef.current) {
      const map = L.map(mapRef.current, {
        center: [numLat, numLng],
        zoom: 16,
        zoomControl: true
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map)

      // Custom high-tech vector pin marker
      const createCustomIcon = (active = false) => L.divIcon({
        className: 'custom-site-pin',
        html: `<div style="
          width: 32px;
          height: 32px;
          background: ${active ? '#ef4444' : '#06b6d4'};
          border: 3px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 0 15px ${active ? 'rgba(239,68,68,0.8)' : 'rgba(6,182,212,0.8)'};
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="width: 10px; height: 10px; background: white; border-radius: 50%;"></div>
        </div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      })

      const marker = L.marker([numLat, numLng], { draggable: false, icon: createCustomIcon(false) }).addTo(map)
      const circle = L.circle([numLat, numLng], {
        radius: numRadius,
        color: '#10b981',
        fillColor: '#10b981',
        fillOpacity: 0.2,
        weight: 2
      }).addTo(map)

      marker.on('dragend', () => {
        if (!isEditModeRef.current) return
        const pos = marker.getLatLng()
        const candidate = { lat: pos.lat.toFixed(6), lng: pos.lng.toFixed(6) }
        setPendingPos(candidate)
        circle.setLatLng(pos)
      })

      map.on('click', (e) => {
        if (!isEditModeRef.current) return
        const { lat: newLat, lng: newLng } = e.latlng
        const candidate = { lat: newLat.toFixed(6), lng: newLng.toFixed(6) }
        marker.setLatLng([newLat, newLng])
        circle.setLatLng([newLat, newLng])
        setPendingPos(candidate)
      })

      mapInstanceRef.current = map
      markerRef.current = marker
      circleRef.current = circle
    } else {
      const map = mapInstanceRef.current
      const marker = markerRef.current
      const circle = circleRef.current

      if (marker && circle && !pendingPos) {
        const curMarkerPos = marker.getLatLng()
        if (Math.abs(curMarkerPos.lat - numLat) > 0.000001 || Math.abs(curMarkerPos.lng - numLng) > 0.000001) {
          marker.setLatLng([numLat, numLng])
          circle.setLatLng([numLat, numLng])
          map.setView([numLat, numLng], map.getZoom())
        }
        circle.setRadius(numRadius)
      }
    }
  }, [mapLoaded, numLat, numLng, numRadius])

  function handleGetCurrentLocation() {
    if (!navigator.geolocation) return
    setGettingGps(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const latStr = pos.coords.latitude.toFixed(6)
        const lngStr = pos.coords.longitude.toFixed(6)
        setPendingPos({ lat: latStr, lng: lngStr })
        if (markerRef.current && circleRef.current) {
          markerRef.current.setLatLng([pos.coords.latitude, pos.coords.longitude])
          circleRef.current.setLatLng([pos.coords.latitude, pos.coords.longitude])
          mapInstanceRef.current?.setView([pos.coords.latitude, pos.coords.longitude], 16)
        }
        setIsEditMode(true)
        setGettingGps(false)
      },
      () => setGettingGps(false),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function handleConfirmPos() {
    if (pendingPos) {
      onChange(pendingPos.lat, pendingPos.lng)
      setPendingPos(null)
      setIsEditMode(false)
    }
  }

  function handleCancelPos() {
    setPendingPos(null)
    if (markerRef.current && circleRef.current) {
      markerRef.current.setLatLng([numLat, numLng])
      circleRef.current.setLatLng([numLat, numLng])
      mapInstanceRef.current?.setView([numLat, numLng], mapInstanceRef.current?.getZoom() || 16)
    }
    setIsEditMode(false)
  }

  return (
    <div className="space-y-2.5 mt-4">
      {/* Header Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-cyan-400" />
          <span className="text-xs font-bold text-slate-200">
            Peta Lokasi Site & Area Radius ({numRadius} m)
          </span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold flex items-center gap-1 border ${
            isEditMode
              ? 'bg-amber-950/80 text-amber-300 border-amber-600/80 animate-pulse'
              : 'bg-cyan-950/80 text-cyan-300 border-cyan-700/80'
          }`}>
            {isEditMode ? <Unlock size={11} /> : <Lock size={11} />}
            <span>{isEditMode ? 'Mode Edit Aktif' : 'Titik Terkunci'}</span>
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleGetCurrentLocation}
            disabled={gettingGps}
            className="px-2.5 py-1 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
          >
            <Crosshair size={13} />
            {gettingGps ? 'Mengambil GPS...' : 'Gunakan GPS Saya'}
          </button>

          {!isEditMode ? (
            <button
              type="button"
              onClick={() => setIsEditMode(true)}
              className="px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Unlock size={13} />
              <span>Ubah Posisi Titik</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleCancelPos}
              className="px-3 py-1 bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
            >
              <Lock size={13} />
              <span>Kunci Peta</span>
            </button>
          )}
        </div>
      </div>

      {/* Map Canvas Container */}
      <div className="relative w-full h-80 rounded-2xl overflow-hidden border border-slate-700 shadow-inner bg-slate-950">
        {!mapLoaded && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 gap-2 bg-slate-900">
            <div className="w-5 h-5 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
            <span>Memuat Peta Pilihan Lokasi...</span>
          </div>
        )}

        <div ref={mapRef} className="w-full h-full z-0" />

        {/* Confirmation Overlay Banner when user moves pin */}
        {pendingPos && (
          <div className="absolute bottom-3 left-3 right-3 z-[1000] bg-slate-950/95 border border-cyan-500/50 backdrop-blur-md rounded-xl p-3 shadow-2xl flex items-center justify-between flex-wrap gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0">
                <Target size={18} />
              </div>
              <div>
                <div className="font-bold text-white">Konfirmasi Perubahan Titik Site Proyek</div>
                <div className="text-[11px] font-mono text-cyan-300 mt-0.5">
                  Koordinat Baru: {pendingPos.lat}, {pendingPos.lng}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancelPos}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors border border-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmPos}
                className="px-3.5 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold flex items-center gap-1.5 transition-colors shadow-md shadow-cyan-950/50"
              >
                <Check size={14} /> Setuju & Terapkan Titik
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Instructional Footer Text */}
      <div className="text-[11px] text-slate-400 flex items-center justify-between flex-wrap gap-2 font-sans">
        <p className="flex items-center gap-1.5 text-slate-400">
          <Navigation size={12} className="text-cyan-400 shrink-0" />
          <span>
            {!isEditMode
              ? 'Posisi titik site terkunci untuk mencegah pengubahan tidak sengaja. Klik "Ubah Posisi Titik" jika ingin mengedit.'
              : 'Mode edit aktif: Klik pada peta atau geser pin marker ke posisi baru, lalu tekan "Setuju & Terapkan Titik".'}
          </span>
        </p>
      </div>
    </div>
  )
}
