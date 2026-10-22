import { CATEGORY_ICONS, categoryIcon, subcategoryIconKey } from '@/lib/categoryIcons'
import { cn } from '@/lib/utils'

const SIZES = {
  xs: { box: 'size-5', icon: 'size-3' },
  sm: { box: 'size-7', icon: 'size-3.5' },
  md: { box: 'size-9', icon: 'size-4' },
  lg: { box: 'size-10', icon: 'size-[18px]' },
} as const

/** Ícone de traço fino na cor da categoria, sobre um círculo da mesma cor bem clarinho. */
export function CategoryIcon({
  icon,
  color,
  size = 'md',
  className,
}: {
  /** Valor salvo na categoria (chave do ícone ou emoji antigo). */
  icon: string | null | undefined
  color: string | null | undefined
  size?: keyof typeof SIZES
  className?: string
}) {
  const Icon = categoryIcon(icon)
  const s = SIZES[size]
  return (
    <span
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center rounded-full bg-muted', s.box, className)}
      style={color ? { backgroundColor: `${color}1f`, color } : undefined}
    >
      <Icon className={s.icon} strokeWidth={1.75} />
    </span>
  )
}

/** Subcategoria: ícone próprio, palpite pelo nome ou, sem palpite, o da categoria. */
export function SubcategoryIcon({
  name,
  own,
  categoryIcon: parentIcon,
  color,
  size = 'sm',
}: {
  name: string
  own?: string | null
  categoryIcon: string | null | undefined
  color: string | null | undefined
  size?: keyof typeof SIZES
}) {
  return <CategoryIcon icon={subcategoryIconKey(name, own) ?? parentIcon} color={color} size={size} />
}

/** Grade para escolher o ícone, já pintada na cor escolhida. */
export function CategoryIconPicker({ value, color, onChange }: { value: string; color: string; onChange: (key: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1">
      {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => {
        const selected = categoryIcon(value) === Icon
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            aria-pressed={selected}
            aria-label={key}
            className={cn(
              'flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted',
              selected && 'ring-2 ring-ring',
            )}
            style={selected ? { backgroundColor: `${color}1f`, color } : undefined}
          >
            <Icon className="size-[18px]" strokeWidth={1.75} />
          </button>
        )
      })}
    </div>
  )
}
