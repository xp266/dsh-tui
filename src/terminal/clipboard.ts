export function writeOsc52(text: string): void {
  const encoded = Buffer.from(text, 'utf8').toString('base64')
  process.stdout.write(`\x1b]52;c;${encoded}\x07`)
}
