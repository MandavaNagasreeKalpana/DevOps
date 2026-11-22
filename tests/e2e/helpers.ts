import { createClient } from '@supabase/supabase-js'
import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const env = {
  url: process.env.VITE_SUPABASE_URL ?? '',
  key: process.env.VITE_SUPABASE_ANON_KEY ?? '',
  email: process.env.E2E_EMAIL ?? '',
  password: process.env.E2E_PASSWORD ?? '',
}

export const hasE2EEnv = Boolean(env.url && env.key && env.email && env.password)

export const SKIP_MESSAGE =
  'E2E tests skipped: set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, E2E_EMAIL and E2E_PASSWORD (in .env.local or the environment).'

if (!hasE2EEnv) console.warn(`\n${SKIP_MESSAGE}\n`)

export const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')
export const E2E_PREFIX = 'e2e-'

export function uniqueName(ext: string): string {
  return `${E2E_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
}

/** A Supabase client signed in as the test user, used for cleanup and assertions. */
export async function adminClient() {
  const client = createClient(env.url, env.key, { auth: { persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email: env.email, password: env.password })
  if (error) throw new Error(`E2E sign-in failed: ${error.message}`)
  return client
}

/** Remove every file this suite may have left behind (rows and storage objects). */
export async function cleanupE2EFiles() {
  const client = await adminClient()
  const { data } = await client.from('files').select('id, storage_path').like('file_name', `${E2E_PREFIX}%`)
  const rows = data ?? []
  if (rows.length) {
    await client.storage.from('secure-files').remove(rows.map((r) => r.storage_path))
    await client.from('files').delete().in('id', rows.map((r) => r.id))
  }
  await client.auth.signOut()
}

export async function countFilesNamed(fileName: string): Promise<number> {
  const client = await adminClient()
  const { count, error } = await client
    .from('files')
    .select('id', { count: 'exact', head: true })
    .eq('file_name', fileName)
  await client.auth.signOut()
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function login(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(env.email)
  await page.getByLabel(/^Password/).fill(env.password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My Files' })).toBeVisible()
}

/** Upload a fixture under a unique name through the real UI and wait for it to be listed. */
export async function uploadPdf(page: Page): Promise<string> {
  const name = uniqueName('pdf')
  await page.locator('input[type="file"]').setInputFiles({
    name,
    mimeType: 'application/pdf',
    buffer: fs.readFileSync(path.join(FIXTURES, 'sample.pdf')),
  })
  await expect(page.getByText(`Uploaded “${name}”.`)).toBeVisible()
  await expect(rowFor(page, name)).toBeVisible()
  return name
}

export function rowFor(page: Page, name: string) {
  return page.getByRole('row').filter({ hasText: name })
}
