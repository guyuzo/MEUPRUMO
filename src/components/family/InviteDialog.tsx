import { Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { PermissionMatrix } from '@/components/family/PermissionMatrix'
import { Field } from '@/components/shared/layout'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FieldError, Input } from '@/components/ui/input'
import { FULL_EDIT, FULL_VIEW, inviteLink, useFamilyMutations } from '@/hooks/useFamily'
import { cn } from '@/lib/utils'
import type { PermissionFlags } from '@/types/database'

const PRESETS = [
  ['view', 'Só ver', 'Acompanha tudo, sem alterar nada.'],
  ['edit', 'Ver e editar', 'Pode lançar e alterar em todos os módulos.'],
  ['custom', 'Personalizar', 'Escolha módulo por módulo.'],
] as const

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success('Link copiado.')
  } catch {
    toast.error('Não foi possível copiar. Selecione e copie manualmente.')
  }
}

/** Montar condicionalmente para reiniciar a cada abertura. */
export function InviteDialog({ onClose }: { onClose: () => void }) {
  const { createInvite } = useFamilyMutations()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [preset, setPreset] = useState<(typeof PRESETS)[number][0]>('view')
  const [flags, setFlags] = useState<PermissionFlags>(FULL_VIEW)
  const [error, setError] = useState<string>()
  const [link, setLink] = useState<string>()

  const choose = (p: typeof preset) => {
    setPreset(p)
    if (p === 'view') setFlags(FULL_VIEW)
    if (p === 'edit') setFlags(FULL_EDIT)
  }

  const submit = async () => {
    if (!name.trim()) return setError('Informe o nome de quem você vai convidar')
    const token = await createInvite.mutateAsync({ full_name: name.trim(), email: email.trim() || null, ...flags })
    setLink(inviteLink(token))
  }

  if (link) {
    return (
      <Dialog open onClose={onClose} title="Convite criado" description="Envie este link para a pessoa (WhatsApp, e-mail…). Ele vale por 7 dias e só pode ser usado uma vez.">
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link do convite" />
            <Button variant="outline" size="icon" aria-label="Copiar link" onClick={() => copyText(link)}>
              <Copy />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Quem tiver o link entra na sua casa: não publique em lugares abertos.</p>
          <div className="flex justify-end">
            <Button onClick={onClose}>
              <Check /> Pronto
            </Button>
          </div>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog open onClose={onClose} title="Convidar para a casa" className="max-w-lg">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome" htmlFor="inv-name">
            <Input id="inv-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Ex.: João" />
          </Field>
          <Field label="E-mail (opcional)" htmlFor="inv-email">
            <Input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Só para sua referência" />
          </Field>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">O que a pessoa poderá fazer</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {PRESETS.map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                onClick={() => choose(value)}
                aria-pressed={preset === value}
                className={cn(
                  'rounded-md border p-3 text-left',
                  preset === value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted',
                )}
              >
                <span className="block text-sm font-medium">{label}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </button>
            ))}
          </div>
        </div>
        {preset === 'custom' && <PermissionMatrix value={flags} onChange={(patch) => setFlags((f) => ({ ...f, ...patch }))} />}
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={createInvite.isPending}>
            Gerar link de convite
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
