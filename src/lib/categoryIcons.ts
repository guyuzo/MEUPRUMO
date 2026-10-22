import {
  Baby,
  Banknote,
  Bike,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  Car,
  CarTaxiFront,
  Clapperboard,
  Coffee,
  Coins,
  CreditCard,
  Droplet,
  Dumbbell,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  Handshake,
  Hammer,
  Heart,
  HeartPulse,
  Hotel,
  House,
  KeyRound,
  Landmark,
  Laptop,
  Lightbulb,
  Monitor,
  Music,
  Package,
  PartyPopper,
  PawPrint,
  Pencil,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Receipt,
  Scissors,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sofa,
  Sparkles,
  Sprout,
  Star,
  Stethoscope,
  Tag,
  Ticket,
  TrainFront,
  TreePalm,
  TrendingUp,
  Tv,
  Utensils,
  Wallet,
  Wifi,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/**
 * Ícones das categorias. A chave fica salva na coluna `emoji` (nome antigo mantido para não
 * precisar de migration); valores antigos em emoji são traduzidos por EMOJI_TO_ICON.
 */
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  house: House,
  building: Building2,
  key: KeyRound,
  sofa: Sofa,
  wrench: Wrench,
  hammer: Hammer,
  utensils: Utensils,
  cart: ShoppingCart,
  pizza: Pizza,
  coffee: Coffee,
  car: Car,
  fuel: Fuel,
  taxi: CarTaxiFront,
  bus: Bus,
  train: TrainFront,
  bike: Bike,
  plane: Plane,
  lightbulb: Lightbulb,
  zap: Zap,
  droplet: Droplet,
  wifi: Wifi,
  phone: Smartphone,
  health: HeartPulse,
  pill: Pill,
  doctor: Stethoscope,
  dumbbell: Dumbbell,
  book: BookOpen,
  graduation: GraduationCap,
  pencil: Pencil,
  party: PartyPopper,
  movie: Clapperboard,
  ticket: Ticket,
  music: Music,
  gamepad: Gamepad2,
  palm: TreePalm,
  hotel: Hotel,
  bag: ShoppingBag,
  shirt: Shirt,
  laptop: Laptop,
  monitor: Monitor,
  tv: Tv,
  paw: PawPrint,
  baby: Baby,
  gift: Gift,
  scissors: Scissors,
  sparkles: Sparkles,
  receipt: Receipt,
  bank: Landmark,
  card: CreditCard,
  briefcase: Briefcase,
  trending: TrendingUp,
  coins: Coins,
  banknote: Banknote,
  wallet: Wallet,
  piggy: PiggyBank,
  handcoins: HandCoins,
  handshake: Handshake,
  sprout: Sprout,
  heart: Heart,
  star: Star,
  package: Package,
  tag: Tag,
}

export type CategoryIconKey = keyof typeof CATEGORY_ICONS

const EMOJI_TO_ICON: Record<string, string> = {
  '🏠': 'house', '🍽️': 'utensils', '🍽': 'utensils', '🛒': 'cart', '🚗': 'car', '⛽': 'fuel', '🚌': 'bus',
  '💡': 'lightbulb', '💧': 'droplet', '📱': 'phone', '🌐': 'wifi', '💊': 'pill', '🏥': 'doctor',
  '📚': 'book', '🎓': 'graduation', '🎉': 'party', '🎬': 'movie', '✈️': 'plane', '🏖️': 'palm',
  '🛍️': 'bag', '👕': 'shirt', '📺': 'tv', '🎮': 'gamepad', '🐾': 'paw', '👶': 'baby', '🎁': 'gift',
  '💇': 'scissors', '🏋️': 'dumbbell', '🧾': 'receipt', '🏦': 'bank', '💳': 'card', '📦': 'package',
  '🔧': 'wrench', '💼': 'briefcase', '💻': 'laptop', '📈': 'trending', '💰': 'coins', '🪙': 'coins',
  '🤝': 'handshake', '❤️': 'heart', '⭐': 'star',
}

/** Chave do ícone a partir do valor salvo (chave nova ou emoji antigo). */
export function categoryIconKey(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  if (value in CATEGORY_ICONS) return value
  return EMOJI_TO_ICON[value] ?? EMOJI_TO_ICON[value.replace(/️/g, '')]
}

// Subcategorias sem ícone próprio: palpite pelo nome (sem acento, minúsculo).
const SUB_BY_NAME: [RegExp, string][] = [
  [/aluguel/, 'key'],
  [/condominio/, 'building'],
  [/manutencao|reforma|conserto/, 'wrench'],
  [/mercado|supermercado/, 'cart'],
  [/restaurante|lanche/, 'utensils'],
  [/delivery|ifood/, 'pizza'],
  [/cafe|padaria/, 'coffee'],
  [/combustivel|gasolina/, 'fuel'],
  [/app de transporte|uber|taxi/, 'taxi'],
  [/transporte publico|onibus|metro/, 'train'],
  [/estacionamento|pedagio|carro/, 'car'],
  [/energia|luz/, 'zap'],
  [/agua/, 'droplet'],
  [/internet/, 'wifi'],
  [/celular|telefone/, 'phone'],
  [/plano de saude/, 'health'],
  [/farmacia|remedio/, 'pill'],
  [/consulta|medico|exame|dentista/, 'doctor'],
  [/academia/, 'dumbbell'],
  [/mensalidade|escola|faculdade/, 'graduation'],
  [/curso/, 'book'],
  [/material/, 'pencil'],
  [/passeio/, 'ticket'],
  [/viage/, 'plane'],
  [/hobby|hobbies/, 'gamepad'],
  [/cinema|show/, 'movie'],
  [/roupa|calcado/, 'shirt'],
  [/casa|decoracao|movei/, 'sofa'],
  [/eletronico/, 'monitor'],
  [/streaming/, 'tv'],
  [/apps?$|aplicativo|software/, 'phone'],
  [/presente/, 'gift'],
  [/beleza|cabelo|salao/, 'scissors'],
]

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

export function subcategoryIconKey(name: string, own?: string | null): string | undefined {
  const ownKey = categoryIconKey(own)
  if (ownKey) return ownKey
  const n = plain(name)
  return SUB_BY_NAME.find(([re]) => re.test(n))?.[1]
}

export function categoryIcon(value: string | null | undefined): LucideIcon {
  return CATEGORY_ICONS[categoryIconKey(value) ?? 'tag']
}
