import { useState } from 'react'
import {
  ArrowLeftRight,
  CalendarDays,
  Check,
  CreditCard,
  Gift,
  Lock,
  Mail,
  Pause,
  UserRound,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

const PRICE = 24

const toggleItem =
  'h-9 flex-1 rounded-md border border-border bg-background text-sm font-medium text-muted-foreground first:rounded-l-md last:rounded-r-md data-[state=on]:border-primary data-[state=on]:bg-accent data-[state=on]:text-accent-foreground'

function Checkout() {
  const [gift, setGift] = useState(false)
  const [months, setMonths] = useState('3')
  const total = PRICE * Number(months)

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow text-muted-foreground">Your plan</p>
          <p className="mt-1 font-display text-xl font-semibold">Roast Club, monthly</p>
        </div>
        <p className="font-display text-xl font-semibold">
          ${PRICE}
          <span className="text-sm font-normal text-muted-foreground">/mo</span>
        </p>
      </div>

      <div
        className={cn(
          'flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition-colors',
          gift ? 'border-primary/50 bg-accent' : 'border-border bg-muted/50',
        )}
      >
        <Label htmlFor="gift-toggle" className="flex cursor-pointer items-center gap-2.5 text-sm font-medium">
          <Gift className={cn('size-4', gift ? 'text-accent-foreground' : 'text-muted-foreground')} aria-hidden="true" />
          This is a gift
        </Label>
        <Switch
          id="gift-toggle"
          checked={gift}
          onCheckedChange={setGift}
          className="data-[state=checked]:bg-brand"
        />
      </div>

      <div
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-500',
          gift ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
        )}
        aria-hidden={!gift}
      >
        <div className="overflow-hidden">
          <div className="space-y-3 pb-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="gift-to" className="text-xs text-muted-foreground">Recipient</Label>
                <Input id="gift-to" defaultValue="maya@example.com" tabIndex={gift ? 0 : -1} className="h-9 bg-background" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gift-date" className="text-xs text-muted-foreground">Deliver on</Label>
                <Input id="gift-date" defaultValue="Dec 24" tabIndex={gift ? 0 : -1} className="h-9 bg-background" />
              </div>
            </div>
            <ToggleGroup
              type="single"
              value={months}
              onValueChange={(v) => v && setMonths(v)}
              className="w-full gap-2"
              aria-label="Gift length"
            >
              {['3', '6', '12'].map((m) => (
                <ToggleGroupItem key={m} value={m} tabIndex={gift ? 0 : -1} className={toggleItem}>
                  {m} months
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="h-10 bg-ink font-semibold text-white hover:bg-ink/90">Apple Pay</Button>
        <Button variant="outline" className="h-10 font-semibold">Google Pay</Button>
      </div>
      <div className="relative">
        <CreditCard className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input aria-label="Card number" defaultValue="4242 4242 4242 4242" className="h-10 bg-background pl-9 font-mono text-sm" />
      </div>
      <Button className="h-11 w-full rounded-lg text-[0.95rem] font-semibold">
        {gift ? `Send gift for $${total}` : `Subscribe for $${PRICE}/mo`}
      </Button>
      <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <Lock className="size-3.5" aria-hidden="true" /> Payments processed by Stripe
      </p>
    </div>
  )
}

const rescueSteps = [
  { day: '30 days before', label: 'Email with a one-tap update link', state: 'sent' },
  { day: '7 days before', label: 'Reminder: card still unchanged', state: 'sent' },
  { day: '3 days before', label: 'Card updated. Reminders stop.', state: 'saved' },
  { day: 'Renewal day', label: '$24.00 charged on the new card', state: 'saved' },
] as const

function Rescue() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/50 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-14 items-center justify-center rounded-md bg-gradient-to-br from-brand to-brand-deep font-mono text-[0.65rem] font-medium tracking-widest text-white">VISA</div>
          <div>
            <p className="font-mono text-sm">•••• 0341</p>
            <p className="text-xs text-muted-foreground">Expires 11/26</p>
          </div>
        </div>
        <Badge className="rounded-full border-primary/30 bg-accent text-accent-foreground">
          <Check aria-hidden="true" /> Rescued
        </Badge>
      </div>

      <ol className="relative space-y-5 pl-1 before:absolute before:left-[17px] before:top-3 before:h-[calc(100%-1.5rem)] before:w-px before:bg-gradient-to-b before:from-primary/50 before:to-brand/60">
        {rescueSteps.map((step) => (
          <li key={step.day} className="relative flex gap-4">
            <span
              className={cn(
                'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card',
                step.state === 'sent' ? 'bg-accent text-accent-foreground' : 'bg-brand text-white',
              )}
            >
              {step.state === 'sent' ? <Mail className="size-4" aria-hidden="true" /> : <Check className="size-4" aria-hidden="true" />}
            </span>
            <div className="pt-0.5">
              <p className="eyebrow text-[0.65rem] text-muted-foreground">{step.day}</p>
              <p className="mt-0.5 text-sm font-medium">{step.label}</p>
            </div>
          </li>
        ))}
      </ol>

    </div>
  )
}

const resumeDates: Record<string, string> = { '1': 'Dec 3', '2': 'Jan 3', '3': 'Feb 3' }

function Portal() {
  const [pause, setPause] = useState('2')
  const [cancelling, setCancelling] = useState(false)
  const [paused, setPaused] = useState(false)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <UserRound className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-display text-lg font-semibold leading-tight">Roast Club</p>
            <p className="text-xs text-muted-foreground">$24/mo · Renews Nov 3</p>
          </div>
        </div>
        <Badge variant="outline" className={cn('rounded-full', paused && 'border-primary/30 bg-accent text-accent-foreground')}>
          {paused ? `Paused until ${resumeDates[pause]}` : 'Active'}
        </Badge>
      </div>

      {cancelling ? (
        <div className="rounded-xl border border-primary/30 bg-frost p-4">
          <p className="font-display text-base font-semibold">Before you go</p>
          <p className="mt-1 text-sm text-muted-foreground">Take two months off instead. You won’t be charged while paused.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              className="rounded-full"
              onClick={() => {
                setPause('2')
                setPaused(true)
                setCancelling(false)
              }}
            >
              Pause for 2 months
            </Button>
            <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" onClick={() => setCancelling(false)}>
              Cancel anyway
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-muted/50 p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Pause className="size-4 text-primary" aria-hidden="true" /> Pause deliveries
          </p>
          <ToggleGroup
            type="single"
            value={pause}
            onValueChange={(v) => {
              if (v) {
                setPause(v)
                setPaused(false)
              }
            }}
            className="mt-3 w-full gap-2"
            aria-label="Pause length"
          >
            {['1', '2', '3'].map((m) => (
              <ToggleGroupItem key={m} value={m} className={toggleItem}>
                {m} {m === '1' ? 'month' : 'months'}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">Billing resumes {resumeDates[pause]}.</p>
            <Button size="sm" variant={paused ? 'outline' : 'default'} className="h-8 rounded-full" onClick={() => setPaused(true)}>
              {paused ? 'Paused' : 'Pause'}
            </Button>
          </div>
        </div>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border text-sm">
        <li>
          <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60">
            <ArrowLeftRight className="size-4 text-muted-foreground" aria-hidden="true" /> Switch plan
          </button>
        </li>
        <li>
          <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60">
            <CalendarDays className="size-4 text-muted-foreground" aria-hidden="true" /> Change billing date
          </button>
        </li>
        <li>
          <button
            type="button"
            onClick={() => setCancelling(true)}
            className="flex w-full items-center gap-3 px-4 py-3 text-left text-muted-foreground transition-colors hover:bg-muted/60"
          >
            <X className="size-4" aria-hidden="true" /> Cancel subscription
          </button>
        </li>
      </ul>
    </div>
  )
}

const tabs = [
  { value: 'checkout', label: 'Gift checkout', url: 'pay.roastclub.com', Panel: Checkout },
  { value: 'rescue', label: 'Card rescue', url: 'dashboard.subrocket.com/rescue', Panel: Rescue },
  { value: 'portal', label: 'Self-service', url: 'account.roastclub.com', Panel: Portal },
]

export default function ProductPreview() {
  const [tab, setTab] = useState('checkout')
  const current = tabs.find((t) => t.value === tab) ?? tabs[0]

  return (
    <div className="relative w-full">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-mint via-white/40 to-frost blur-2xl" aria-hidden="true" />
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_40px_80px_-30px_rgb(5_61_41/0.35),0_2px_6px_rgb(5_61_41/0.06)]">
        <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-4 py-2.5">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
            <span className="size-2.5 rounded-full bg-border" />
          </div>
          <div className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-background px-3 py-1 font-mono text-[0.7rem] text-muted-foreground">
            <Lock className="size-3" aria-hidden="true" />
            {current.url}
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab} className="gap-0">
          <div className="px-4 pt-4 sm:px-6">
            <TabsList className="h-10 w-full rounded-full bg-muted p-1">
              {tabs.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="rounded-full text-xs font-medium sm:text-sm data-[state=active]:text-primary data-[state=active]:shadow-sm"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {tabs.map(({ value, Panel }) => (
            <TabsContent
              key={value}
              value={value}
              className="min-h-[25rem] p-4 pt-5 animate-in fade-in-0 slide-in-from-bottom-1 duration-300 sm:p-6 sm:pt-6"
            >
              <Panel />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  )
}
