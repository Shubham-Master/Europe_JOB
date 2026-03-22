import React, { useEffect, useMemo, useRef, useState } from 'react'
import { SCENES } from '../lib/scenes'
import './ScenicBackdrop.css'

const sceneSourceCache = new Map()

function ScenicBackdrop({ sceneKey }) {
  const fallbackScene = SCENES.europe
  const nextScene = useMemo(() => SCENES[sceneKey] || fallbackScene, [sceneKey])
  const [activeScene, setActiveScene] = useState({
    ...nextScene,
    resolvedSrc: nextScene.sources?.[0] || nextScene.image || '',
  })
  const [incomingScene, setIncomingScene] = useState(null)
  const [incomingVisible, setIncomingVisible] = useState(false)
  const timeoutRef = useRef(null)

  useEffect(() => {
    let cancelled = false

    resolveSceneSource(nextScene).then((resolvedSrc) => {
      if (cancelled) return

      if (activeScene.resolvedSrc === resolvedSrc) return

      const resolvedScene = { ...nextScene, resolvedSrc }
      setIncomingScene(resolvedScene)
      requestAnimationFrame(() => setIncomingVisible(true))
      timeoutRef.current = window.setTimeout(() => {
        setActiveScene(resolvedScene)
        setIncomingScene(null)
        setIncomingVisible(false)
      }, 820)
    })

    return () => {
      cancelled = true
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [activeScene.resolvedSrc, nextScene])

  return (
    <div className="scenic-backdrop" aria-hidden="true">
      <SceneLayer scene={activeScene} className="is-active" />
      {incomingScene && (
        <SceneLayer
          scene={incomingScene}
          className={incomingVisible ? 'is-incoming is-visible' : 'is-incoming'}
        />
      )}
      <div className="scenic-grid" />
      <div className="scenic-orb scenic-orb-left" />
      <div className="scenic-orb scenic-orb-right" />
    </div>
  )
}

function SceneLayer({ scene, className }) {
  return (
    <div
      className={`scenic-scene-layer ${className || ''}`}
      style={{
        '--scene-tint': scene.colors.tint,
        '--scene-tint-strong': scene.colors.tintStrong,
        '--scene-glow-a': scene.colors.glowA,
        '--scene-glow-b': scene.colors.glowB,
        '--scene-image': `url("${scene.resolvedSrc}")`,
        '--scene-position': scene.position || 'center center',
      }}
    />
  )
}

function resolveSceneSource(scene) {
  const sources = scene.sources?.length ? scene.sources : [scene.image]
  const cacheKey = sources.join('|')

  if (sceneSourceCache.has(cacheKey)) {
    return sceneSourceCache.get(cacheKey)
  }

  const pending = new Promise((resolve) => {
    const tryIndex = (index) => {
      const src = sources[index]
      if (!src) {
        resolve('')
        return
      }

      const image = new Image()
      image.onload = () => resolve(src)
      image.onerror = () => {
        if (index === sources.length - 1) {
          resolve(src)
          return
        }
        tryIndex(index + 1)
      }
      image.src = src
    }

    tryIndex(0)
  })

  sceneSourceCache.set(cacheKey, pending)
  return pending
}

export default React.memo(ScenicBackdrop)
