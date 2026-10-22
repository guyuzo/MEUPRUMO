import { createFileRoute } from '@tanstack/react-router'
import { TransactionsScreen, transactionsSearchSchema } from '@/routes/_authenticated/transactions'

export const Route = createFileRoute('/_authenticated/income')({
  validateSearch: transactionsSearchSchema,
  component: IncomePage,
})

function IncomePage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <TransactionsScreen
      scope="income"
      search={search}
      setSearch={(patch) => navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true })}
    />
  )
}
