import { useSyncExternalStore } from 'react'

// Evento do Chrome/Edge/Samsung Internet que permite abrir o pedido de instalação pelo próprio app.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((fn) => fn())

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

// iPhone/iPad: o Safari não tem botão de instalar; é pelo "Compartilhar → Adicionar à Tela de Início".
export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export function initPWA() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferred = event as BeforeInstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
  // Em dev o service worker atrapalharia o recarregamento do Vite.
  if (import.meta.env.PROD && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Sem service worker o app funciona igual, só não fica instalável em alguns navegadores.
      })
    })
  }
}

/** Abre o pedido de instalação do navegador. Retorna true se a pessoa aceitou. */
export async function promptInstall() {
  if (!deferred) return false
  const event = deferred
  deferred = null
  notify()
  await event.prompt()
  return (await event.userChoice).outcome === 'accepted'
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** "prompt": dá para instalar com um clique; "ios": mostrar instruções; null: já instalado ou sem suporte. */
export function useInstallMode(): 'prompt' | 'ios' | null {
  const canPrompt = useSyncExternalStore(subscribe, () => deferred !== null)
  if (isStandalone()) return null
  if (canPrompt) return 'prompt'
  if (isIOS()) return 'ios'
  return null
}
