import { useEffect } from 'react'

export function useSSE(onEvent) {
  useEffect(() => {
    const es = new EventSource('/api/events')
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.type !== 'connected') onEvent(data)
      } catch {}
    }
    return () => es.close()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
