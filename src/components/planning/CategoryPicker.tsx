import { CategoryIcon, SubcategoryIcon } from '@/components/planning/CategoryIcon'
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown'
import type { CategoryWithSubs } from '@/hooks/usePlanning'

/**
 * Categoria e subcategoria numa lista só: cada categoria (ícone na cor dela)
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
  const options: DropdownOption[] = [
    { value: '', label: 'Sem categoria', icon: (size) => <CategoryIcon icon="tag" color={null} size={size === 'md' ? 'sm' : 'xs'} /> },
  ]
  for (const c of categories) {
    options.push({
      value: `c:${c.id}`,
      label: c.name,
      color: c.color,
      icon: (size) => <CategoryIcon icon={c.emoji} color={c.color} size={size === 'md' ? 'sm' : 'xs'} />,
    })
    for (const s of c.subcategories) {
      options.push({
        value: `s:${c.id}:${s.id}`,
        label: s.name,
        indent: true,
        display: `${c.name} · ${s.name}`,
        color: c.color,
        keywords: c.name,
        icon: (size) => (
          <SubcategoryIcon name={s.name} own={s.emoji} categoryIcon={c.emoji} color={c.color} size={size === 'md' ? 'sm' : 'xs'} />
        ),
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
