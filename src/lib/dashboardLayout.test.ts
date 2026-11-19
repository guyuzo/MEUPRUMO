import { describe, expect, it } from 'vitest'
import { DEFAULT_LAYOUT, isDefaultLayout, moveBlock, normalizeLayout, stepBlock, updateBlock } from './dashboardLayout'

const ids = (layout: { id: string }[]) => layout.map((b) => b.id)

describe('normalizeLayout', () => {
  it('sem nada salvo usa o padrão', () => {
    expect(normalizeLayout(null)).toEqual(DEFAULT_LAYOUT)
    expect(normalizeLayout('lixo')).toEqual(DEFAULT_LAYOUT)
  })

  it('mantém a ordem salva, ignora desconhecidos e repetidos e completa os que faltam', () => {
    const layout = normalizeLayout([
      { id: 'upcoming', size: 'full', hidden: false },
      { id: 'nao-existe', size: 'small' },
      { id: 'stats', size: 'gigante', hidden: true },
      { id: 'upcoming', size: 'small' },
    ])
    expect(layout.slice(0, 2)).toEqual([
      { id: 'upcoming', size: 'full', hidden: false },
      { id: 'stats', size: 'full', hidden: true },
    ])
    expect(ids(layout)).toEqual(['upcoming', 'stats', 'actions', 'chart', 'breakdown', 'expenses', 'income'])
  })
})

describe('mexer nos blocos', () => {
  it('arrasta para a posição de outro bloco', () => {
    expect(ids(moveBlock(DEFAULT_LAYOUT, 'upcoming', 'actions'))).toEqual(['upcoming', 'actions', 'stats', 'chart', 'breakdown', 'expenses', 'income'])
    expect(ids(moveBlock(DEFAULT_LAYOUT, 'actions', 'chart'))).toEqual(['stats', 'chart', 'actions', 'breakdown', 'expenses', 'income', 'upcoming'])
  })

  it('subir/descer pula os ocultos e para nas pontas', () => {
    const layout = updateBlock(DEFAULT_LAYOUT, 'breakdown', { hidden: true })
    expect(ids(stepBlock(layout, 'expenses', -1))).toEqual(['actions', 'stats', 'expenses', 'chart', 'breakdown', 'income', 'upcoming'])
    expect(stepBlock(layout, 'actions', -1)).toBe(layout)
    expect(stepBlock(layout, 'upcoming', 1)).toBe(layout)
  })

  it('reconhece o layout padrão', () => {
    expect(isDefaultLayout(DEFAULT_LAYOUT)).toBe(true)
    expect(isDefaultLayout(updateBlock(DEFAULT_LAYOUT, 'chart', { size: 'full' }))).toBe(false)
  })
})
