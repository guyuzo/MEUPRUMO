import { Download, Share, SquarePlus } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { promptInstall, useInstallMode } from '@/lib/pwa'

/** Botão "Instalar app": some quando o app já está instalado ou o navegador não permite. */
export function InstallAppButton({ className }: { className?: string }) {
  const mode = useInstallMode()
  const [showIOSHelp, setShowIOSHelp] = useState(false)
  if (!mode) return null

  return (
    <>
      <button
        type="button"
        onClick={() => (mode === 'prompt' ? promptInstall() : setShowIOSHelp(true))}
        className={className}
      >
        <Download className="size-4" />
        Instalar app
      </button>
      <Dialog
        open={showIOSHelp}
        onClose={() => setShowIOSHelp(false)}
        title="Instalar no iPhone"
        description="O Meu Prumo vai aparecer na sua tela de início como um app."
      >
        <ol className="space-y-3 text-sm">
          <li className="flex items-start gap-3">
            <Share className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              No Safari, toque no botão <strong>Compartilhar</strong> (o quadrado com a seta para cima).
            </span>
          </li>
          <li className="flex items-start gap-3">
            <SquarePlus className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              Role a lista e toque em <strong>Adicionar à Tela de Início</strong>, depois em <strong>Adicionar</strong>.
            </span>
          </li>
        </ol>
        <div className="mt-5 flex justify-end">
          <Button onClick={() => setShowIOSHelp(false)}>Entendi</Button>
        </div>
      </Dialog>
    </>
  )
}
