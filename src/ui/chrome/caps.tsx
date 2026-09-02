import { Text } from 'ink'
import { glyphs } from '../../terminal/glyphs.ts'

export function CapText({ background, top, width }: { background: string; top: boolean; width: number }) {
  if (glyphs.halfBlockCaps) {
    return <Text color={background}>{(top ? glyphs.blockCapTop : glyphs.blockCapBottom).repeat(width)}</Text>
  }
  return <Text backgroundColor={background}>{' '.repeat(width)}</Text>
}
