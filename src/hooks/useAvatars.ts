import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useHousehold } from '@/hooks/useHousehold'
import { squareThumbnail, type SquareCrop } from '@/lib/image'
import { supabase } from '@/lib/supabase'
import type { HouseholdMember } from '@/types/database'

const BUCKET = 'avatars'
const URL_TTL = 60 * 60 // 1 h; a query renova antes de expirar

/** URLs assinadas (bucket privado) das fotos das pessoas, por id da pessoa. */
export function useAvatarUrls(members: Pick<HouseholdMember, 'id' | 'avatar_path'>[]) {
  const householdId = useHousehold().current.household.id
  const paths = members.filter((m) => m.avatar_path).map((m) => m.avatar_path!) .sort()
  return useQuery({
    queryKey: ['avatars', householdId, paths],
    enabled: paths.length > 0,
    staleTime: (URL_TTL - 300) * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, URL_TTL)
      if (error) throw error
      const byPath = new Map(data.map((d) => [d.path, d.signedUrl]))
      return new Map(members.filter((m) => m.avatar_path).map((m) => [m.id, byPath.get(m.avatar_path!) ?? null]))
    },
    select: (map) => map,
  })
}

export function useAvatarMutations() {
  const queryClient = useQueryClient()
  const householdId = useHousehold().current.household.id
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['household_members', householdId] })
    queryClient.invalidateQueries({ queryKey: ['avatars', householdId] })
  }

  const upload = useMutation({
    mutationFn: async ({ member, file, crop }: { member: HouseholdMember; file: File; crop?: SquareCrop }) => {
      const blob = await squareThumbnail(file, undefined, undefined, crop)
      // Nome novo a cada envio: evita cache de foto antiga.
      const path = `${member.household_id}/${member.id}/${crypto.randomUUID()}.jpg`
      const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
      if (error) throw error
      const { error: updateError } = await supabase.from('household_members').update({ avatar_path: path }).eq('id', member.id)
      if (updateError) {
        await supabase.storage.from(BUCKET).remove([path])
        throw updateError
      }
      if (member.avatar_path) await supabase.storage.from(BUCKET).remove([member.avatar_path])
    },
    onSuccess: () => {
      refresh()
      toast.success('Foto atualizada.')
    },
    onError: (error: Error) =>
      toast.error(error.message === 'not_an_image' ? 'Escolha um arquivo de imagem.' : 'Não foi possível enviar a foto.'),
  })

  const remove = useMutation({
    mutationFn: async (member: HouseholdMember) => {
      const { error } = await supabase.from('household_members').update({ avatar_path: null }).eq('id', member.id)
      if (error) throw error
      if (member.avatar_path) await supabase.storage.from(BUCKET).remove([member.avatar_path])
    },
    onSuccess: () => {
      refresh()
      toast.success('Foto removida.')
    },
    onError: () => toast.error('Não foi possível remover a foto.'),
  })

  return { upload, remove }
}
