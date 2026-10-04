import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { nav } from './nav'

export default function MobileNav() {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[85vw] max-w-sm bg-background">
        <SheetHeader>
          <SheetTitle className="font-display text-xl">subrocket</SheetTitle>
          <SheetDescription>Gift checkout, card rescue and self-service for Stripe.</SheetDescription>
        </SheetHeader>
        <nav aria-label="Mobile" className="px-4">
          <ul className="space-y-1">
            {nav.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-3 font-display text-lg font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
          <Separator className="my-6" />
          <a href="/signup" className={cn(buttonVariants({ size: 'lg' }), 'h-12 w-full rounded-full text-base')}>
            Start free trial
          </a>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
