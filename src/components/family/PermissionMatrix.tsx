import { Checkbox } from '@/components/ui/checkbox'
import { MODULES, type Module, type PermissionFlags } from '@/types/database'

export const MODULE_LABEL: Record<Module, string> = {
  planning: 'Planejamento',
  transactions: 'Transações, contas e cartões',
  debts: 'Dívidas',
  goals: 'Metas',
  investments: 'Investimentos',
  wishlist: 'Lista de desejos',
}

/** Tabela módulo × (ver, editar). Editar implica ver; tirar o ver tira o editar. */
export function PermissionMatrix({
  value,
  onChange,
  disabled,
}: {
  value: PermissionFlags
  onChange: (patch: Partial<PermissionFlags>) => void
  disabled?: boolean
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th className="py-1.5 font-medium">Módulo</th>
          <th className="w-16 py-1.5 text-center font-medium">Ver</th>
          <th className="w-16 py-1.5 text-center font-medium">Editar</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {/* Investimentos saiu do app; a permissão continua no banco, só não aparece. */}
        {MODULES.filter((m) => m !== 'investments').map((m) => (
          <tr key={m}>
            <td className="py-2">{MODULE_LABEL[m]}</td>
            <td className="text-center">
              <Checkbox
                aria-label={`Ver ${MODULE_LABEL[m]}`}
                disabled={disabled}
                checked={value[`can_view_${m}`]}
                onChange={(e) =>
                  onChange(e.target.checked ? { [`can_view_${m}`]: true } : { [`can_view_${m}`]: false, [`can_edit_${m}`]: false })
                }
              />
            </td>
            <td className="text-center">
              <Checkbox
                aria-label={`Editar ${MODULE_LABEL[m]}`}
                disabled={disabled}
                checked={value[`can_edit_${m}`]}
                onChange={(e) =>
                  onChange(e.target.checked ? { [`can_edit_${m}`]: true, [`can_view_${m}`]: true } : { [`can_edit_${m}`]: false })
                }
              />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
