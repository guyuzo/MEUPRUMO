import { createFileRoute } from '@tanstack/react-router'
import { Check, ExternalLink, Gift, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Field, EmptyState, ListSkeleton, PageHeader } from '@/components/shared/layout'
import { MoneyInput } from '@/components/shared/MoneyInput'
import { EmojiPicker } from '@/components/shared/pickers'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog, Dialog } from '@/components/ui/dialog'
import { FieldError, Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Avatar } from '@/components/family/Avatar'
import { useAvatarUrls } from '@/hooks/useAvatars'
import { useMembers } from '@/hooks/useFamily'
import { usePermission } from '@/hooks/useHousehold'
import { useHouseholdRows, useTableMutations } from '@/hooks/useTable'
import { formatCents } from '@/lib/money'
import { cn } from '@/lib/utils'
import type { HouseholdMember, WishlistItem, WishlistSection } from '@/types/database'

export const Route = createFileRoute('/_authenticated/wishlist')({ component: WishlistPage })

const nowIso = () => new Date().toISOString()

const PRIORITY: Record<1 | 2 | 3, string> = { 1: 'Alta', 2: 'Média', 3: 'Baixa' }

type SectionInput = { name: string; emoji: string; sort_order?: number }
type ItemInput = {
  section_id: string
  name: string
  price: number | null
  url: string | null
  priority: 1 | 2 | 3
  notes: string | null
  member_id: string | null
  purchased_at?: string | null
}

/** "https://www.amazon.com.br/..." → "amazon.com.br" */
function siteName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'Abrir link'
  }
}

function WishlistPage() {
  const canEdit = usePermission('wishlist', 'edit')
  const sections = useHouseholdRows<WishlistSection>('wishlist_sections', { order: 'sort_order' })
  const items = useHouseholdRows<WishlistItem>('wishlist_items', { order: 'priority' })
  const sectionMut = useTableMutations<SectionInput>('wishlist_sections', { invalidate: ['wishlist_items'], label: 'lista' })
  const itemMut = useTableMutations<ItemInput>('wishlist_items', { label: 'item' })
  const members = useMembers().data ?? []
  const avatarUrls = useAvatarUrls(members).data
  const memberById = new Map(members.map((m) => [m.id, m]))
  const [person, setPerson] = useState<string>('all')

  const [sectionDialog, setSectionDialog] = useState<{ section?: WishlistSection } | null>(null)
  const [itemDialog, setItemDialog] = useState<{ sectionId: string; item?: WishlistItem } | null>(null)
  const [deleteSection, setDeleteSection] = useState<WishlistSection | null>(null)

  const allSections = sections.data ?? []
  const allItems = items.data ?? []
  const pendingTotal = allItems.filter((i) => !i.purchased_at).reduce((s, i) => s + (i.price ?? 0), 0)

  const togglePurchased = (item: WishlistItem) =>
    itemMut.save.mutate({
      id: item.id,
      section_id: item.section_id,
      name: item.name,
      price: item.price,
      url: item.url,
      priority: item.priority,
      notes: item.notes,
      member_id: item.member_id,
      purchased_at: item.purchased_at ? null : nowIso(),
    })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lista de desejos"
        subtitle={allItems.length > 0 ? `${formatCents(pendingTotal)} em itens que ainda faltam` : undefined}
        actions={
          canEdit && (
            <Button onClick={() => setSectionDialog({})}>
              <Plus /> Nova lista
            </Button>
          )
        }
      />

      {sections.isPending ? (
        <ListSkeleton count={2} />
      ) : allSections.length === 0 ? (
        <EmptyState
          icon={Gift}
          text="Organize o que você quer comprar em listas (casa, presentes, viagem) e planeje antes de gastar."
          action={
            canEdit && (
              <Button variant="outline" onClick={() => setSectionDialog({})}>
                <Plus /> Criar lista
              </Button>
            )
          }
        />
      ) : (
        <>
        {members.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por pessoa">
            {[{ id: 'all', full_name: 'Todos' }, ...members, { id: 'house', full_name: 'Casa toda' }].map((m) => {
              const member = memberById.get(m.id)
              const active = person === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPerson(m.id)}
                  className={cn(
                    'flex min-h-10 items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-sm',
                    m.id === 'all' || m.id === 'house' ? 'pl-3' : '',
                    active ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {member && <Avatar member={member} url={avatarUrls?.get(member.id)} size="sm" />}
                  {m.full_name}
                </button>
              )
            })}
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-2">
          {allSections.map((section) => {
            const list = allItems
              .filter((i) => i.section_id === section.id)
              .filter((i) => person === 'all' || (person === 'house' ? !i.member_id : i.member_id === person))
              .sort((a, b) => Number(Boolean(a.purchased_at)) - Number(Boolean(b.purchased_at)) || a.priority - b.priority)
            const missing = list.filter((i) => !i.purchased_at).reduce((s, i) => s + (i.price ?? 0), 0)
            return (
              <Card key={section.id} className="space-y-3 p-0">
                <div className="flex items-center gap-2 px-4 pt-4">
                  <span className="text-lg">{section.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{section.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {list.filter((i) => !i.purchased_at).length} pendente(s) · {formatCents(missing)}
                    </p>
                  </div>
                  {canEdit && (
                    <>
                      <Button variant="ghost" size="icon" aria-label="Editar lista" onClick={() => setSectionDialog({ section })}>
                        <Pencil />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Excluir lista" onClick={() => setDeleteSection(section)}>
                        <Trash2 />
                      </Button>
                    </>
                  )}
                </div>
                <ul className="divide-y divide-border border-t border-border">
                  {list.length === 0 && <li className="px-4 py-3 text-sm text-muted-foreground">Nenhum desejo aqui.</li>}
                  {list.map((item) => {
                    const owner = item.member_id ? memberById.get(item.member_id) : undefined
                    return (
                    <li key={item.id} className={cn('flex items-center gap-3 px-4 py-2.5', item.purchased_at && 'opacity-55')}>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => togglePurchased(item)}
                        aria-label={item.purchased_at ? 'Desmarcar como comprado' : 'Marcar como comprado'}
                        // Área de toque de 40px com a caixinha visual de 20px no centro.
                        className="-m-2.5 flex size-10 shrink-0 items-center justify-center"
                      >
                        <span
                          className={cn(
                            'flex size-5 items-center justify-center rounded border border-input',
                            item.purchased_at && 'border-primary bg-primary text-primary-foreground',
                          )}
                        >
                          {item.purchased_at && <Check className="size-3.5" />}
                        </span>
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={cn('line-clamp-2 break-words text-sm sm:line-clamp-1', item.purchased_at && 'line-through')}>
                          {item.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {/* Celular: preço aqui, embaixo do nome (a coluna da direita fica só com os ícones). */}
                          {item.price != null && <span className="font-medium text-foreground sm:hidden">{formatCents(item.price)} · </span>}
                          {owner ? owner.full_name : 'Casa'} · prioridade {PRIORITY[item.priority].toLowerCase()}
                          {item.notes && ` · ${item.notes}`}
                        </p>
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 inline-flex max-w-full items-center gap-1 text-xs font-medium text-primary hover:underline"
                          >
                            <ExternalLink className="size-3 shrink-0" />
                            <span className="truncate">Comprar em {siteName(item.url)}</span>
                          </a>
                        )}
                      </div>
                      {owner && (
                        <Avatar member={owner} url={avatarUrls?.get(owner.id)} size="sm" className="hidden sm:flex" />
                      )}
                      {item.price != null && <span className="hidden shrink-0 text-sm tabular-nums sm:inline">{formatCents(item.price)}</span>}
                      {canEdit && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="shrink-0"
                          aria-label={`Editar ${item.name}`}
                          onClick={() => setItemDialog({ sectionId: section.id, item })}
                        >
                          <Pencil />
                        </Button>
                      )}
                    </li>
                    )
                  })}
                </ul>
                {canEdit && (
                  <div className="px-4 pb-3">
                    <Button variant="ghost" size="sm" onClick={() => setItemDialog({ sectionId: section.id })}>
                      <Plus /> Adicionar item
                    </Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
        </>
      )}

      {sectionDialog && (
        <SectionDialog
          section={sectionDialog.section}
          nextOrder={allSections.length}
          onClose={() => setSectionDialog(null)}
          onSave={(values) => sectionMut.save.mutateAsync({ id: sectionDialog.section?.id, ...values })}
        />
      )}
      {itemDialog && (
        <ItemDialog
          sectionId={itemDialog.sectionId}
          item={itemDialog.item}
          members={members}
          defaultMember={person !== 'all' && person !== 'house' ? person : null}
          onClose={() => setItemDialog(null)}
          onSave={(values) => itemMut.save.mutateAsync({ id: itemDialog.item?.id, ...values })}
          onDelete={itemDialog.item ? () => itemMut.remove.mutateAsync(itemDialog.item!.id) : undefined}
          onTogglePurchased={itemDialog.item ? () => togglePurchased(itemDialog.item!) : undefined}
        />
      )}
      <ConfirmDialog
        open={Boolean(deleteSection)}
        onClose={() => setDeleteSection(null)}
        pending={sectionMut.remove.isPending}
        onConfirm={() => deleteSection && sectionMut.remove.mutate(deleteSection.id, { onSettled: () => setDeleteSection(null) })}
        title={`Excluir "${deleteSection?.name}"?`}
        description="Todos os itens desta lista também serão excluídos."
      />
    </div>
  )
}

function SectionDialog({
  section,
  nextOrder,
  onClose,
  onSave,
}: {
  section?: WishlistSection
  nextOrder: number
  onClose: () => void
  onSave: (values: SectionInput) => Promise<unknown>
}) {
  const [name, setName] = useState(section?.name ?? '')
  const [emoji, setEmoji] = useState(section?.emoji ?? '🎁')
  const [error, setError] = useState<string>()

  const submit = async () => {
    if (!name.trim()) return setError('Informe um nome')
    await onSave({ name: name.trim(), emoji, ...(section ? {} : { sort_order: nextOrder }) })
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title={section ? 'Editar lista' : 'Nova lista'}>
      <div className="space-y-4">
        <Field label="Nome" htmlFor="sec-name" error={error}>
          <Input id="sec-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Casa nova" />
        </Field>
        <Field label="Ícone">
          <EmojiPicker value={emoji} onChange={setEmoji} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit}>Salvar</Button>
        </div>
      </div>
    </Dialog>
  )
}

function ItemDialog({
  sectionId,
  item,
  members,
  defaultMember,
  onClose,
  onSave,
  onDelete,
  onTogglePurchased,
}: {
  sectionId: string
  item?: WishlistItem
  members: HouseholdMember[]
  defaultMember: string | null
  onClose: () => void
  onSave: (values: ItemInput) => Promise<unknown>
  onDelete?: () => Promise<unknown>
  onTogglePurchased?: () => void
}) {
  const [name, setName] = useState(item?.name ?? '')
  const [price, setPrice] = useState<number | null>(item?.price ?? null)
  const [url, setUrl] = useState(item?.url ?? '')
  const [priority, setPriority] = useState<1 | 2 | 3>(item?.priority ?? 2)
  const [notes, setNotes] = useState(item?.notes ?? '')
  const [memberId, setMemberId] = useState(item ? (item.member_id ?? '') : (defaultMember ?? ''))
  const [error, setError] = useState<string>()

  const submit = async () => {
    if (!name.trim()) return setError('Informe o nome do item')
    const link = url.trim()
    if (link && !/^https?:\/\//i.test(link)) return setError('O link deve começar com http:// ou https://')
    await onSave({
      section_id: sectionId,
      name: name.trim(),
      price,
      url: link || null,
      priority,
      notes: notes.trim() || null,
      member_id: memberId || null,
      purchased_at: item?.purchased_at ?? null,
    })
    onClose()
  }

  return (
    <Dialog open onClose={onClose} title={item ? 'Editar item' : 'Novo item'}>
      <div className="space-y-4">
        <Field label="Item" htmlFor="item-name">
          <Input id="item-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Sofá retrátil" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Preço" htmlFor="item-price">
            <MoneyInput id="item-price" value={price} onChange={setPrice} placeholder="Opcional" />
          </Field>
          <Field label="Prioridade" htmlFor="item-priority">
            <Select id="item-priority" value={priority} onChange={(e) => setPriority(Number(e.target.value) as 1 | 2 | 3)}>
              <option value={1}>Alta</option>
              <option value={2}>Média</option>
              <option value={3}>Baixa</option>
            </Select>
          </Field>
        </div>
        <Field label="De quem é" htmlFor="item-member">
          <Select id="item-member" value={memberId} onChange={(e) => setMemberId(e.target.value)}>
            <option value="">Casa toda</option>
            {members.map((m) => (
              <option key={m.id} value={m.id} data-color={m.color}>
                {m.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Onde comprar (link)" htmlFor="item-url">
          <Input id="item-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.loja.com.br/produto" />
        </Field>
        <Field label="Observações" htmlFor="item-notes">
          <Input id="item-notes" value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <FieldError message={error} />
        <div className="flex items-center gap-2">
          {onDelete && (
            <Button variant="ghost" size="icon" aria-label="Excluir item" onClick={() => onDelete().then(onClose)}>
              <Trash2 />
            </Button>
          )}
          {onTogglePurchased && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onTogglePurchased()
                onClose()
              }}
            >
              {item?.purchased_at ? (
                <>
                  <RotateCcw /> Desmarcar comprado
                </>
              ) : (
                <>
                  <Check /> Comprado
                </>
              )}
            </Button>
          )}
          <Button variant="outline" className="ml-auto" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit}>Salvar</Button>
        </div>
      </div>
    </Dialog>
  )
}
