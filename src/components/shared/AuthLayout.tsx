import type { ReactNode } from 'react'
import { Wallet } from 'lucide-react'
import { APP_NAME } from '@/config/app'

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2 text-primary">
          <Wallet className="size-6" />
          <span className="text-lg font-semibold text-foreground">{APP_NAME}</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  )
}
