import { Check, ChevronDown, Search } from 'lucide-react'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

export interface DropdownOption {
  value: string
  label: string
  /** Emoji mostrado num círculo (ex.: categorias). */
  emoji?: string
  /** Cor do círculo do emoji ou de uma bolinha quando não há emoji. */
  color?: string
  description?: string
  disabled?: boolean
  /** Recuo (ex.: subcategoria abaixo da categoria). */
  indent?: boolean
  /** Texto no botão quando selecionada, se diferente do rótulo (ex.: "Moradia · Aluguel"). */
  display?: string
  /** Termos extras para a busca, não exibidos. */
  keywords?: string
  /** Ícone próprio (ex.: logo do banco), no lugar do emoji/bolinha. Recebe o tamanho de onde aparece. */
  icon?: (size: 'sm' | 'md') => ReactNode
}

const SEARCH_THRESHOLD = 8
const MAX_HEIGHT = 320

// Busca sem acento e sem diferenciar maiúsculas.
const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

function OptionIcon({ option, size = 'md' }: { option: DropdownOption; size?: 'sm' | 'md' }) {
  if (option.icon) return option.icon(size)
  if (option.emoji) {
    return (
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-muted',
          size === 'md' ? 'size-7 text-sm' : 'size-5 text-xs',
        )}
        style={option.color ? { backgroundColor: `${option.color}26` } : undefined}
        aria-hidden
      >
        {option.emoji}
      </span>
    )
  }
  if (option.color) return <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: option.color }} aria-hidden />
  return null
}

/**
 * Lista suspensa do app (substitui o <select> nativo, que ignora o tema escuro).
 * Usa a Popover API: fica na camada superior, inclusive dentro de diálogos, e fecha com Esc
 * ou clique fora. No celular abre como gaveta inferior.
 */
export function Dropdown({
  id,
  value,
  onChange,
  options,
  placeholder = 'Selecione',
  variant = 'field',
  disabled,
  searchable,
  className,
  'aria-label': ariaLabel,
  footer,
}: {
  id?: string
  value: string
  onChange: (value: string) => void
  options: DropdownOption[]
  placeholder?: string
  /** field = caixa com borda; row = texto à direita para usar dentro de FormRow. */
  variant?: 'field' | 'row'
  disabled?: boolean
  searchable?: boolean
  className?: string
  'aria-label'?: string
  /** Conteúdo extra no fim da lista (ex.: "Cadastrar cartão"). */
  footer?: (close: () => void) => ReactNode
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [sheet, setSheet] = useState(false)

  const selected = options.find((o) => o.value === value)
  const withSearch = searchable ?? options.length > SEARCH_THRESHOLD
  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    return q ? options.filter((o) => normalize(`${o.label} ${o.description ?? ''} ${o.keywords ?? ''}`).includes(q)) : options
  }, [options, query])

  const close = () => popRef.current?.hidePopover()

  const position = () => {
    const trigger = triggerRef.current
    const pop = popRef.current
    if (!trigger || !pop) return
    const mobile = window.matchMedia('(max-width: 639px)').matches
    setSheet(mobile)
    if (mobile) {
      Object.assign(pop.style, { left: '0px', right: '0px', top: 'auto', bottom: '0px', width: '100%' })
      return
    }
    const rect = trigger.getBoundingClientRect()
    const width = Math.min(window.innerWidth - 16, Math.max(rect.width, 260))
    // Linha (texto à direita): alinha a lista pela borda direita do gatilho.
    let left = variant === 'row' ? rect.right - width : rect.left
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
    const height = Math.min(pop.scrollHeight, MAX_HEIGHT + (withSearch ? 52 : 0))
    const below = window.innerHeight - rect.bottom - 8
    const top = below >= height || below >= rect.top ? rect.bottom + 4 : Math.max(8, rect.top - height - 4)
    Object.assign(pop.style, { left: `${left}px`, top: `${top}px`, right: 'auto', bottom: 'auto', width: `${width}px` })
  }

  // Abre/fecha acompanhando o evento nativo do popover (Esc e clique fora fecham sozinhos).
  useEffect(() => {
    const pop = popRef.current
    if (!pop) return
    const onToggle = (e: Event) => {
      const isOpen = (e as ToggleEvent).newState === 'open'
      setOpen(isOpen)
      if (!isOpen) {
        setQuery('')
        triggerRef.current?.focus({ preventScroll: true })
      }
    }
    pop.addEventListener('toggle', onToggle)
    return () => pop.removeEventListener('toggle', onToggle)
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    position()
    ;(withSearch ? searchRef.current : listRef.current)?.focus({ preventScroll: true })
    const reposition = () => position()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filtered.length])

  // Mantém o item ativo visível ao navegar com o teclado.
  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active, open])

  const openList = () => {
    if (disabled) return
    const index = options.findIndex((o) => o.value === value)
    setActive(Math.max(0, index))
    popRef.current?.showPopover()
  }

  const choose = (option: DropdownOption) => {
    if (option.disabled) return
    onChange(option.value)
    close()
  }

  const move = (delta: number) => {
    if (!filtered.length) return
    let next = active
    for (let i = 0; i < filtered.length; i++) {
      next = (next + delta + filtered.length) % filtered.length
      if (!filtered[next].disabled) break
    }
    setActive(next)
  }

  const onListKeyDown = (e: KeyboardEvent) => {
    const actions: Record<string, () => void> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      Home: () => setActive(0),
      End: () => setActive(filtered.length - 1),
      Enter: () => filtered[active] && choose(filtered[active]),
    }
    if (actions[e.key]) {
      e.preventDefault()
      actions[e.key]()
    } else if (e.key === 'Tab') close()
  }

  const activeId = filtered[active] ? `${listId}-${active}` : undefined

  return (
    <div className={cn('relative min-w-0', variant === 'field' && 'w-full', className)}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={openList}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            openList()
          }
        }}
        className={cn(
          'flex items-center gap-2 text-sm focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
          variant === 'field'
            ? 'h-10 w-full rounded-md border border-input bg-card px-3 text-left focus-visible:ring-2 focus-visible:ring-ring'
            : 'ml-auto min-h-10 max-w-full rounded-md py-1 pl-2 pr-1 text-right font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {selected && <OptionIcon option={selected} size="sm" />}
        <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-muted-foreground')}>
          {selected ? (selected.display ?? selected.label) : placeholder}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      <div
        ref={popRef}
        popover="auto"
        onKeyDown={onListKeyDown}
        className={cn(
          'm-0 overflow-hidden border border-border bg-card p-0 text-foreground shadow-xl',
          sheet ? 'max-h-[70vh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]' : 'rounded-xl',
        )}
      >
        {sheet && <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />}
        {withSearch && (
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              placeholder="Buscar…"
              aria-label="Buscar opção"
              aria-controls={listId}
              aria-activedescendant={activeId}
              className="h-11 w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
            />
          </div>
        )}
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={withSearch ? undefined : activeId}
          className={cn('overflow-y-auto p-1 focus:outline-none', sheet ? 'max-h-[60vh]' : '')}
          style={sheet ? undefined : { maxHeight: MAX_HEIGHT }}
        >
          {open && filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nada encontrado</li>}
          {/* Itens só montados com a lista aberta: telas com muitos dropdowns (ex.: importação) ficam leves. */}
          {open && filtered.map((option, index) => {
            const isSelected = option.value === value
            return (
              <li
                key={option.value || `empty-${index}`}
                id={`${listId}-${index}`}
                data-index={index}
                role="option"
                aria-selected={isSelected}
                aria-disabled={option.disabled}
                onMouseMove={() => active !== index && setActive(index)}
                onClick={() => choose(option)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm',
                  option.indent && 'pl-[3.25rem]',
                  index === active && 'bg-muted',
                  isSelected && 'font-medium',
                  option.disabled && 'cursor-not-allowed opacity-50',
                )}
              >
                {/* Itens recuados (subcategorias) ficam só com o texto: o ícone já está no grupo acima. */}
                {!option.indent && <OptionIcon option={option} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{option.label}</span>
                  {option.description && <span className="block truncate text-xs text-muted-foreground">{option.description}</span>}
                </span>
                {isSelected && <Check className="size-4 shrink-0 text-primary" />}
              </li>
            )
          })}
        </ul>
        {footer && <div className="border-t border-border p-1">{footer(close)}</div>}
      </div>
    </div>
  )
}
