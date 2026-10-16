import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { format, parseISO } from 'date-fns'
import { ChevronDown, Copy, LogOut, Pencil, Plus, Trash2, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { AvatarUpload } from '@/components/family/Avatar'
import { copyText, InviteDialog } from '@/components/family/InviteDialog'
import { MemberFormDialog } from '@/components/family/MemberFormDialog'
import { PermissionMatrix } from '@/components/family/PermissionMatrix'
import { PageHeader } from '@/components/shared/layout'
import { MonthPicker } from '@/components/shared/pickers'
import { Button } from '@/components/ui/button'
import { Card, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  inviteLink,
  pickFlags,
  useAccessList,
  useFamilyMutations,
  useInvites,
  useMembers,
  useSplits,
  type AccessEntry,
} from '@/hooks/useFamily'
import { useAvatarUrls } from '@/hooks/useAvatars'
import { householdQuery, useHousehold, usePermission } from '@/hooks/useHousehold'
import { useTransactions } from '@/hooks/useTransactions'
import { currentMonthKey } from '@/lib/dates'
import { spendingByMember } from '@/lib/finance/members'
import { formatCents } from '@/lib/money'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import type { HouseholdMember } from '@/types/database'

export const Route = createFileRoute('/_authenticated/members')({ component: MembersPage })

function MembersPage() {
  const { current, userId } = useHousehold()
  const isOwner = current.permission.role === 'owner'
  const [inviteOpen, setInviteOpen] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const { leave } = useFamilyMutations()

  return (
    <div className="space-y-8">
      <PageHeader
        title="Família"
        subtitle="Quem faz parte da casa, quem acessa o app e quanto cada um gastou."
        actions={
          isOwner ? (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus /> Convidar
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setConfirmLeave(true)}>
              <LogOut /> Sair desta casa
            </Button>
          )
        }
      />

      {isOwner && <HouseholdName />}
      <PeopleSection isOwner={isOwner} />
      <AccessSection isOwner={isOwner} userId={userId} />
      {isOwner && <InvitesSection />}

      {inviteOpen && <InviteDialog onClose={() => setInviteOpen(false)} />}
      <ConfirmDialog
        open={confirmLeave}
        onClose={() => setConfirmLeave(false)}
        pending={leave.isPending}
        onConfirm={() => leave.mutate(undefined, { onSettled: () => setConfirmLeave(false) })}
        title={`Sair de "${current.household.name}"?`}
        description="Você perde o acesso aos dados desta casa. Para voltar, será preciso um novo convite."
        confirmLabel="Sair"
      />
    </div>
  )
}

function HouseholdName() {
  const { current } = useHousehold()
  const queryClient = useQueryClient()
  const [name, setName] = useState(current.household.name)
  const rename = useMutation({
    mutationFn: async (value: string) => {
      const { error } = await supabase.from('households').update({ name: value }).eq('id', current.household.id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: householdQuery.queryKey })
      toast.success('Nome da casa atualizado.')
    },
  })

  return (
    <Card className="flex flex-wrap items-end gap-3">
      <div className="min-w-48 flex-1 space-y-1.5">
        <label htmlFor="hh-name" className="text-sm font-medium">
          Nome da casa
        </label>
        <Input id="hh-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        <p className="text-xs text-muted-foreground">Aparece para quem você convidar.</p>
      </div>
      <Button
        variant="outline"
        disabled={!name.trim() || name.trim() === current.household.name || rename.isPending}
        onClick={() => rename.mutate(name.trim())}
      >
        Salvar
      </Button>
    </Card>
  )
}

function PeopleSection({ isOwner }: { isOwner: boolean }) {
  const members = useMembers()
  const canViewTx = usePermission('transactions', 'view')
  const [month, setMonth] = useState(currentMonthKey)
  const transactions = useTransactions({ month })
  const rows = canViewTx ? (transactions.data ?? []) : []
  const splits = useSplits(rows.map((t) => t.id))
  const spending = spendingByMember(rows, splits.data ?? [])
  const { removeMember } = useFamilyMutations()
  const [dialog, setDialog] = useState<{ member?: HouseholdMember } | null>(null)
  const [toDelete, setToDelete] = useState<HouseholdMember | null>(null)

  const list = members.data ?? []
  const { userId } = useHousehold()
  const avatarUrls = useAvatarUrls(list).data
  const total = [...spending.values()].reduce((a, b) => a + b, 0)
  const unassigned = spending.get(null) ?? 0

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Pessoas da casa</h2>
        <div className="flex items-center gap-2">
          {canViewTx && <MonthPicker value={month} onChange={setMonth} />}
          {isOwner && (
            <Button variant="outline" size="sm" onClick={() => setDialog({})}>
              <Plus /> Pessoa
            </Button>
          )}
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Use as pessoas para indicar de quem é cada gasto (inclusive quem não usa o app, como filhos) e dividir contas. Toque na
        foto para trocar.
      </p>
      <Card className="divide-y divide-border p-0">
        {list.map((m) => {
          const spent = spending.get(m.id) ?? 0
          return (
            <div key={m.id} className="flex items-center gap-3 px-4 py-3">
              {/* Dono gerencia todas as fotos; cada um gerencia a própria. */}
              <AvatarUpload member={m} url={avatarUrls?.get(m.id)} disabled={!isOwner && m.user_id !== userId} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[m.relationship, m.user_id ? 'acessa o app' : 'sem acesso ao app'].filter(Boolean).join(' · ')}
                </p>
              </div>
              {canViewTx && (
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{formatCents(spent)}</p>
                  {total > 0 && <p className="text-xs text-muted-foreground">{Math.round((spent / total) * 100)}% dos gastos</p>}
                </div>
              )}
              {isOwner && (
                <div className="flex shrink-0">
                  <Button variant="ghost" size="icon" aria-label={`Editar ${m.full_name}`} onClick={() => setDialog({ member: m })}>
                    <Pencil />
                  </Button>
                  {!m.user_id && (
                    <Button variant="ghost" size="icon" aria-label={`Excluir ${m.full_name}`} onClick={() => setToDelete(m)}>
                      <Trash2 />
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })}
        {canViewTx && unassigned > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 text-muted-foreground">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm">🏠</span>
            <p className="flex-1 text-sm">Gastos da casa (sem pessoa definida)</p>
            <p className="text-sm font-semibold tabular-nums">{formatCents(unassigned)}</p>
          </div>
        )}
      </Card>

      {dialog && <MemberFormDialog member={dialog.member} nextOrder={list.length} onClose={() => setDialog(null)} />}
      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        pending={removeMember.isPending}
        onConfirm={() => toDelete && removeMember.mutate(toDelete.id, { onSettled: () => setToDelete(null) })}
        title={`Remover ${toDelete?.full_name}?`}
        description="Os gastos atribuídos a esta pessoa passam a ser da casa, e as divisões com ela são desfeitas."
        confirmLabel="Remover"
      />
    </section>
  )
}

function AccessSection({ isOwner, userId }: { isOwner: boolean; userId: string }) {
  const access = useAccessList()
  const [open, setOpen] = useState<string | null>(null)
  const [toRemove, setToRemove] = useState<AccessEntry | null>(null)
  const { updatePermission, removeAccess } = useFamilyMutations()

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Acesso ao app</h2>
      <Card className="divide-y divide-border p-0">
        {(access.data ?? []).map((p) => {
          const owner = p.role === 'owner'
          const expanded = open === p.id
          return (
            <div key={p.id}>
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {p.profile?.full_name || 'Sem nome'}
                    {p.user_id === userId && <span className="text-muted-foreground"> (você)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{owner ? 'Dono · acesso total' : summarize(p)}</p>
                </div>
                {!owner && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={expanded}
                    onClick={() => setOpen(expanded ? null : p.id)}
                  >
                    Permissões
                    <ChevronDown className={cn('transition-transform', expanded && 'rotate-180')} />
                  </Button>
                )}
                {isOwner && !owner && (
                  <Button variant="ghost" size="icon" aria-label="Remover acesso" onClick={() => setToRemove(p)}>
                    <X />
                  </Button>
                )}
              </div>
              {expanded && !owner && (
                <div className="border-t border-border bg-muted/30 px-4 py-3">
                  <PermissionMatrix
                    value={pickFlags(p)}
                    disabled={!isOwner}
                    onChange={(flags) => updatePermission.mutate({ id: p.id, flags })}
                  />
                  {!isOwner && <p className="mt-2 text-xs text-muted-foreground">Só o dono da casa altera permissões.</p>}
                </div>
              )}
            </div>
          )
        })}
      </Card>
      <ConfirmDialog
        open={Boolean(toRemove)}
        onClose={() => setToRemove(null)}
        pending={removeAccess.isPending}
        onConfirm={() => toRemove && removeAccess.mutate(toRemove.id, { onSettled: () => setToRemove(null) })}
        title={`Remover o acesso de ${toRemove?.profile?.full_name || 'esta pessoa'}?`}
        description="Ela deixa de ver os dados da casa imediatamente. Os lançamentos feitos por ela continuam."
        confirmLabel="Remover acesso"
      />
    </section>
  )
}

function summarize(p: AccessEntry) {
  const flags = pickFlags(p)
  const values = Object.entries(flags)
  const edits = values.filter(([k, v]) => k.startsWith('can_edit') && v).length
  const views = values.filter(([k, v]) => k.startsWith('can_view') && v).length
  if (edits === 6) return 'Pode ver e editar tudo'
  if (edits === 0 && views === 6) return 'Pode ver tudo, sem editar'
  if (views === 0) return 'Sem acesso a módulos'
  return `Vê ${views} módulo(s), edita ${edits}`
}

function InvitesSection() {
  const invites = useInvites(true)
  const { revokeInvite } = useFamilyMutations()
  const [now] = useState(() => new Date().toISOString())
  const pending = (invites.data ?? []).filter((i) => !i.accepted_at && !i.revoked_at && i.expires_at > now)

  if (pending.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Convites pendentes</h2>
      <Card className="divide-y divide-border p-0">
        {pending.map((i) => (
          <div key={i.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{i.full_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {[i.email, `expira em ${format(parseISO(i.expires_at), 'dd/MM HH:mm')}`].filter(Boolean).join(' · ')}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => copyText(inviteLink(i.token))}>
              <Copy /> Copiar link
            </Button>
            <Button variant="ghost" size="icon" aria-label="Cancelar convite" onClick={() => revokeInvite.mutate(i.id)}>
              <X />
            </Button>
          </div>
        ))}
      </Card>
      <CardTitle className="text-xs">Convites usados, cancelados ou vencidos não aparecem aqui.</CardTitle>
    </section>
  )
}
