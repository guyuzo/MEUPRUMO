import { useState } from 'react'
import { Field } from '@/components/shared/layout'
import { ColorPicker } from '@/components/shared/pickers'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { FieldError, Input } from '@/components/ui/input'
import { useAvatarMutations } from '@/hooks/useAvatars'
import { useFamilyMutations } from '@/hooks/useFamily'
import type { HouseholdMember } from '@/types/database'

/** Pessoa da casa (pode não ter acesso ao app, ex.: um filho). Montar condicionalmente. */
export function MemberFormDialog({
  member,
  nextOrder,
  onClose,
}: {
  member?: HouseholdMember
  nextOrder: number
  onClose: () => void
}) {
  const { saveMember } = useFamilyMutations()
  const { remove: removeAvatar } = useAvatarMutations()
  const [name, setName] = useState(member?.full_name ?? '')
  const [relationship, setRelationship] = useState(member?.relationship ?? '')
  const [color, setColor] = useState(member?.color ?? '#6366f1')
  const [error, setError] = useState<string>()

  const submit = async () => {
    if (!name.trim()) return setError('Informe o nome')
    await saveMember.mutateAsync({
      id: member?.id,
      full_name: name.trim(),
      relationship: relationship.trim() || null,
      color,
      ...(member ? {} : { sort_order: nextOrder }),
    })
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title={member ? 'Editar pessoa' : 'Adicionar pessoa'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nome" htmlFor="mem-name">
            <Input id="mem-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Parentesco" htmlFor="mem-rel">
            <Input id="mem-rel" value={relationship} maxLength={40} onChange={(e) => setRelationship(e.target.value)} placeholder="Ex.: Filho" />
          </Field>
        </div>
        <Field label="Cor">
          <ColorPicker value={color} onChange={setColor} />
        </Field>
        <FieldError message={error} />
        <div className="flex justify-end gap-2">
          {member?.avatar_path && (
            <Button
              variant="ghost"
              className="mr-auto"
              disabled={removeAvatar.isPending}
              onClick={() => removeAvatar.mutate(member, { onSuccess: onClose })}
            >
              Remover foto
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saveMember.isPending}>
            Salvar
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
