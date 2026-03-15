import { useEffect, useRef } from 'react'
import { ChainStep } from './ChainStep'
import { useStore } from '@/store/useStore'

export function ChainTimeline() {
  const chainNodes = useStore((s) => s.chainNodes)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chainNodes])

  if (chainNodes.length === 0) return null

  return (
    <div ref={scrollRef} className="space-y-2 overflow-y-auto">
      {chainNodes.map((node) => (
        <ChainStep key={node.id} node={node} />
      ))}
    </div>
  )
}
