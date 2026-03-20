export const SCENES = {
  europe: {
    sources: [
      '/backgrounds/default.webp',
      'https://commons.wikimedia.org/wiki/Special:FilePath/London%20Skyline%20at%20Night.jpg',
    ],
    position: 'center center',
    colors: {
      tint: 'rgba(4, 11, 18, 0.56)',
      tintStrong: 'rgba(5, 10, 18, 0.76)',
      glowA: 'rgba(0, 238, 221, 0.16)',
      glowB: 'rgba(204, 0, 238, 0.12)',
    },
  },
  netherlands: {
    sources: [
      '/backgrounds/netherlands.webp',
      'https://commons.wikimedia.org/wiki/Special:FilePath/Amsterdam%20Canal%20at%20Night.JPG',
    ],
    position: 'center center',
    colors: {
      tint: 'rgba(5, 14, 24, 0.52)',
      tintStrong: 'rgba(5, 15, 26, 0.74)',
      glowA: 'rgba(0, 238, 221, 0.18)',
      glowB: 'rgba(86, 155, 255, 0.12)',
    },
  },
  switzerland: {
    sources: [
      '/backgrounds/switzerland.webp',
      'https://commons.wikimedia.org/wiki/Special:FilePath/Swiss%20Alps,%20View%20from%20Pilatus.jpg',
    ],
    position: 'center center',
    colors: {
      tint: 'rgba(3, 13, 18, 0.46)',
      tintStrong: 'rgba(3, 12, 19, 0.7)',
      glowA: 'rgba(0, 238, 221, 0.14)',
      glowB: 'rgba(220, 244, 255, 0.12)',
    },
  },
  germany: {
    sources: [
      '/backgrounds/germany.webp',
      'https://commons.wikimedia.org/wiki/Special:FilePath/Frankfurt%20skyline%20night.jpg',
    ],
    position: 'center center',
    colors: {
      tint: 'rgba(5, 11, 20, 0.52)',
      tintStrong: 'rgba(6, 11, 21, 0.76)',
      glowA: 'rgba(0, 238, 221, 0.14)',
      glowB: 'rgba(204, 0, 238, 0.14)',
    },
  },
  sweden: {
    sources: [
      '/backgrounds/sweden.webp',
      'https://commons.wikimedia.org/wiki/Special:FilePath/Aurora%20in%20Abisko%20near%20Tornetr%C3%A4sk.jpg',
    ],
    position: 'center center',
    colors: {
      tint: 'rgba(2, 10, 18, 0.48)',
      tintStrong: 'rgba(2, 10, 18, 0.72)',
      glowA: 'rgba(107, 255, 199, 0.16)',
      glowB: 'rgba(160, 110, 255, 0.16)',
    },
  },
}

export function sceneForCountry(country) {
  const value = (country || '').trim().toLowerCase()

  if (!value || value === 'all') return 'europe'
  if (value.includes('netherlands') || value.includes('amsterdam')) return 'netherlands'
  if (value.includes('switzerland') || value.includes('zurich') || value.includes('geneva')) return 'switzerland'
  if (value.includes('germany') || value.includes('berlin') || value.includes('frankfurt')) return 'germany'
  if (value.includes('sweden') || value.includes('stockholm')) return 'sweden'

  return 'europe'
}

export function sceneForPath() {
  return 'europe'
}
