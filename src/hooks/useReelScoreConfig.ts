import { useCallback, useEffect, useState } from 'react'
import {
  CONFIG_STORAGE_KEY,
  DEFAULT_CONFIG,
  type ReelScoreConfig,
} from '../types/reelScore'

function loadConfig(): ReelScoreConfig {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CONFIG }
    const cfg = JSON.parse(raw) as Partial<ReelScoreConfig>
    return {
      ...DEFAULT_CONFIG,
      ...cfg,
      services: cfg.services?.length ? cfg.services : DEFAULT_CONFIG.services,
    }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function useReelScoreConfig() {
  const [config, setConfig] = useState<ReelScoreConfig>(loadConfig)
  const [panelOpen, setPanelOpen] = useState(false)

  useEffect(() => {
    setConfig(loadConfig())
  }, [])

  const saveConfig = useCallback((next: ReelScoreConfig) => {
    setConfig(next)
    try {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* storage full or private mode */
    }
  }, [])

  const patchConfig = useCallback(
    (patch: Partial<ReelScoreConfig>) => {
      setConfig((prev) => {
        const next = { ...prev, ...patch }
        try {
          localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(next))
        } catch {
          /* ignore */
        }
        return next
      })
    },
    [],
  )

  return { config, saveConfig, patchConfig, panelOpen, setPanelOpen }
}
