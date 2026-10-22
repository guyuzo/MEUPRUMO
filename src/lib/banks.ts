/** Bancos/emissores conhecidos: logo (em /public/banks) e cor usada como padrão do cartão. */
export interface Bank {
  slug: string
  name: string
  color: string
  /** Caminho do logo; sem logo, mostra as iniciais na cor do banco. */
  logo?: string
  /** Outras grafias aceitas ao reconhecer um nome digitado. */
  aliases?: string[]
  /** Logo é um ícone de app com cantos arredondados próprios: é ampliado para o recorte esconder os cantos. */
  appIcon?: boolean
}

/** Classes da <img> do logo (o contêiner precisa de overflow-hidden). */
export function bankLogoImgClass(bank: Bank) {
  return bank.appIcon ? 'size-full scale-[1.2] object-cover' : 'size-full object-contain'
}

export const BANKS: Bank[] = [
  { slug: 'nubank', name: 'Nubank', color: '#820ad1', logo: '/banks/nubank.jpg', aliases: ['nu', 'nu pagamentos'], appIcon: true },
  { slug: 'itau', name: 'Itaú', color: '#ec7000', logo: '/banks/itau.png', aliases: ['itau unibanco', 'personnalite'], appIcon: true },
  { slug: 'bradesco', name: 'Bradesco', color: '#cc092f', logo: '/banks/bradesco.png', aliases: ['next'] },
  { slug: 'santander', name: 'Santander', color: '#ec0000', logo: '/banks/santander.png', appIcon: true },
  { slug: 'bb', name: 'Banco do Brasil', color: '#0038a8', logo: '/banks/bb.png', aliases: ['bb', 'ourocard'] },
  { slug: 'caixa', name: 'Caixa', color: '#005ca9', aliases: ['caixa economica', 'cef'] },
  { slug: 'inter', name: 'Inter', color: '#ff7a00', logo: '/banks/inter.png', aliases: ['banco inter'] },
  { slug: 'c6', name: 'C6 Bank', color: '#242424', logo: '/banks/c6.png', aliases: ['c6'] },
  { slug: 'btg', name: 'BTG Pactual', color: '#001e62', logo: '/banks/btg.png', aliases: ['btg'], appIcon: true },
  { slug: 'xp', name: 'XP', color: '#111111', logo: '/banks/xp.png', aliases: ['xp investimentos'], appIcon: true },
  { slug: 'picpay', name: 'PicPay', color: '#11c76f', logo: '/banks/picpay.png' },
  { slug: 'mercadopago', name: 'Mercado Pago', color: '#00b1ea', logo: '/banks/mercadopago.png', aliases: ['mercado livre'] },
  { slug: 'pagbank', name: 'PagBank', color: '#1b9e4b', logo: '/banks/pagbank.png', aliases: ['pagseguro'], appIcon: true },
  { slug: 'neon', name: 'Neon', color: '#00a5f0', logo: '/banks/neon.png', appIcon: true },
  { slug: 'sicoob', name: 'Sicoob', color: '#003641', logo: '/banks/sicoob.png' },
  { slug: 'sicredi', name: 'Sicredi', color: '#3fa110' },
  { slug: 'banrisul', name: 'Banrisul', color: '#004b8d' },
  { slug: 'safra', name: 'Safra', color: '#00205b', logo: '/banks/safra.png' },
  { slug: 'porto', name: 'Porto Bank', color: '#0046c0', logo: '/banks/porto.png', aliases: ['porto seguro'], appIcon: true },
  { slug: 'bv', name: 'Banco BV', color: '#1c3f94', logo: '/banks/bv.png', aliases: ['bv', 'votorantim'], appIcon: true },
  { slug: 'pan', name: 'Banco Pan', color: '#0090df', logo: '/banks/pan.png', aliases: ['pan'] },
  { slug: 'original', name: 'Banco Original', color: '#00a651', aliases: ['original'] },
  { slug: 'will', name: 'Will Bank', color: '#e6b800', aliases: ['will'] },
  { slug: 'nomad', name: 'Nomad', color: '#d4a300', logo: '/banks/nomad.png' },
]

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Reconhece o banco pelo nome salvo (ignora acento, maiúsculas e o prefixo "banco"). */
export function findBank(name: string | null | undefined): Bank | undefined {
  if (!name) return undefined
  const key = normalize(name)
  const bare = key.replace(/^banco /, '')
  return BANKS.find((b) =>
    [b.name, b.slug, ...(b.aliases ?? [])].some((alias) => {
      const a = normalize(alias)
      return a === key || a === bare || a.replace(/^banco /, '') === bare
    }),
  )
}

export function bankInitials(name: string) {
  const words = name.replace(/^banco\s+/i, '').trim().split(/\s+/)
  return (words.length > 1 ? words[0][0] + words[1][0] : words[0].slice(0, 2)).toUpperCase()
}
