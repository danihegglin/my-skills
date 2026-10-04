import { Avatar, AvatarFallback } from '@/components/ui/avatar'

// Radix compound components must share one React tree, so Avatar + Fallback live together here.
export default function QuoteAvatar({ initials }: { initials: string }) {
  return (
    <Avatar className="size-11 ring-2 ring-white">
      <AvatarFallback className="bg-pop-soft font-mono text-xs font-medium text-accent-foreground">
        {initials}
      </AvatarFallback>
    </Avatar>
  )
}
