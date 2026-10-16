import { Dropdown, type DropdownOption } from '@/components/ui/dropdown'
import type { CategoryWithSubs } from '@/hooks/usePlanning'

/**
 * Categoria e subcategoria numa lista só: cada categoria (emoji no círculo da cor dela)
 * seguida das subcategorias recuadas. Escolher uma subcategoria define as duas.
 */
export function CategoryPicker({
  id,
  categories,
  categoryId,
  subcategoryId,
  onChange,
  variant = 'row',
}: {
  id?: string
  categories: CategoryWithSubs[]
  categoryId: string
  subcategoryId: string
  onChange: (categoryId: string, subcategoryId: string) => void
  variant?: 'field' | 'row'
}) {
  const options: DropdownOption[] = [{ value: '', label: 'Sem categoria' }]
  for (const c of categories) {
    options.push({ value: `c:${c.id}`, label: c.name, emoji: c.emoji, color: c.color })
    for (const s of c.subcategories) {
      options.push({
        value: `s:${c.id}:${s.id}`,
        label: s.name,
        indent: true,
        display: `${c.name} · ${s.name}`,
        // Emoji/cor da categoria aparecem no botão quando a subcategoria está escolhida.
        emoji: c.emoji,
        color: c.color,
        keywords: c.name,
      })
    }
  }

  const value = subcategoryId ? `s:${categoryId}:${subcategoryId}` : categoryId ? `c:${categoryId}` : ''

  return (
    <Dropdown
      id={id}
      variant={variant}
      value={value}
      options={options}
      placeholder="Escolher"
      searchable
      onChange={(next) => {
        const [type, cat = '', sub = ''] = next.split(':')
        if (!type) onChange('', '')
        else onChange(cat, type === 's' ? sub : '')
      }}
    />
  )
}
