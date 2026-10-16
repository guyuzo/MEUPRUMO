import { Camera } from 'lucide-react'
import { useRef } from 'react'
import { useAvatarMutations } from '@/hooks/useAvatars'
import { cn } from '@/lib/utils'
import type { HouseholdMember } from '@/types/database'

const SIZES = { sm: 'size-7 text-xs', md: 'size-10 text-sm', lg: 'size-20 text-2xl' } as const

/** Foto da pessoa ou, sem foto, a inicial na cor dela. */
export function Avatar({
  member,
  url,
  size = 'md',
  className,
}: {
  member: Pick<HouseholdMember, 'full_name' | 'color'>
  url?: string | null
  size?: keyof typeof SIZES
  className?: string
}) {
  return url ? (
    <img src={url} alt={member.full_name} className={cn('shrink-0 rounded-full object-cover', SIZES[size], className)} />
  ) : (
    <span
      aria-hidden
      className={cn('flex shrink-0 items-center justify-center rounded-full font-semibold text-white', SIZES[size], className)}
      style={{ backgroundColor: member.color }}
    >
      {member.full_name.trim().charAt(0).toUpperCase()}
    </span>
  )
}

/** Avatar clicável que abre o seletor de foto (câmera no celular). */
export function AvatarUpload({
  member,
  url,
  size = 'md',
  disabled,
}: {
  member: HouseholdMember
  url?: string | null
  size?: keyof typeof SIZES
  disabled?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const { upload } = useAvatarMutations()

  if (disabled) return <Avatar member={member} url={url} size={size} />

  return (
    <>
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={upload.isPending}
        aria-label={`${url ? 'Trocar' : 'Adicionar'} foto de ${member.full_name}`}
        title={url ? 'Trocar foto' : 'Adicionar foto'}
        className="group relative shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar member={member} url={url} size={size} className={cn(upload.isPending && 'opacity-50')} />
        <span className="absolute -bottom-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground opacity-90 group-hover:opacity-100">
          <Camera className="size-3" />
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) upload.mutate({ member, file })
          e.target.value = ''
        }}
      />
    </>
  )
}
