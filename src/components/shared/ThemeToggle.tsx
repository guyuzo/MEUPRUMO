import { Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { setThemePreference } from '@/lib/theme'

/** Alterna claro/escuro na hora (a opção "igual ao sistema" fica em Configurações). */
export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  return (
    <button
      type="button"
      onClick={() => {
        setThemePreference(dark ? 'light' : 'dark')
        setDark(!dark)
      }}
      aria-label={dark ? 'Usar tema claro' : 'Usar tema escuro'}
      title={dark ? 'Tema claro' : 'Tema escuro'}
      className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}
