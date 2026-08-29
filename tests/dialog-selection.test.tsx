import { render } from 'ink-testing-library'
import { Box } from 'ink'
import { afterEach, describe, expect, it } from 'vitest'
import { Dialog } from '../src/ui/dialog/dialog.tsx'
import type { DialogRow } from '../src/ui/dialog/dialog.tsx'
import { clearRowPieces, rowPieces } from '../src/ui/selection-registry.ts'

function rows(): DialogRow[] {
  return [{ items: [{ type: 'button', label: 'row', onPress: () => {} }] }]
}

describe('dialog selection registration', () => {
  afterEach(() => {
    clearRowPieces()
  })

  it('registers row text at the padded content column', () => {
    render(
      <Box width={100} height={24}>
        <Dialog width={60} maxHeight={0.6} title="t" rows={rows()} onClose={() => {}} />
      </Box>,
    )
    const pieces = rowPieces(12)
    const piece = pieces.find(candidate => candidate.text.trim() === 'row')
    expect(piece).toBeDefined()
    expect(piece!.col).toBe(22)
  })
})
