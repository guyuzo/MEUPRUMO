import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

// min-w-0: em grid/flex o cartão pode encolher abaixo do texto mais longo (que então é
// truncado com "…"); sem isso, nomes compridos empurram a página para fora da tela no celular.
export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-w-0 rounded-lg border border-border bg-card p-5 shadow-sm', className)} {...props} />
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-sm font-medium text-muted-foreground', className)} {...props} />
}
