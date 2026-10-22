import { APP_NAME } from '@/config/app'
import { cn } from '@/lib/utils'

export const TAGLINE = 'Sua vida financeira no prumo'

/**
 * Logo horizontal oficial.
 * - `auto`: versão para fundo claro ou escuro conforme o tema (classe .dark).
 * - `onDark`: sempre a versão para fundo escuro (ex.: menu lateral verde).
 */
export function Logo({ className, tone = 'auto' }: { className?: string; tone?: 'auto' | 'onDark' }) {
  if (tone === 'onDark') {
    return (
      <span className={cn('inline-flex shrink-0', className)}>
        <img src="/brand/logo-dark-bg.png" alt={APP_NAME} className="h-full w-auto" />
      </span>
    )
  }
  return (
    <span className={cn('inline-flex shrink-0', className)}>
      <img src="/brand/logo-light-bg.png" alt={APP_NAME} className="h-full w-auto dark:hidden" />
      <img src="/brand/logo-dark-bg.png" alt={APP_NAME} className="hidden h-full w-auto dark:block" />
    </span>
  )
}
