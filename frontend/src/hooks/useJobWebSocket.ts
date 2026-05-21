import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

export interface ZipProgress {
  pct: number
  downloaded: number
  total: number
}

/**
 * Opens a WebSocket to /api/ws and invalidates React Query caches when
 * the server broadcasts job update events.
 *
 * Also tracks per-repo ZIP download progress from `zip_progress` events.
 * If the connection drops, it automatically reconnects after 3 seconds.
 */
export function useJobWebSocket() {
  const qc = useQueryClient()
  const wsRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unmountedRef = useRef(false)
  const [isConnected, setIsConnected] = useState(false)
  const [zipProgress, setZipProgress] = useState<Record<number, ZipProgress>>({})

  const clearZipProgress = useCallback((repoId: number) => {
    setZipProgress(prev => { const n = { ...prev }; delete n[repoId]; return n })
  }, [])

  useEffect(() => {
    unmountedRef.current = false

    function connect() {
      if (unmountedRef.current) return

      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(`${proto}//${location.host}/api/ws`)
      wsRef.current = socket

      socket.onopen = () => setIsConnected(true)

      socket.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { type: string; [k: string]: unknown }
          switch (msg.type) {
            case 'clone_job_update':
              qc.invalidateQueries({ queryKey: ['clone-jobs'] })
              break
            case 'zip_job_update':
              qc.invalidateQueries({ queryKey: ['repositories'] })
              qc.invalidateQueries({ queryKey: ['import-jobs'] })
              // Clear progress bar when job finishes
              if (msg.status === 'done' || msg.status === 'failed') {
                setZipProgress(prev => { const n = { ...prev }; delete n[msg.repo_id as number]; return n })
              }
              break
            case 'zip_progress':
              setZipProgress(prev => ({
                ...prev,
                [msg.repo_id as number]: {
                  pct: msg.pct as number,
                  downloaded: msg.downloaded as number,
                  total: msg.total as number,
                },
              }))
              break
            case 'import_job_update':
              qc.invalidateQueries({ queryKey: ['import-jobs'] })
              break
          }
        } catch { /* ignore malformed frames */ }
      }

      socket.onclose = () => {
        setIsConnected(false)
        if (!unmountedRef.current) {
          timerRef.current = setTimeout(connect, 3000)
        }
      }
    }

    connect()

    return () => {
      unmountedRef.current = true
      if (timerRef.current) clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [qc])

  return { isConnected, zipProgress, clearZipProgress }
}
