const CACHE_NAME = 'siwajah-v5'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo-pp-icon.png',
]

self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => caches.delete(key))
      )
    }).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)

  // Always use network first for HTML and JS scripts to avoid stale cache
  if (url.origin.includes('supabase.co') || url.pathname.startsWith('/api/') || url.pathname.endsWith('.js') || url.pathname.endsWith('.html') || url.pathname === '/') {
    return
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        return networkResponse
      })
      .catch(async () => {
        const cachedResponse = await caches.match(event.request)
        if (cachedResponse) return cachedResponse
      })
  )
})
