import { useEffect, useState } from 'react'
import { useStdout } from 'ink'

export function useTerminalSize(): { columns: number; rows: number } {
  const { stdout } = useStdout()
  const [columns, setColumns] = useState(stdout?.columns ?? 80)
  const [rows, setRows] = useState(stdout?.rows ?? 24)
  useEffect(() => {
    if (!stdout) return
    const onResize = () => {
      setColumns(stdout.columns)
      setRows(stdout.rows)
    }
    stdout.on('resize', onResize)
    return () => {
      stdout.off('resize', onResize)
    }
  }, [stdout])
  return { columns, rows }
}