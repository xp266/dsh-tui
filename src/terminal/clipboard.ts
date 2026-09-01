import { execFile, spawn } from 'node:child_process'
import { platform, release, tmpdir } from 'node:os'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'

export function writeOsc52(text: string): void {
  const encoded = Buffer.from(text, 'utf8').toString('base64')
  process.stdout.write(`\x1b]52;c;${encoded}\x07`)
}

/**
 * clip.exe reads its stdin in the console codepage (GBK on Chinese Windows),
 * which turns UTF-8 bytes into mojibake. A UTF-16LE stream with a BOM is
 * detected as wide text and stored verbatim.
 */
export function clipExeInput(text: string): Buffer {
  return Buffer.from(`\ufeff${text}`, 'utf16le')
}

export function isWsl(): boolean {
  if (platform() !== 'linux') return false
  return release().toLowerCase().includes('microsoft')
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


async function readClipboardImageBuiltin(): Promise<ClipboardImage | undefined> {
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

async function readClipboardTextBuiltin(): Promise<string | undefined> {
  const os = platform()
  if (os === 'darwin') return firstText([{ command: 'pbpaste', args: [] }])
  if (os === 'win32' || isWsl()) {
    const text = await firstText([{ command: 'powershell.exe', args: ['-NonInteractive', '-NoProfile', '-command', '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard'] }])
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

import { clipboardReadImage, clipboardReadText, clipboardWriteText } from './clipboard-backends.ts'

/** Backend-chain-aware clipboard read; plugin backends run first. */
export async function readClipboardText(): Promise<string | undefined> {
  return clipboardReadText(readClipboardTextBuiltin)
}

/** Backend-chain-aware image read; plugin backends run first. */
export async function readClipboardImage(): Promise<ClipboardImage | undefined> {
  return clipboardReadImage(readClipboardImageBuiltin)
}

/** Backend-chain-aware write; the first backend claiming the write stops the chain. */
export function writeClipboardText(text: string): void {
  clipboardWriteText(text, writeOsc52WithFallback)
}

function writeOsc52WithFallback(text: string): void {
  writeOsc52(text)
  spawnSystemWriters(text)
}

function spawnSystemWriters(text: string): void {
  const commands: Array<{ command: string; args: string[]; utf16?: boolean }> = []
  if (platform() === 'darwin') {
    commands.push({ command: 'pbcopy', args: [] })
  } else if (platform() === 'linux') {
    if (isWsl()) commands.push({ command: 'clip.exe', args: [], utf16: true })
    else {
      commands.push({ command: 'wl-copy', args: [] })
      commands.push({ command: 'xclip', args: ['-selection', 'clipboard'] })
    }
  } else if (platform() === 'win32') {
    commands.push({ command: 'clip', args: [], utf16: true })
  }
  for (const entry of commands) {
    try {
      const child = spawn(entry.command, entry.args, { stdio: ['pipe', 'ignore', 'ignore'] })
      child.on('error', () => {})
      child.stdin.end(entry.utf16 ? clipExeInput(text) : text)
    } catch {
      // best-effort only; OSC52 already handled the capable terminals
    }
  }
}
