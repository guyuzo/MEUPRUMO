import { APP_NAME } from '@/config/app'
import { cn } from '@/lib/utils'

export const TAGLINE = 'Sua vida financeira no prumo'

/**
 * Logo horizontal oficial: a versão para fundo claro e a para fundo escuro trocam
 * sozinhas com o tema (classe .dark), sem piscar.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0', className)}>
      <img src="/brand/logo-light-bg.png" alt={APP_NAME} className="h-full w-auto dark:hidden" />
      <img src="/brand/logo-dark-bg.png" alt={APP_NAME} className="hidden h-full w-auto dark:block" />
    </span>
  )
}
