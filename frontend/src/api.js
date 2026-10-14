const BASE = '/api'

function getCurrentUserId() {
  try {
    const u = JSON.parse(localStorage.getItem('gtm_user'))
    return u?.id ?? null
  } catch {
    return null
  }
}

async function req(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  const userId = getCurrentUserId()
  if (userId) opts.headers['X-User-Id'] = String(userId)
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(`${BASE}${path}`, opts)
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
  return data
}

export const api = {
  get:   (path)       => req('GET',    path),
  post:  (path, body) => req('POST',   path, body),
  patch: (path, body) => req('PATCH',  path, body),
  del:   (path)       => req('DELETE', path),
}
