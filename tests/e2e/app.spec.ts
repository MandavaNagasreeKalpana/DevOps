import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import {
  FIXTURES,
  SKIP_MESSAGE,
  cleanupE2EFiles,
  countFilesNamed,
  env,
  hasE2EEnv,
  login,
  rowFor,
  uniqueName,
  uploadPdf,
} from './helpers'

// Locally, missing credentials skip the suite. In CI that would hide a broken setup behind a green check, so fail instead.
test.skip(!hasE2EEnv && !process.env.CI, SKIP_MESSAGE)

test.describe('Secure File Share', () => {
  test.beforeAll(() => {
    if (process.env.CI && !hasE2EEnv) {
      throw new Error(`E2E credentials are missing in CI. ${SKIP_MESSAGE}`)
    }
  })

  // Every test cleans up after itself so the test account stays empty.
  test.afterEach(async () => {
    await cleanupE2EFiles()
  })

  test('1. unauthenticated users are redirected from the dashboard to /login', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeVisible()
  })

  test('2. wrong password shows an error', async ({ page }) => {
    await page.goto('/login')
    await page.getByLabel('Email').fill(env.email)
    await page.getByLabel(/^Password/).fill(`${env.password}-wrong`)
    await page.getByRole('button', { name: 'Log in', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText(/invalid/i)
    await expect(page).toHaveURL(/\/login$/)
  })

  test('3. login with the test user reaches the dashboard', async ({ page }) => {
    await login(page)
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByText(env.email)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible()
  })

  test('4. uploading a PDF lists it in My Files', async ({ page }) => {
    await login(page)
    const name = await uploadPdf(page)
    const row = rowFor(page, name)
    await expect(row).toContainText('PDF')
    await expect(row).toContainText('KB')
  })

  test('5. a disallowed file type is rejected and nothing is uploaded', async ({ page }) => {
    await login(page)
    const name = `e2e-${Date.now()}-disallowed.exe`
    await page.locator('input[type="file"]').setInputFiles({
      name,
      mimeType: 'application/x-msdownload',
      buffer: fs.readFileSync(path.join(FIXTURES, 'disallowed.exe')),
    })
    await expect(page.getByRole('alert')).toContainText(/unsupported type/i)
    await expect(rowFor(page, name)).toHaveCount(0)
    expect(await countFilesNamed(name)).toBe(0)
  })

  test('6. sharing creates a 5-minute link that serves the file', async ({ page }) => {
    await login(page)
    const name = await uploadPdf(page)
    await rowFor(page, name).getByRole('button', { name: 'Share' }).click()

    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('combobox')).toHaveValue(String(5 * 60))
    await dialog.getByRole('button', { name: 'Generate link' }).click()

    const link = dialog.locator('input[readonly]')
    await expect(link).toHaveValue(/\/storage\/v1\/object\/sign\/secure-files\/.+token=/)
    await expect(dialog.getByText(/^Expires at /)).toBeVisible()

    const url = await link.inputValue()
    const response = await page.request.get(url)
    expect(response.status()).toBe(200)
  })

  test('7. deleting a file removes it from the list', async ({ page }) => {
    await login(page)
    const name = await uploadPdf(page)
    await rowFor(page, name).getByRole('button', { name: 'Delete' }).click()
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click()
    await expect(page.getByText(`Deleted “${name}”.`)).toBeVisible()
    await expect(rowFor(page, name)).toHaveCount(0)
    expect(await countFilesNamed(name)).toBe(0)
  })

  test('8. a ZIP reported as application/x-zip-compressed (Windows) is accepted', async ({ page }) => {
    await login(page)
    const name = uniqueName('zip')
    await page.locator('input[type="file"]').setInputFiles({
      name,
      mimeType: 'application/x-zip-compressed',
      buffer: fs.readFileSync(path.join(FIXTURES, 'sample.zip')),
    })
    await expect(page.getByText(`Uploaded “${name}”.`)).toBeVisible()
    await expect(rowFor(page, name)).toContainText('ZIP')
  })

  test('9. generated links appear in the share history as active', async ({ page }) => {
    await login(page)
    const name = await uploadPdf(page)
    await rowFor(page, name).getByRole('button', { name: 'Share' }).click()

    const dialog = page.getByRole('dialog')
    const history = dialog.getByRole('region', { name: 'Share history' })
    await expect(history).toContainText('hasn’t been shared yet')

    await dialog.getByRole('combobox').selectOption(String(60 * 60))
    await dialog.getByRole('button', { name: 'Generate link' }).click()
    await expect(history.getByRole('listitem')).toHaveCount(1)
    await expect(history.getByRole('listitem').first()).toContainText('Active')
    await expect(history.getByRole('listitem').first()).toContainText('1 h left')
    await expect(history).toContainText('(1 active)')
  })
})
