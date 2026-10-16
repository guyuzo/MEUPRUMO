// Aplica supabase/migrations no banco remoto usando SUPABASE_DB_URL do .env.local.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

if (existsSync('.env.local')) process.loadEnvFile('.env.local')

const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl) {
  console.error('Defina SUPABASE_DB_URL em .env.local (veja .env.example).')
  process.exit(1)
}

const extra = process.argv.slice(2)
const result = spawnSync('npx', ['-y', 'supabase@2', 'db', 'push', '--db-url', dbUrl, ...extra], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
})
process.exit(result.status ?? 1)
