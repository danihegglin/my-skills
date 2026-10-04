import { Avatar, AvatarFallback } from '@/components/ui/avatar'

// Radix compound components must share one React tree, so Avatar + Fallback live together here.
export default function QuoteAvatar({ initials }: { initials: string }) {
  return (
    <Avatar className="size-12 ring-2 ring-mint/50 ring-offset-2 ring-offset-ink">
      <AvatarFallback className="bg-ink-3 font-mono text-sm text-mint">{initials}</AvatarFallback>
    </Avatar>
  )
}
