import { useEffect, useState } from 'react'

const STORAGE_KEY = 'wpt_device_id'

function generateId(): string {
  return crypto.randomUUID()
}

export function useDeviceId(): string {
  const [deviceId] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) return stored
      const fresh = generateId()
      localStorage.setItem(STORAGE_KEY, fresh)
      return fresh
    } catch {
      // localStorage unavailable (private mode, strict MDM)
      return generateId()
    }
  })

  return deviceId
}
