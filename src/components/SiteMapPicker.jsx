import { useEffect, useRef, useState } from 'react'
import { MapPin, Navigation, Crosshair } from 'lucide-react'

export default function SiteMapPicker({ lat, lng, radius = 500, onChange }) {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)
  const circleRef = useRef(null)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [gettingGps, setGettingGps] = useState(false)

  const numLat = Number(lat) || -4.824405
  const numLng = Number(lng) || 136.844816
  const numRadius = Number(radius) || 500

  // Load Leaflet CSS and JS dynamically
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

      // Tile layer from OpenStreetMap
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map)

      // Custom marker icon
      const customIcon = L.divIcon({
        className: 'custom-map-pin',
        html: `<div style="
          width: 32px;
          height: 32px;
          background: #06b6d4;
          border: 3px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
        ">📍</div>`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      })

      const marker = L.marker([numLat, numLng], { draggable: true, icon: customIcon }).addTo(map)
      const circle = L.circle([numLat, numLng], {
        radius: numRadius,
        color: '#10b981',
        fillColor: '#10b981',
        fillOpacity: 0.2,
        weight: 2
      }).addTo(map)

      marker.on('dragend', () => {
        const pos = marker.getLatLng()
        circle.setLatLng(pos)
        onChange(pos.lat.toFixed(6), pos.lng.toFixed(6))
      })

      map.on('click', (e) => {
        const { lat: newLat, lng: newLng } = e.latlng
        marker.setLatLng([newLat, newLng])
        circle.setLatLng([newLat, newLng])
        onChange(newLat.toFixed(6), newLng.toFixed(6))
      })

      mapInstanceRef.current = map
      markerRef.current = marker
      circleRef.current = circle
    } else {
      const map = mapInstanceRef.current
      const marker = markerRef.current
      const circle = circleRef.current

      if (marker && circle) {
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
        onChange(latStr, lngStr)
        setGettingGps(false)
      },
      () => setGettingGps(false),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  return (
    <div className="space-y-2 mt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-cyan-400" />
          <span className="text-xs font-bold text-slate-200">
            Peta Lokasi Site & Area Radius ({numRadius} m)
          </span>
        </div>
        <button
          type="button"
          onClick={handleGetCurrentLocation}
          disabled={gettingGps}
          className="px-2.5 py-1 bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/30 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors"
        >
          <Crosshair size={13} />
          {gettingGps ? 'Mengambil GPS...' : 'Gunakan GPS Saya'}
        </button>
      </div>

      <div className="relative w-full h-80 rounded-2xl overflow-hidden border border-slate-700 shadow-inner bg-slate-950">
        {!mapLoaded && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 gap-2 bg-slate-900">
            <div className="w-5 h-5 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
            <span>Memuat Peta Pilihan Lokasi...</span>
          </div>
        )}
        <div ref={mapRef} className="w-full h-full z-0" />
      </div>

      <p className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
        <Navigation size={12} className="text-emerald-400 shrink-0" />
        <span>Petunjuk: <strong>Klik pada peta</strong> atau <strong>geser pin (marker)</strong> untuk menentukan titik pusat lokasi site proyek Anda.</span>
      </p>
    </div>
  )
}
