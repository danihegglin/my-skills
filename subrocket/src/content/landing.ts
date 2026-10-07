/*
 * All copy for the subrocket landing page, in reading order.
 * Edit words here; the components only handle layout.
 *
 * Statistics cite `sources` by number. Keep every number sourced.
 * [NEED] markers are gaps to fill before launch. Never replace them with invented proof.
 */

export const site = {
  name: 'subrocket',
  email: 'hello@subrocket.com',
}

export const meta = {
  title: 'subrocket: more sales and less churn for subscription boxes',
  description:
    'Box checkout with gifting, expiring-card rescue and skip-a-month for craft beer clubs, beauty boxes and every subscription on Stripe. Free to use, $0.10 per transaction.',
}

export const cta = {
  primary: { label: 'Start for free', href: '/signup' },
  secondary: { label: 'Book a demo', href: '/demo' },
  reassurance: 'Free to use. $0.10 per transaction.',
}

export const nav = [
  { label: 'Gifts', href: '#gifts' },
  { label: 'Card rescue', href: '#rescue' },
  { label: 'Skips', href: '#skips' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
]

export const hero = {
  eyebrow: 'For subscription boxes on Stripe',
  headline: ['Sell more boxes.', 'Lose fewer subscribers.'],
  subhead:
    'subrocket gives your Stripe subscriptions a proper box checkout with gifting, expiring-card rescue and skip-a-month. Made for craft beer clubs, beauty boxes and anything else that ships every month.',
  perks: ['Free to use', '$0.10 per transaction', 'Subscribers stay in Stripe'],
  demoHint: 'Try it: change the box size, tick “This is a gift”, or press cancel.',
}

export const niches = {
  label: 'Made for boxes that ship',
  items: ['Craft beer clubs', 'Beauty & cosmetics', 'Coffee', 'Wine', 'Pet food', 'Snacks'],
  tail: 'If it renews on Stripe and arrives in a box, it fits.',
}

export const leaks = {
  heading: 'Three places box revenue leaks out',
  body: 'Gifts you never get to sell. Cards that expire without anyone noticing. Subscribers who cancel because the fridge is already full. subrocket closes each one, and each one works on its own.',
}

export const chapters = [
  {
    id: 'gifts',
    number: '01',
    tag: 'Sell',
    stamp: 'Gifted',
    title: 'A box checkout that sells gifts too',
    body: 'Subscribers pick the box size, how often it ships and when the first one arrives, then pay with Apple Pay, Google Pay or card. Tick “This is a gift” and the buyer prepays 3, 6 or 12 boxes instead. On the delivery date the recipient gets a claim link, and can add their own card to keep the boxes coming.',
    points: ['Box size, frequency and first delivery date', 'Prepaid 3, 6 or 12-box gifts with a claim link', 'Apple Pay and Google Pay built in'],
    stat: { value: '53%', label: 'of shoppers want to give a subscription as a gift. Only 27% ever have.', source: 1 },
  },
  {
    id: 'rescue',
    number: '02',
    tag: 'Rescue',
    stamp: 'Saved',
    title: 'Fix the card before the box can’t ship',
    body: 'Most subscribers who churn never decided to leave. Their card expired. subrocket emails each customer 30, 7 and 1 day before their card expires, with a one-tap link to update it. The reminders stop the moment the card changes.',
    points: ['One-tap card update, handled by Stripe', 'Reminders stop once the card changes', 'Every save shows up in your reports'],
    stat: { value: '53%', label: 'of subscription churn comes from failed payments, not from people choosing to leave.', source: 3 },
  },
  {
    id: 'skips',
    number: '03',
    tag: 'Keep',
    stamp: 'Skipped',
    title: 'Offer a skip before the cancel button',
    body: 'A fridge full of IPA or a shelf of unopened serum is a reason to pause, not to leave. When a subscriber presses cancel, subrocket offers to skip 1, 2 or 3 boxes first. If they still want to go, cancelling takes one more click.',
    points: ['Skip 1, 2 or 3 boxes', 'Switch plan or change the billing date', 'Cancel stays one click away'],
    stat: { value: '9.6%', label: 'of cancellations saved on average by offering a pause, across 1,700+ merchants.', source: 4 },
  },
] as const

export const checkoutNote = { text: 'Apple Pay at checkout lifts conversion by 22% on average.', source: 2 }

export const pricing = {
  heading: ['Free to use.', '10¢ per transaction.'],
  body: 'No monthly fee, no tiers, no share of your revenue. subrocket charges a fixed $0.10 on each transaction it handles. Stripe’s own processing fees stay exactly as they are today.',
  example: { label: 'On a $39 box', value: '$0.10', note: 'about 0.26% of the order' },
  includedLabel: 'Every feature, on every account',
  included: ['Box checkout with gifting', 'Expiring-card rescue', 'Skips and account page', 'Webhooks and churn reports'],
}

export const setup = {
  heading: 'Live in an afternoon',
  body: 'No changes to your Stripe products, prices or existing subscribers.',
  steps: [
    { title: 'Connect Stripe', body: 'Products and prices import on their own.' },
    { title: 'Choose what to switch on', body: 'Box checkout, card rescue, skips. Any one, or all three.' },
    { title: 'Swap two links', body: 'Point your Subscribe button and account page at subrocket. That’s the install.' },
  ],
}

export const trust = {
  heading: 'Your subscribers stay in Stripe',
  body: 'subrocket works on top of the Stripe account you already have. Nothing to migrate, and nothing stuck with us if you leave.',
  items: [
    { icon: 'database', title: 'Data stays put', body: 'Customers, prices and invoices live in your Stripe account. Disconnect and nothing moves.' },
    { icon: 'lock', title: 'Cards never touch us', body: 'Card details are collected and stored by Stripe. subrocket never sees full card numbers.' },
    { icon: 'webhook', title: 'Webhooks for every event', body: 'Gifts, rescues and skips fire webhooks, so your fulfilment tools stay in sync.' },
    { icon: 'chart', title: 'Churn and save reports', body: 'See how many boxes each feature kept shipping, month by month.' },
  ],
} as const

// [NEED: 2-3 real customer quotes with name, role, company, photo and a number, e.g. boxes saved per month.]
// The section renders only when this list has entries. Do not add sample quotes.
export const testimonials: { quote: string; name: string; role: string; company: string }[] = []

export const faq = {
  heading: 'Questions',
  contact: 'Anything else? Write to',
  items: [
    { q: 'Do I have to leave Stripe?', a: 'No. Customers, prices and invoices stay in your Stripe account. Disconnect any time and everything is still there.' },
    { q: 'Which businesses is subrocket for?', a: 'Subscription boxes billed through Stripe: craft beer and wine clubs, beauty and cosmetics boxes, coffee, pet food, snacks. If it ships on a schedule, it fits.' },
    { q: 'How do gift subscriptions work?', a: 'The buyer prepays 3, 6 or 12 boxes and picks a delivery date. On that date the recipient gets a claim link and can add a card to keep the boxes coming.' },
    { q: 'When do card update emails go out?', a: '30, 7 and 1 day before a card expires. They stop as soon as the card changes.' },
    { q: 'Can customers still cancel?', a: 'Always, in one click after the skip offer. Making cancelling hard costs you trust, and auto-renewal laws in many places require an easy online cancel.' },
    { q: 'Is payment data safe?', a: 'Card details are collected and stored by Stripe. subrocket never sees full card numbers.' },
    { q: 'What does it cost?', a: 'Nothing up front and no monthly fee. subrocket takes a fixed $0.10 per transaction. Stripe’s usual processing fees apply, exactly as they do today.' },
  ],
}

export const finalCta = {
  heading: 'Keep every box shipping.',
  body: 'Free to start. Switch on the checkout, card rescue or skips today, and the rest when you’re ready.',
}

export const footer = {
  blurb: 'Box checkout with gifting, card rescue and skip-a-month for subscription boxes on Stripe.',
  // [NEED: these pages don't exist yet. /privacy, /terms, /dpa and /imprint are required before launch.]
  columns: [
    { title: 'Product', links: [{ label: 'Checkout & gifts', href: '/#gifts' }, { label: 'Card rescue', href: '/#rescue' }, { label: 'Skips', href: '/#skips' }, { label: 'Pricing', href: '/#pricing' }] },
    { title: 'Company', links: [{ label: 'About', href: '/about' }, { label: 'Blog', href: '/blog' }, { label: 'Contact', href: 'mailto:hello@subrocket.com' }] },
    { title: 'Legal', links: [{ label: 'Privacy policy', href: '/privacy' }, { label: 'Terms of service', href: '/terms' }, { label: 'Data processing', href: '/dpa' }, { label: 'Imprint', href: '/imprint' }] },
  ],
  disclaimer: 'Stripe is a trademark of Stripe, Inc. subrocket is an independent product.',
}

export const sources = [
  { label: 'Recurly, Holiday subscription trends 2023: 53% of shoppers want to give a subscription, 27% have', href: 'https://recurly.com/blog/holiday-subscription-trends-consumer-report/' },
  { label: 'Stripe, payment method study: 22.3% average conversion lift when offering Apple Pay', href: 'https://stripe.com/blog/testing-the-conversion-impact-of-50-plus-global-payment-methods' },
  { label: 'Recurly, churn rate guide: 53% of churn is involuntary', href: 'https://recurly.com/blog/churn-rate-guide/' },
  { label: 'Recharge: 9.6% average save rate across 1,700+ merchants offering pause', href: 'https://getrecharge.com/blog/reduce-your-cancellations-by-10-with-pause-subscriptions/' },
]
