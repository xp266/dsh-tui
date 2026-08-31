import { execFile } from 'node:child_process'
import { platform, release, tmpdir } from 'node:os'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

export function writeOsc52(text: string): void {
  const encoded = Buffer.from(text, 'utf8').toString('base64')
  process.stdout.write(`\x1b]52;c;${encoded}\x07`)
}

export interface ClipboardImage {
  data: Uint8Array
  mediaType: string
}

const EXEC_TIMEOUT_MS = 2000
const MAX_CAPTURE_BYTES = 32 * 1024 * 1024

function capture(command: string, args: string[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout: EXEC_TIMEOUT_MS, maxBuffer: MAX_CAPTURE_BYTES, encoding: 'buffer' }, (error, stdout) => {
      if (error !== null) {
        reject(error)
        return
      }
      if (stdout.length === 0) {
        reject(new Error(`${command} returned nothing`))
        return
      }
      resolve(stdout)
    })
  })
}

async function firstCapture(attempts: Array<{ command: string; args: string[]; mediaType: string }>): Promise<ClipboardImage | undefined> {
  for (const attempt of attempts) {
    try {
      const data = new Uint8Array(await capture(attempt.command, attempt.args))
      return { data, mediaType: attempt.mediaType }
    } catch {}
  }
  return undefined
}

async function firstText(attempts: Array<{ command: string; args: string[] }>): Promise<string | undefined> {
  for (const attempt of attempts) {
    try {
      const data = await capture(attempt.command, attempt.args)
      return data.toString('utf8')
    } catch {}
  }
  return undefined
}

function isWsl(): boolean {
  return platform() === 'linux' && release().toLowerCase().includes('microsoft')
}

export async function readClipboardImage(): Promise<ClipboardImage | undefined> {
  const os = platform()
  if (os === 'darwin') {
    const file = join(tmpdir(), 'dsh-tui-clipboard.png')
    const script = [
      'set imageData to the clipboard as "PNGf"',
      `set fileRef to open for access POSIX file "${file}" with write permission`,
      'set eof fileRef to 0',
      'write imageData to fileRef',
      'close access fileRef',
    ]
    const args: string[] = []
    for (const line of script) args.push('-e', line)
    try {
      await capture('osascript', args)
      const data = new Uint8Array(await readFile(file))
      return { data, mediaType: 'image/png' }
    } catch {
      return undefined
    } finally {
      await rm(file, { force: true }).catch(() => {})
    }
  }
  if (os === 'win32' || isWsl()) {
    const script = 'Add-Type -AssemblyName System.Windows.Forms; $img = [System.Windows.Forms.Clipboard]::GetImage(); if ($img) { $ms = New-Object System.IO.MemoryStream; $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); [Console]::Out.Write([Convert]::ToBase64String($ms.ToArray())) }'
    try {
      const base64 = (await capture('powershell.exe', ['-NonInteractive', '-NoProfile', '-command', script])).toString('utf8').trim()
      if (base64 === '') return undefined
      return { data: new Uint8Array(Buffer.from(base64, 'base64')), mediaType: 'image/png' }
    } catch {
      return undefined
    }
  }
  return firstCapture([
    { command: 'wl-paste', args: ['-t', 'image/png'], mediaType: 'image/png' },
    { command: 'wl-paste', args: ['-t', 'image/jpeg'], mediaType: 'image/jpeg' },
    { command: 'xclip', args: ['-selection', 'clipboard', '-t', 'image/png', '-o'], mediaType: 'image/png' },
    { command: 'xclip', args: ['-selection', 'clipboard', '-t', 'image/jpeg', '-o'], mediaType: 'image/jpeg' },
  ])
}

export async function readClipboardText(): Promise<string | undefined> {
  const os = platform()
  if (os === 'darwin') return firstText([{ command: 'pbpaste', args: [] }])
  if (os === 'win32' || isWsl()) {
    const text = await firstText([{ command: 'powershell.exe', args: ['-NonInteractive', '-NoProfile', '-command', 'Get-Clipboard'] }])
    return text
  }
  return firstText([
    { command: 'wl-paste', args: [] },
    { command: 'xclip', args: ['-selection', 'clipboard', '-o'] },
    { command: 'xsel', args: ['--clipboard', '--output'] },
  ])
}

export async function readClipboardImageUris(): Promise<string[]> {
  if (platform() !== 'linux') return []
  const uris = await firstText([
    { command: 'wl-paste', args: ['-t', 'text/uri-list'] },
    { command: 'xclip', args: ['selection', 'clipboard', '-t', 'text/uri-list', '-o'] },
  ])
  if (uris === undefined) return []
  return uris
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('file://'))
    .map(line => decodeURIComponent(line.slice('file://'.length)))
}
