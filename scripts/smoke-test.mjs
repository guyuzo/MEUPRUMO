// Teste de fumaça contra o Supabase real: cadastro (trigger), login e isolamento por RLS.
// Cria usuários descartáveis e os remove ao final. Uso: node scripts/smoke-test.mjs
import { createClient } from '@supabase/supabase-js'

process.loadEnvFile('.env.local')
const url = process.env.VITE_SUPABASE_URL
const publishable = process.env.VITE_SUPABASE_ANON_KEY
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } })

const password = `Teste-${crypto.randomUUID()}`
const stamp = Date.now()
const created = []
let failures = 0

function check(label, ok, detail) {
  if (!ok) failures++
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${!ok && detail ? ` — ${JSON.stringify(detail)}` : ''}`)
}

async function makeUser(tag) {
  const email = `smoke-${tag}-${stamp}@example.com`
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Usuário ${tag.toUpperCase()}` },
  })
  if (error) throw error
  created.push(data.user.id)
  const client = createClient(url, publishable, { auth: { persistSession: false } })
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  return { id: data.user.id, client }
}

try {
  const a = await makeUser('a')
  const b = await makeUser('b')
  check('login com senha funciona', true)

  const { data: profileA } = await a.client.from('profiles').select('*').eq('id', a.id).single()
  check('trigger criou perfil com nome', profileA?.full_name === 'Usuário A', profileA)

  const { data: permsA } = await a.client.from('permissions').select('*, household:households!inner(*)')
  check('trigger criou household + permissão owner', permsA?.length === 1 && permsA[0].role === 'owner', permsA)
  const hhA = permsA?.[0]?.household_id

  const { data: canEdit } = await a.client.rpc('can', { hh: hhA, module: 'transactions', action: 'edit' })
  check('owner pode editar transações (can)', canEdit === true, canEdit)

  const { data: bSeesA } = await b.client.from('households').select('id').eq('id', hhA)
  check('B não vê o household de A', bSeesA?.length === 0, bSeesA)

  const { data: bSeesPermsA } = await b.client.from('permissions').select('id').eq('household_id', hhA)
  check('B não vê as permissões de A', bSeesPermsA?.length === 0, bSeesPermsA)

  const { data: bSeesProfileA } = await b.client.from('profiles').select('id').eq('id', a.id)
  check('B não vê o perfil de A', bSeesProfileA?.length === 0, bSeesProfileA)

  const { data: bCan } = await b.client.rpc('can', { hh: hhA, module: 'transactions', action: 'view' })
  check('can() nega B no household de A', bCan === false, bCan)

  await b.client.from('households').update({ name: 'invadido' }).eq('id', hhA)
  const { data: hhAfter } = await admin.from('households').select('name').eq('id', hhA).single()
  check('B não renomeia o household de A', hhAfter?.name !== 'invadido', hhAfter)

  await a.client.from('permissions').update({ role: 'member' }).eq('household_id', hhA)
  const { data: ownerAfter } = await admin.from('permissions').select('role').eq('household_id', hhA).single()
  check('owner não rebaixa a própria permissão', ownerAfter?.role === 'owner', ownerAfter)

  // --- Fase 2: planejamento ---
  const { data: catsA } = await a.client.from('categories').select('id, kind, subcategories(id)').eq('household_id', hhA)
  check('cadastro semeou 16 categorias padrão', catsA?.length === 16, catsA?.length)
  check('categorias padrão têm subcategorias', catsA?.some((c) => c.subcategories.length > 0))

  const { data: bSeesCatsA } = await b.client.from('categories').select('id').eq('household_id', hhA)
  check('B não vê categorias de A', bSeesCatsA?.length === 0, bSeesCatsA)

  const { error: bInsertCat } = await b.client
    .from('categories')
    .insert({ household_id: hhA, name: 'intrusa', kind: 'expense' })
  check('B não cria categoria no household de A', Boolean(bInsertCat))

  const { data: permsB } = await b.client.from('permissions').select('household_id')
  const hhB = permsB?.[0]?.household_id
  const { error: crossSub } = await b.client
    .from('subcategories')
    .insert({ household_id: hhB, category_id: catsA[0].id, name: 'cruzada' })
  check('subcategoria não aponta para categoria de outro household', Boolean(crossSub))

  const period = '2026-10-01'
  const { error: budgetErr } = await a.client
    .from('category_budgets')
    .upsert({ household_id: hhA, category_id: catsA[0].id, period, amount: 150000 }, { onConflict: 'category_id,period' })
  const { error: budgetErr2 } = await a.client
    .from('category_budgets')
    .upsert({ household_id: hhA, category_id: catsA[0].id, period, amount: 200000 }, { onConflict: 'category_id,period' })
  const { data: budgetRows } = await a.client.from('category_budgets').select('amount').eq('category_id', catsA[0].id)
  check(
    'owner define e atualiza orçamento (upsert)',
    !budgetErr && !budgetErr2 && budgetRows?.length === 1 && budgetRows[0].amount === 200000,
    { budgetErr, budgetErr2, budgetRows },
  )

  const { error: badPeriod } = await a.client
    .from('category_budgets')
    .insert({ household_id: hhA, category_id: catsA[1].id, period: '2026-10-15', amount: 100 })
  check('orçamento exige primeiro dia do mês', Boolean(badPeriod))

  const { data: bSeesBudget } = await b.client.from('category_budgets').select('id').eq('household_id', hhA)
  check('B não vê orçamentos de A', bSeesBudget?.length === 0, bSeesBudget)

  // --- Fase 3: contas e transações ---
  const { data: accs, error: accErr } = await a.client
    .from('bank_accounts')
    .insert([
      { household_id: hhA, name: 'Corrente', initial_balance: 100000, initial_balance_date: '2026-10-01' },
      { household_id: hhA, name: 'Poupança', type: 'savings', initial_balance: 0, initial_balance_date: '2026-10-01' },
    ], { defaultToNull: false })
    .select('id, name')
  check('owner cria contas', !accErr && accs?.length === 2, accErr)
  const [corrente, poupanca] = accs ?? []
  const food = catsA.find((c) => c.subcategories.length > 0)

  const { data: txs, error: txErr } = await a.client
    .from('transactions')
    .insert([
      { household_id: hhA, kind: 'income', amount: 500000, description: 'Salário', occurred_on: '2026-10-05', bank_account_id: corrente.id, status: 'paid' },
      { household_id: hhA, kind: 'expense_variable', amount: 25050, description: 'Mercado', occurred_on: '2026-10-06', bank_account_id: corrente.id, category_id: food.id, subcategory_id: food.subcategories[0].id, status: 'paid' },
      { household_id: hhA, kind: 'expense_fixed', amount: 150000, description: 'Aluguel', occurred_on: '2026-10-10', due_on: '2026-10-10', bank_account_id: corrente.id, status: 'pending' },
      { household_id: hhA, kind: 'transfer', amount: 100000, description: 'Guardar', occurred_on: '2026-10-07', bank_account_id: corrente.id, destination_account_id: poupanca.id, status: 'paid' },
      { household_id: hhA, kind: 'expense_variable', amount: 99999, description: 'Antes do saldo inicial', occurred_on: '2026-09-30', bank_account_id: corrente.id, status: 'paid' },
    ], { defaultToNull: false })
    .select('kind, direction, paid_on')
  check('owner cria transações', !txErr && txs?.length === 5, txErr)
  check('direction é derivada do kind', txs?.find((t) => t.kind === 'income')?.direction === 'inflow' && txs?.find((t) => t.kind === 'transfer')?.direction === 'transfer', txs)
  check('pago sem paid_on recebe a data da transação', txs?.find((t) => t.kind === 'income')?.paid_on === '2026-10-05', txs)

  const { data: balances } = await a.client.from('account_balances').select('*').eq('household_id', hhA)
  const bal = (id) => balances?.find((b) => b.account_id === id)
  // 1000 + 5000 − 250,50 − 1000 (transferência) = 4749,50; pendente −1500 → previsto 3249,50
  check('saldo atual da corrente', bal(corrente.id)?.balance === 474950, bal(corrente.id))
  check('saldo previsto inclui pendentes', bal(corrente.id)?.projected_balance === 324950, bal(corrente.id))
  check('transferência entra na poupança', bal(poupanca.id)?.balance === 100000, bal(poupanca.id))

  const { error: sameAcc } = await a.client.from('transactions').insert({ household_id: hhA, kind: 'transfer', amount: 1, description: 'x', bank_account_id: corrente.id, destination_account_id: corrente.id })
  check('transferência exige contas diferentes', Boolean(sameAcc))

  const other = catsA.find((c) => c.id !== food.id)
  const { error: mismatch } = await a.client.from('transactions').insert({ household_id: hhA, kind: 'expense_variable', amount: 1, description: 'x', category_id: other.id, subcategory_id: food.subcategories[0].id })
  check('subcategoria precisa ser da categoria escolhida', Boolean(mismatch))

  const { error: zero } = await a.client.from('transactions').insert({ household_id: hhA, kind: 'income', amount: 0, description: 'x' })
  check('valor precisa ser positivo', Boolean(zero))

  const { error: delAcc } = await a.client.from('bank_accounts').delete().eq('id', corrente.id)
  check('conta com transações não pode ser excluída', delAcc?.code === '23503', delAcc)

  const { data: bSeesTx } = await b.client.from('transactions').select('id').eq('household_id', hhA)
  const { data: bSeesBal } = await b.client.from('account_balances').select('account_id').eq('household_id', hhA)
  check('B não vê transações nem saldos de A', bSeesTx?.length === 0 && bSeesBal?.length === 0, { bSeesTx, bSeesBal })

  const { error: bTx } = await b.client.from('transactions').insert({ household_id: hhA, kind: 'income', amount: 1, description: 'x' })
  check('B não lança transação em A', Boolean(bTx))

  const { error: crossAcc } = await b.client.from('transactions').insert({ household_id: hhB, kind: 'income', amount: 1, description: 'x', bank_account_id: corrente.id })
  check('transação não usa conta de outro household', Boolean(crossAcc))

  // --- Fase 4: cartões e faturas ---
  const { data: card, error: cardErr } = await a.client
    .from('cards')
    .insert({ household_id: hhA, name: 'Roxinho', closing_day: 3, due_day: 10, credit_limit: 500000 })
    .select('id')
    .single()
  check('owner cria cartão', !cardErr && card, cardErr)

  const { data: buy, error: buyErr } = await a.client
    .from('transactions')
    .insert({ household_id: hhA, kind: 'card_purchase', amount: 20000, description: 'Livro', occurred_on: '2026-10-02', card_id: card.id })
    .select('invoice_id, status')
    .single()
  const { data: octInv } = await a.client.from('card_invoices').select('*').eq('id', buy?.invoice_id ?? '').single()
  check('compra antes do fechamento cai na fatura de outubro', !buyErr && octInv?.reference_month === '2026-10-01' && octInv?.due_on === '2026-10-10', { buyErr, octInv })

  const { data: buy2 } = await a.client
    .from('transactions')
    .insert({ household_id: hhA, kind: 'card_purchase', amount: 5000, description: 'Café', occurred_on: '2026-10-03', card_id: card.id })
    .select('invoice_id')
    .single()
  const { data: novInv } = await a.client.from('card_invoices').select('reference_month').eq('id', buy2?.invoice_id ?? '').single()
  check('compra no dia do fechamento vai para novembro', novInv?.reference_month === '2026-11-01', novInv)

  await a.client.from('transactions').insert({ household_id: hhA, kind: 'card_refund', amount: 3000, description: 'Estorno livro', occurred_on: '2026-10-01', card_id: card.id })

  const { data: planId, error: planErr } = await a.client.rpc('create_installment_purchase', {
    p_card_id: card.id, p_description: 'Geladeira', p_total_amount: 100000, p_installments: 3, p_first_date: '2026-10-05',
  })
  const { data: parcels } = await a.client
    .from('transactions')
    .select('amount, installment_number, description, invoice:card_invoices(reference_month)')
    .eq('installment_plan_id', planId ?? '')
    .order('installment_number')
  check(
    'parcelamento cria 3 parcelas em faturas consecutivas',
    !planErr && parcels?.length === 3 &&
      parcels.map((p) => p.invoice.reference_month).join() === '2026-11-01,2026-12-01,2027-01-01',
    { planErr, parcels },
  )
  check('parcelas somam o total, sobra na 1ª', parcels?.map((p) => p.amount).join() === '33334,33333,33333' && parcels?.[1].description === 'Geladeira (2/3)', parcels)

  const { data: octSummary } = await a.client.from('invoice_summaries').select('*').eq('invoice_id', octInv.id).single()
  check('total da fatura desconta estorno', octSummary?.total === 17000, octSummary)

  const { error: payErr } = await a.client.from('transactions').insert({
    household_id: hhA, kind: 'invoice_payment', amount: 17000, description: 'Fatura', occurred_on: '2026-10-09',
    bank_account_id: corrente.id, invoice_id: octInv.id, status: 'paid',
  })
  const { data: octPaid } = await a.client.from('invoice_summaries').select('paid').eq('invoice_id', octInv.id).single()
  const { data: balAfter } = await a.client.from('account_balances').select('balance').eq('account_id', corrente.id).single()
  check('pagamento quita a fatura (card_id herdado)', !payErr && octPaid?.paid === 17000, { payErr, octPaid })
  check('pagamento sai do saldo da conta; compras no cartão não', balAfter?.balance === 474950 - 17000, balAfter)

  const { error: badBuy } = await a.client.from('transactions').insert({ household_id: hhA, kind: 'card_purchase', amount: 1, description: 'x', card_id: card.id, bank_account_id: corrente.id })
  check('compra no cartão não aceita conta bancária', Boolean(badBuy))
  const { error: noCard } = await a.client.from('transactions').insert({ household_id: hhA, kind: 'card_purchase', amount: 1, description: 'x' })
  check('compra no cartão exige cartão', Boolean(noCard))

  const { data: bSeesInv } = await b.client.from('invoice_summaries').select('invoice_id').eq('household_id', hhA)
  check('B não vê faturas de A', bSeesInv?.length === 0, bSeesInv)
  const { error: bPlan } = await b.client.rpc('create_installment_purchase', {
    p_card_id: card.id, p_description: 'x', p_total_amount: 300, p_installments: 3, p_first_date: '2026-10-05',
  })
  check('B não parcela no cartão de A', Boolean(bPlan))
  const { error: bInv } = await b.client.from('card_invoices').insert({ household_id: hhA, card_id: card.id, reference_month: '2030-01-01', closing_on: '2030-01-03', due_on: '2030-01-10' })
  check('faturas não são criadas manualmente', Boolean(bInv))

  await a.client.from('installment_plans').delete().eq('id', planId)
  const { count: leftParcels } = await a.client.from('transactions').select('*', { count: 'exact', head: true }).eq('installment_plan_id', planId)
  check('excluir parcelamento remove as parcelas', leftParcels === 0, leftParcels)

  // --- Fase 6: recorrências, dívidas, metas, investimentos, desejos ---
  const { data: rec, error: recErr } = await a.client
    .from('recurrences')
    .insert({ household_id: hhA, kind: 'expense_fixed', description: 'Academia', amount: 9990, frequency: 'monthly', start_on: '2026-01-31', bank_account_id: corrente.id })
    .select('id')
    .single()
  check('owner cria recorrência', !recErr, recErr)
  const { data: made, error: matErr } = await a.client.rpc('materialize_recurrences', { hh: hhA, until: '2026-04-30' })
  const { data: occ } = await a.client.from('transactions').select('id, occurred_on, status').eq('recurrence_id', rec.id).order('occurred_on')
  check('gera ocorrências mensais pendentes (31 → fim do mês)', !matErr && made === 4 && occ?.map((o) => o.occurred_on).join() === '2026-01-31,2026-02-28,2026-03-31,2026-04-30' && occ.every((o) => o.status === 'pending'), { matErr, made, occ })

  await a.client.from('transactions').delete().eq('id', occ[1].id)
  const { data: again } = await a.client.rpc('materialize_recurrences', { hh: hhA, until: '2026-05-31' })
  const { data: occ2 } = await a.client.from('transactions').select('occurred_on').eq('recurrence_id', rec.id).order('occurred_on')
  check('ocorrência excluída não volta; só gera as novas', again === 1 && occ2?.length === 4 && !occ2.some((o) => o.occurred_on === '2026-02-28'), { again, occ2 })

  const { data: recCard } = await a.client
    .from('recurrences')
    .insert({ household_id: hhA, kind: 'card_purchase', description: 'Streaming', amount: 3990, start_on: '2026-10-05', card_id: card.id })
    .select('id')
    .single()
  await a.client.rpc('materialize_recurrences', { hh: hhA, until: '2026-11-30' })
  const { data: cardOcc } = await a.client.from('transactions').select('invoice_id, status').eq('recurrence_id', recCard.id)
  check('recorrência no cartão cai nas faturas', cardOcc?.length === 2 && cardOcc.every((o) => o.invoice_id && o.status === 'paid'), cardOcc)

  const { data: debt } = await a.client
    .from('debts')
    .insert({ household_id: hhA, name: 'Financiamento carro', original_amount: 3000000, installment_amount: 100000, total_installments: 30 })
    .select('id')
    .single()
  const { error: debtPayErr } = await a.client.from('transactions').insert({
    household_id: hhA, kind: 'debt_payment', amount: 200000, description: 'Parcelas carro', occurred_on: '2026-10-10',
    bank_account_id: corrente.id, debt_id: debt.id, debt_installments: 2, status: 'paid',
  })
  const { data: debtSum } = await a.client.from('debt_summaries').select('*').eq('debt_id', debt.id).single()
  check('pagamento de dívida soma valor e parcelas', !debtPayErr && debtSum?.paid_amount === 200000 && debtSum?.installments_paid === 2, { debtPayErr, debtSum })
  const { error: debtNoId } = await a.client.from('transactions').insert({ household_id: hhA, kind: 'debt_payment', amount: 1, description: 'x', bank_account_id: corrente.id })
  check('pagamento de dívida exige a dívida', Boolean(debtNoId))

  const { data: inv } = await a.client.from('investments').insert({ household_id: hhA, name: 'CDB' }).select('id').single()
  await a.client.from('transactions').insert({ household_id: hhA, kind: 'investment_contribution', amount: 100000, description: 'Aporte', occurred_on: '2026-10-01', bank_account_id: corrente.id, investment_id: inv.id, status: 'paid' })
  const { data: invSum1 } = await a.client.from('investment_summaries').select('*').eq('investment_id', inv.id).single()
  check('sem cotação, valor atual = aportado', invSum1?.current_value === 100000 && invSum1?.contributed === 100000, invSum1)
  await a.client.from('investment_valuations').insert({ household_id: hhA, investment_id: inv.id, value: 101500, valued_on: '2026-10-31' })
  await a.client.from('transactions').insert({ household_id: hhA, kind: 'investment_contribution', amount: 50000, description: 'Aporte 2', occurred_on: '2026-11-05', bank_account_id: corrente.id, investment_id: inv.id, status: 'paid' })
  const { data: invSum2 } = await a.client.from('investment_summaries').select('*').eq('investment_id', inv.id).single()
  check('valor atual = cotação + aportes posteriores', invSum2?.current_value === 151500 && invSum2?.contributed === 150000, invSum2)

  const { data: goal } = await a.client.from('goals').insert({ household_id: hhA, name: 'Viagem', target_amount: 500000 }).select('id').single()
  await a.client.from('goal_entries').insert([
    { household_id: hhA, goal_id: goal.id, amount: 80000 },
    { household_id: hhA, goal_id: goal.id, amount: -20000 },
  ])
  const { data: goalSum } = await a.client.from('goal_summaries').select('saved_amount').eq('goal_id', goal.id).single()
  check('meta soma guardado − retirado', goalSum?.saved_amount === 60000, goalSum)

  const { data: sec } = await a.client.from('wishlist_sections').insert({ household_id: hhA, name: 'Casa' }).select('id').single()
  const { error: wishErr } = await a.client.from('wishlist_items').insert({ household_id: hhA, section_id: sec.id, name: 'Sofá', price: 250000, url: 'https://exemplo.com/sofa' })
  const { error: badUrl } = await a.client.from('wishlist_items').insert({ household_id: hhA, section_id: sec.id, name: 'x', url: 'javascript:alert(1)' })
  check('lista de desejos aceita item e rejeita URL não-http', !wishErr && Boolean(badUrl), { wishErr })

  const leaks = await Promise.all(
    ['recurrences', 'debts', 'investments', 'goals', 'goal_entries', 'wishlist_items'].map(async (t) => {
      const { data } = await b.client.from(t).select('id').eq('household_id', hhA)
      return data?.length ?? 0
    }),
  )
  check('B não vê nenhum módulo de A', leaks.every((n) => n === 0), leaks)
  const { data: bMat } = await b.client.rpc('materialize_recurrences', { hh: hhA, until: '2027-12-31' })
  check('B não gera recorrências de A', bMat === 0, bMat)

  // --- Fase 7: convites, permissões, pessoas e divisão ---
  const anon = createClient(url, publishable, { auth: { persistSession: false } })
  const { data: membersA } = await a.client.from('household_members').select('id, user_id, relationship').eq('household_id', hhA)
  check('cadastro cria a pessoa titular', membersA?.length === 1 && membersA[0].user_id === a.id && membersA[0].relationship === 'Titular', membersA)

  const { data: invite, error: invErr } = await a.client
    .from('invites')
    .insert({ household_id: hhA, full_name: 'Convidado B', can_view_transactions: true, can_edit_transactions: false })
    .select('token')
    .single()
  check('dono cria convite com token longo', !invErr && invite?.token?.length === 64, invErr)

  const { data: summary } = await anon.rpc('get_invite_summary', { p_token: invite.token })
  check('anônimo vê só o resumo do convite', summary?.[0]?.status === 'valid' && summary[0].invited_by === 'Usuário', summary)
  const { data: anonInvites } = await anon.from('invites').select('token')
  const { data: bInvitesBefore } = await b.client.from('invites').select('token').eq('household_id', hhA)
  check('convites (tokens) não vazam por consulta direta', (anonInvites ?? []).length === 0 && bInvitesBefore?.length === 0)
  const { error: anonAccept } = await anon.rpc('accept_invite', { p_token: invite.token })
  check('anônimo não aceita convite', Boolean(anonAccept))

  const { data: joined, error: acceptErr } = await b.client.rpc('accept_invite', { p_token: invite.token })
  check('B aceita o convite', !acceptErr && joined === hhA, acceptErr)
  const { error: reuse } = await b.client.rpc('accept_invite', { p_token: invite.token })
  check('convite não pode ser reutilizado', reuse?.message === 'invite_already_used', reuse)

  const { data: bSeesTxNow } = await b.client.from('transactions').select('id').eq('household_id', hhA).limit(1)
  check('B (convidado) agora vê as transações de A', bSeesTxNow?.length === 1, bSeesTxNow)
  const { error: bCantEdit } = await b.client.from('transactions').insert({ household_id: hhA, kind: 'income', amount: 1, description: 'x' })
  check('B só com "ver" não lança transação', Boolean(bCantEdit))
  const { data: bSeesInvites } = await b.client.from('invites').select('id').eq('household_id', hhA)
  check('membro não vê convites (só o dono)', bSeesInvites?.length === 0, bSeesInvites)
  const { error: bSelfPromote } = await b.client.from('permissions').update({ can_edit_transactions: true }).eq('household_id', hhA).eq('user_id', b.id)
  const { data: bPerm } = await admin.from('permissions').select('can_edit_transactions').eq('household_id', hhA).eq('user_id', b.id).single()
  check('membro não se dá permissão de editar', bPerm?.can_edit_transactions === false, { bSelfPromote, bPerm })

  await a.client.from('permissions').update({ can_edit_transactions: true }).eq('household_id', hhA).eq('user_id', b.id)
  const { error: bCanNow } = await b.client.from('transactions').insert({ household_id: hhA, kind: 'income', amount: 1, description: 'liberado' })
  check('dono libera edição e B passa a lançar', !bCanNow, bCanNow)

  const { data: members2 } = await a.client.from('household_members').select('id, user_id').eq('household_id', hhA)
  const memberA = members2.find((m) => m.user_id === a.id).id
  const memberB = members2.find((m) => m.user_id === b.id)?.id
  check('aceite cria a pessoa ligada ao usuário B', Boolean(memberB), members2)
  const { data: txForSplit } = await a.client.from('transactions').select('id').eq('household_id', hhA).eq('kind', 'expense_variable').limit(1).single()
  const { error: badSplit } = await a.client.rpc('set_transaction_splits', { p_transaction_id: txForSplit.id, p_splits: [{ member_id: memberA, percentage: 60 }, { member_id: memberB, percentage: 30 }] })
  check('divisão precisa somar 100%', badSplit?.message === 'splits_must_total_100', badSplit)
  const { error: okSplit } = await a.client.rpc('set_transaction_splits', { p_transaction_id: txForSplit.id, p_splits: [{ member_id: memberA, percentage: 60 }, { member_id: memberB, percentage: 40 }] })
  const { data: splits } = await a.client.from('transaction_splits').select('percentage').eq('transaction_id', txForSplit.id)
  check('divisão 60/40 gravada', !okSplit && splits?.length === 2, { okSplit, splits })

  const { data: expiredInv } = await a.client.from('invites').insert({ household_id: hhA, full_name: 'X', expires_at: '2020-01-01' }).select('token').single()
  const { error: expiredErr } = await b.client.rpc('accept_invite', { p_token: expiredInv.token })
  check('convite expirado é recusado', Boolean(expiredErr))

  const { error: leaveErr } = await b.client.from('permissions').delete().eq('household_id', hhA).eq('user_id', b.id)
  const { data: afterLeave } = await b.client.from('transactions').select('id').eq('household_id', hhA).limit(1)
  check('membro pode sair da casa e perde o acesso', !leaveErr && afterLeave?.length === 0, { leaveErr, afterLeave })
  const { error: ownerLeave } = await a.client.from('permissions').delete().eq('household_id', hhA).eq('user_id', a.id)
  const { count: ownerStill } = await admin.from('permissions').select('*', { count: 'exact', head: true }).eq('household_id', hhA).eq('user_id', a.id)
  check('dono não sai da própria casa', ownerStill === 1, { ownerLeave })

  // --- Forma de pagamento, fatura escolhida e fotos ---
  {
    const { data: cardF } = await a.client.from('cards').insert({ household_id: hhA, name: 'F', closing_day: 3, due_day: 10 }).select('id').single()
    // Fatura criada pelo trigger não aparece no retorno do mesmo insert: consulta depois.
    const { data: autoIns } = await a.client
      .from('transactions')
      .insert({ household_id: hhA, kind: 'card_purchase', amount: 100, description: 'auto', occurred_on: '2026-10-02', card_id: cardF.id })
      .select('id')
      .single()
    const { data: auto } = await a.client.from('transactions').select('payment_method, invoice:card_invoices(reference_month)').eq('id', autoIns.id).single()
    check('compra no cartão vira forma "crédito" e fatura automática', auto?.payment_method === 'credit' && auto?.invoice?.reference_month === '2026-10-01', auto)

    const { data: manualIns } = await a.client
      .from('transactions')
      .insert({ household_id: hhA, kind: 'card_purchase', amount: 100, description: 'manual', occurred_on: '2026-10-02', card_id: cardF.id, invoice_month: '2026-12-01' })
      .select('id')
      .single()
    const { data: manual } = await a.client.from('transactions').select('invoice:card_invoices(reference_month, closing_on, due_on)').eq('id', manualIns.id).single()
    check('"Fatura em" escolhida manualmente', manual?.invoice?.reference_month === '2026-12-01' && manual.invoice.closing_on === '2026-12-03' && manual.invoice.due_on === '2026-12-10', manual)

    const { data: planF, error: planFErr } = await a.client.rpc('create_installment_purchase', {
      p_card_id: cardF.id, p_description: 'TV', p_total_amount: 300, p_installments: 3, p_first_date: '2026-10-02', p_first_invoice: '2026-11-01', p_member_id: memberA,
    })
    const { data: parcelsF } = await a.client.from('transactions').select('household_member_id, invoice:card_invoices(reference_month)').eq('installment_plan_id', planF ?? '').order('installment_number')
    check(
      'parcelamento com 1ª fatura escolhida e pessoa',
      !planFErr && parcelsF?.map((p) => p.invoice.reference_month).join() === '2026-11-01,2026-12-01,2027-01-01' && parcelsF.every((p) => p.household_member_id === memberA),
      { planFErr, parcelsF },
    )

    const { error: pixErr } = await a.client.from('transactions').insert({ household_id: hhA, kind: 'expense_variable', amount: 50, description: 'pix', payment_method: 'pix' })
    check('despesa com forma de pagamento pix', !pixErr, pixErr)

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
    const path = `${hhA}/${memberA}/foto.png`
    const { error: upErr } = await a.client.storage.from('avatars').upload(path, png, { contentType: 'image/png', upsert: true })
    check('dono envia foto da pessoa', !upErr, upErr?.message)
    const { error: bUp } = await b.client.storage.from('avatars').upload(`${hhA}/${memberA}/invasao.png`, png, { contentType: 'image/png' })
    check('quem não é da casa não envia foto', Boolean(bUp))
    const { data: bRead } = await b.client.storage.from('avatars').createSignedUrl(path, 60)
    check('quem não é da casa não vê a foto', !bRead?.signedUrl)
    const { data: aRead } = await a.client.storage.from('avatars').createSignedUrl(path, 60)
    check('quem é da casa vê a foto (URL assinada)', Boolean(aRead?.signedUrl))
    const { error: badType } = await a.client.storage.from('avatars').upload(`${hhA}/${memberA}/x.txt`, Buffer.from('oi'), { contentType: 'text/plain' })
    check('só aceita imagem', Boolean(badType))
    await a.client.storage.from('avatars').remove([path])
  }

  // --- Importação de fatura fechada ---
  {
    const { data: cardI } = await a.client.from('cards').insert({ household_id: hhA, name: 'Imp', closing_day: 3, due_day: 10 }).select('id').single()
    const rows = [
      { kind: 'card_purchase', occurred_on: '2026-09-05', description: 'Padaria', amount: 1500, external_id: 'f1' },
      { kind: 'card_purchase', occurred_on: '2026-09-20', description: 'Posto', amount: 20000, external_id: 'f2' },
      { kind: 'card_refund', occurred_on: '2026-09-22', description: 'Estorno', amount: 500, external_id: 'f3' },
    ]
    const { data: r1, error: e1 } = await a.client.rpc('import_card_statement', { p_card_id: cardI.id, p_reference_month: '2026-10-01', p_file_name: 'fatura.ofx', p_rows: rows })
    check('importa fatura (3 linhas, total líquido)', !e1 && r1?.inserted === 3 && r1?.total === 21000, { e1, r1 })
    const { data: invI } = await a.client.from('invoice_summaries').select('total, reference_month').eq('card_id', cardI.id)
    check('lançamentos caem na fatura escolhida', invI?.length === 1 && invI[0].reference_month === '2026-10-01' && invI[0].total === 21000, invI)

    const { data: r2 } = await a.client.rpc('import_card_statement', { p_card_id: cardI.id, p_reference_month: '2026-10-01', p_file_name: 'fatura.ofx', p_rows: rows })
    check('reimportar o mesmo arquivo não duplica', r2?.inserted === 0 && r2?.batch_id === null, r2)

    const { error: bImp } = await b.client.rpc('import_card_statement', { p_card_id: cardI.id, p_reference_month: '2026-10-01', p_file_name: 'x', p_rows: [{ kind: 'card_purchase', occurred_on: '2026-09-01', description: 'x', amount: 1, external_id: 'zz' }] })
    check('quem não é da casa não importa', Boolean(bImp))

    const { error: badKind } = await a.client.rpc('import_card_statement', { p_card_id: cardI.id, p_reference_month: '2026-10-01', p_file_name: 'x', p_rows: [{ kind: 'income', occurred_on: '2026-09-01', description: 'x', amount: 1, external_id: 'k1' }] })
    const { count: incomeOnCard } = await admin.from('transactions').select('*', { count: 'exact', head: true }).eq('card_id', cardI.id).eq('kind', 'income')
    check('só aceita compra/estorno de cartão', incomeOnCard === 0, badKind)

    await a.client.from('import_batches').delete().eq('id', r1.batch_id)
    const { count: left } = await admin.from('transactions').select('*', { count: 'exact', head: true }).eq('card_id', cardI.id)
    check('desfazer importação remove os lançamentos', left === 0, left)
  }

  // --- Exclusão de uma casa com dados de todos os módulos (regressão do bug de FK) ---
  {
    const c = await makeUser('c')
    const { data: pc } = await c.client.from('permissions').select('household_id').single()
    const hc = pc.household_id
    const { data: accC } = await c.client.from('bank_accounts').insert({ household_id: hc, name: 'C' }).select('id').single()
    const { data: cardC } = await c.client.from('cards').insert({ household_id: hc, name: 'C', closing_day: 5, due_day: 15 }).select('id').single()
    await c.client.rpc('create_installment_purchase', { p_card_id: cardC.id, p_description: 'x', p_total_amount: 300, p_installments: 3, p_first_date: '2026-10-01' })
    const { data: debtC } = await c.client.from('debts').insert({ household_id: hc, name: 'd', original_amount: 100 }).select('id').single()
    const { data: invC } = await c.client.from('investments').insert({ household_id: hc, name: 'i' }).select('id').single()
    await c.client.from('transactions').insert([
      { household_id: hc, kind: 'debt_payment', amount: 10, description: 'p', bank_account_id: accC.id, debt_id: debtC.id },
      { household_id: hc, kind: 'investment_contribution', amount: 10, description: 'a', bank_account_id: accC.id, investment_id: invC.id },
    ], { defaultToNull: false })
    await c.client.from('recurrences').insert({ household_id: hc, kind: 'card_purchase', description: 'r', amount: 5, start_on: '2026-10-01', card_id: cardC.id })
    await c.client.rpc('materialize_recurrences', { hh: hc, until: '2026-12-31' })
    const { error: delErr } = await admin.auth.admin.deleteUser(c.id)
    created.splice(created.indexOf(c.id), 1)
    const { count: leftover } = await admin.from('households').select('*', { count: 'exact', head: true }).eq('id', hc)
    check('excluir usuário apaga casa com dados de todos os módulos', !delErr && leftover === 0, delErr?.message)
  }

  // --- Fase 8: resetar ---
  const { error: bReset } = await b.client.rpc('reset_household', { hh: hhA })
  const { count: txBefore } = await admin.from('transactions').select('*', { count: 'exact', head: true }).eq('household_id', hhA)
  check('só o dono reseta a casa', Boolean(bReset) && txBefore > 0, { bReset, txBefore })

  await a.client.from('categories').insert({ household_id: hhA, name: 'Categoria extra' })
  const { error: resetErr } = await a.client.rpc('reset_household', { hh: hhA, keep_categories: false })
  const counts = await Promise.all(
    ['transactions', 'bank_accounts', 'cards', 'debts', 'investments', 'goals', 'recurrences', 'wishlist_sections', 'category_budgets'].map(
      async (t) => (await admin.from(t).select('*', { count: 'exact', head: true }).eq('household_id', hhA)).count,
    ),
  )
  const { count: catsAfter } = await admin.from('categories').select('*', { count: 'exact', head: true }).eq('household_id', hhA)
  const { count: membersAfter } = await admin.from('household_members').select('*', { count: 'exact', head: true }).eq('household_id', hhA)
  check('reset apaga os dados financeiros', !resetErr && counts.every((c) => c === 0), { resetErr, counts })
  check('reset volta as categorias ao padrão e mantém as pessoas', catsAfter === 16 && membersAfter >= 1, { catsAfter, membersAfter })

  const { data: anonRows } = await anon.from('households').select('id')
  check('anônimo não lê households', (anonRows ?? []).length === 0, anonRows)
} catch (error) {
  failures++
  console.error('ERRO', error)
} finally {
  // Excluir o usuário apaga a casa inteira em cascata; falha aqui é bug de FK.
  for (const id of created) {
    const { error } = await admin.auth.admin.deleteUser(id)
    check('usuário de teste excluído (cascata completa)', !error, error?.message)
  }
  console.log(`\nUsuários de teste removidos: ${created.length}. Falhas: ${failures}`)
  process.exit(failures ? 1 : 0)
}
