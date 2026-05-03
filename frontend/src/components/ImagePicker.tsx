import { useEffect, useState } from 'react'
import { publicApi } from '../lib/api'
import type { ImagePreset } from '../types'

interface Props {
  value: string
  onChange: (id: string) => void
}

export function ImagePicker({ value, onChange }: Props) {
  const [presets, setPresets] = useState<ImagePreset[]>([])
  const [category, setCategory] = useState<string>('All')

  useEffect(() => {
    publicApi.imagePresets().then(setPresets).catch(() => {})
  }, [])

  const categories = ['All', ...Array.from(new Set(presets.map(p => p.category)))]
  const filtered = category === 'All' ? presets : presets.filter(p => p.category === category)

  return (
    <div>
      <div className="flex gap-2 mb-3 flex-wrap">
        {categories.map(cat => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              category === cat
                ? 'bg-ocean-400 text-ocean-900'
                : 'bg-ocean-700 text-ocean-200 hover:bg-ocean-600'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-2 max-h-52 overflow-y-auto pr-1">
        {filtered.map(preset => (
          <button
            key={preset.id}
            type="button"
            title={preset.display_name}
            onClick={() => onChange(preset.id)}
            className={`aspect-square rounded-xl flex items-center justify-center text-3xl
              transition-all hover:scale-110 ${
                value === preset.id
                  ? 'ring-2 ring-ocean-400 bg-ocean-600 scale-105'
                  : 'bg-ocean-700 hover:bg-ocean-600'
              }`}
          >
            {preset.emoji}
          </button>
        ))}
      </div>
    </div>
  )
}

interface EmojiDisplayProps {
  imageId: string
  presets?: ImagePreset[]
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeMap = { sm: 'text-2xl', md: 'text-4xl', lg: 'text-6xl', xl: 'text-8xl' }

export function TeamEmoji({ imageId, presets, size = 'md' }: EmojiDisplayProps) {
  const [allPresets, setAllPresets] = useState<ImagePreset[]>(presets || [])

  useEffect(() => {
    if (!presets) {
      publicApi.imagePresets().then(setAllPresets).catch(() => {})
    }
  }, [presets])

  const preset = allPresets.find(p => p.id === imageId)
  const emoji = preset?.emoji ?? '🐋'

  return (
    <span className={`${sizeMap[size]} leading-none select-none`} role="img" aria-label={preset?.display_name}>
      {emoji}
    </span>
  )
}
