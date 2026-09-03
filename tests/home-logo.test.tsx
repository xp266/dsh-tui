import { describe, expect, it } from 'vitest'
import { render } from 'ink-testing-library'
import { homeLogoLineColors, homeLogoMetrics, mixHex, currentHomeLogo, registerHomeLogo } from '../src/ui/home-logo.ts'
import { MessageList } from '../src/ui/message/message-list.tsx'

describe('home logo registry', () => {
  it('provides the builtin artwork', () => {
    const logo = currentHomeLogo()
    expect(logo).toBeDefined()
    expect(logo!.lines).toHaveLength(8)
    expect(logo!.lines[5]).toContain('█▄▄▄█')
  })

  it('lets a plugin override the logo and restores the previous one on dispose', () => {
    const builtin = currentHomeLogo()!.lines
    const dispose = registerHomeLogo({ id: 'custom', order: 50, lines: ['CUSTOM', 'ART'] })
    expect(currentHomeLogo()!.lines).toEqual(['CUSTOM', 'ART'])
    dispose()
    expect(currentHomeLogo()!.lines).toEqual(builtin)
  })
})

describe('home logo geometry', () => {
  it('derives the extent from the actual artwork', () => {
    const metrics = homeLogoMetrics(['a  ', '長', ''])
    expect(metrics.rows).toBe(3)
    expect(metrics.columns).toBe(2)
  })

  it('normalizes trailing whitespace when measuring', () => {
    const trailing = currentHomeLogo()!
    const raw = homeLogoMetrics(trailing.lines)
    const trimmed = homeLogoMetrics(trailing.lines.map(line => line.trimEnd()))
    expect(trimmed).toEqual(raw)
  })
})

describe('home logo gradient', () => {
  it('mixes hex colors linearly', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080')
    expect(mixHex('#ff0000', '#000000', 0.5)).toBe('#800000')
  })

  it('clamps the gradient step into [0, 1]', () => {
    expect(mixHex('#000000', '#ffffff', -1)).toBe('#000000')
    expect(mixHex('#000000', '#ffffff', 2)).toBe('#ffffff')
  })

  it('spans from the top color to the bottom color one shade per row', () => {
    const colors = homeLogoLineColors(['a', 'b', 'c', 'd', 'e'], '#000000', '#ffffff')
    expect(colors).toHaveLength(5)
    expect(colors[0]).toBe('#000000')
    expect(colors[4]).toBe('#ffffff')
    expect(colors).toEqual(['#000000', '#404040', '#808080', '#bfbfbf', '#ffffff'])
  })

  it('renders the artwork only when the surface fits', () => {
    const ok = render(<MessageList messages={[]} height={12} width={80} scrollTop={0} onScroll={() => {}} />)
    expect(ok.lastFrame() ?? '').toContain('█▄▄▄█')
    ok.unmount()

    const tight = render(<MessageList messages={[]} height={3} width={80} scrollTop={0} onScroll={() => {}} />)
    expect(tight.lastFrame() ?? '').not.toMatch(/[█▄▀]/)
    tight.unmount()
  })

  it('withholds the logo once chat content exists', async () => {
    const withContent = render(
      <MessageList messages={[{ kind: 'bubble', id: 'u1', role: 'user', content: 'hello' }]} height={12} width={80} scrollTop={0} onScroll={() => {}} />,
    )
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(withContent.lastFrame() ?? '').toContain('hello')
    expect(withContent.lastFrame() ?? '').not.toMatch(/[█▄▀]/)
    withContent.unmount()
  })
})