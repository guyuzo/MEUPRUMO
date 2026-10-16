// Tema por dispositivo (preferência local, não precisa ir ao banco).
export type ThemePreference = 'light' | 'dark' | 'system'

const KEY = 'ff.theme'
const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export function getThemePreference(): ThemePreference {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

function apply(pref: ThemePreference) {
  const dark = pref === 'dark' || (pref === 'system' && media().matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

export function setThemePreference(pref: ThemePreference) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    // Sem storage: vale só para esta sessão.
  }
  apply(pref)
}

/** Chamar uma vez na inicialização; acompanha a troca de tema do sistema. */
export function initTheme() {
  apply(getThemePreference())
  media().addEventListener('change', () => {
    if (getThemePreference() === 'system') apply('system')
  })
}
