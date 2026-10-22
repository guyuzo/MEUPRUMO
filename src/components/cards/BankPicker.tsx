import { BankLogo } from '@/components/cards/BankLogo'
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown'
import { Input } from '@/components/ui/input'
import { BANKS, findBank, type Bank } from '@/lib/banks'

const OTHER = '__other'
const BANK_OPTIONS: DropdownOption[] = [
  ...BANKS.map((b) => ({
    value: b.slug,
    label: b.name,
    keywords: b.aliases?.join(' '),
    icon: (size: 'sm' | 'md') => <BankLogo bank={b.name} size={size} />,
  })),
  { value: OTHER, label: 'Outro banco', description: 'Digitar o nome' },
]

/**
 * Escolha do banco com logo; "Outro banco" abre um campo de texto.
 * `otherBank` fica com quem chama, para o campo de texto continuar aberto enquanto se digita.
 */
export function BankPicker({
  id,
  value,
  otherBank,
  onPick,
  onOther,
  otherInputProps,
}: {
  id: string
  /** Nome do banco salvo no formulário. */
  value: string
  otherBank: boolean
  onPick: (bank: Bank) => void
  onOther: () => void
  /** Props do campo de texto do "Outro banco" (ex.: form.register('bank')). */
  otherInputProps: React.ComponentProps<typeof Input>
}) {
  return (
    <>
      <Dropdown
        id={id}
        value={otherBank ? OTHER : (findBank(value)?.slug ?? '')}
        onChange={(v) => {
          if (v === OTHER) return onOther()
          const picked = BANKS.find((b) => b.slug === v)
          if (picked) onPick(picked)
        }}
        options={BANK_OPTIONS}
        placeholder="Escolha o banco"
        searchable
      />
      {otherBank && (
        <Input id={`${id}-other`} aria-label="Nome do banco" placeholder="Nome do banco" className="mt-2" {...otherInputProps} />
      )}
    </>
  )
}
