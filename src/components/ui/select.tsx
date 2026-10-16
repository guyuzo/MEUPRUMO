import {
  Children,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type Ref,
  type SelectHTMLAttributes,
} from 'react'
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown'

type OptionProps = {
  value?: string | number
  children?: ReactNode
  disabled?: boolean
  'data-color'?: string
  'data-description'?: string
}

// "🏠 Moradia" → emoji separado do texto, para mostrar o emoji num círculo.
const LEADING_EMOJI = /^(\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*)\s+(.+)$/u

function textOf(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children)
  return ''
}

/** Lê os <option> (inclusive dentro de fragments/arrays) como opções do Dropdown. */
function optionsFrom(children: ReactNode): DropdownOption[] {
  const out: DropdownOption[] = []
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    if (child.type === Fragment) {
      out.push(...optionsFrom((child as ReactElement<{ children?: ReactNode }>).props.children))
      return
    }
    if (child.type !== 'option') return
    const props = child.props as OptionProps
    const text = textOf(props.children).trim()
    const match = text.match(LEADING_EMOJI)
    out.push({
      value: String(props.value ?? text),
      label: match ? match[2] : text,
      emoji: match?.[1],
      color: props['data-color'],
      description: props['data-description'],
      disabled: props.disabled,
    })
  })
  return out
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  ref?: Ref<HTMLSelectElement>
  variant?: 'field' | 'row'
  searchable?: boolean
  placeholder?: string
}

/**
 * Mesmo uso de um <select> (children <option>, value/onChange ou {...register()}), mas com a
 * lista do app. Um <select> escondido guarda o valor para o react-hook-form e formulários.
 */
export function Select({
  children,
  className,
  variant = 'field',
  searchable,
  placeholder,
  value,
  defaultValue,
  id,
  disabled,
  ref,
  'aria-label': ariaLabel,
  ...nativeProps
}: SelectProps) {
  const nativeRef = useRef<HTMLSelectElement | null>(null)
  const controlled = value !== undefined
  const [uncontrolled, setUncontrolled] = useState(String(defaultValue ?? ''))
  const current = controlled ? String(value) : uncontrolled

  const setRefs = useCallback(
    (el: HTMLSelectElement | null) => {
      nativeRef.current = el
      if (typeof ref === 'function') ref(el)
      else if (ref) (ref as { current: HTMLSelectElement | null }).current = el
    },
    [ref],
  )

  // Formulários (react-hook-form) mudam o valor direto no <select> escondido, sem avisar o React.
  // Sincroniza após cada render; o `if` garante que só atualiza quando mudou (sem loop).
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = nativeRef.current
    if (!controlled && el && el.value !== uncontrolled) setUncontrolled(el.value)
  })

  const pick = (next: string) => {
    const el = nativeRef.current
    if (el) {
      el.value = next
      // Dispara o onChange do React/react-hook-form como se fosse o select nativo.
      el.dispatchEvent(new Event('change', { bubbles: true }))
    }
    if (!controlled) setUncontrolled(next)
  }

  return (
    <>
      <select
        {...nativeProps}
        ref={setRefs}
        value={controlled ? value : undefined}
        defaultValue={controlled ? undefined : defaultValue}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden
        className="sr-only"
      >
        {children}
      </select>
      <Dropdown
        id={id}
        aria-label={ariaLabel}
        value={current}
        onChange={pick}
        options={optionsFrom(children)}
        variant={variant}
        searchable={searchable}
        placeholder={placeholder}
        disabled={disabled}
        className={className}
      />
    </>
  )
}
