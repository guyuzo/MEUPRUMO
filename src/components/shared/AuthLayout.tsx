import type { ReactNode } from 'react'
import { Logo, TAGLINE } from '@/components/shared/Logo'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <Logo className="h-14" />
          <p className="mt-3 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{TAGLINE}</p>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  )
}
