import { describe, expect, it } from 'vitest'
import { bankInitials, findBank } from './banks'

describe('findBank', () => {
  it('reconhece o nome com ou sem acento, caixa e prefixo "banco"', () => {
    expect(findBank('Itaú')?.slug).toBe('itau')
    expect(findBank('itau')?.slug).toBe('itau')
    expect(findBank('NUBANK')?.slug).toBe('nubank')
    expect(findBank('Banco Inter')?.slug).toBe('inter')
    expect(findBank('Banco do Brasil')?.slug).toBe('bb')
    expect(findBank('Caixa Econômica')?.slug).toBe('caixa')
  })

  it('não inventa banco para nomes desconhecidos ou vazios', () => {
    expect(findBank('Banco da Esquina')).toBeUndefined()
    expect(findBank('')).toBeUndefined()
    expect(findBank(null)).toBeUndefined()
  })
})

describe('bankInitials', () => {
  it('usa duas letras', () => {
    expect(bankInitials('Sicredi')).toBe('SI')
    expect(bankInitials('Will Bank')).toBe('WB')
    expect(bankInitials('Banco Original')).toBe('OR')
  })
})
