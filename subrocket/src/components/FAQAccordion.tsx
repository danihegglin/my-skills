import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

type Faq = { question: string; answer: string }

export default function FAQAccordion({ faqs }: { faqs: Faq[] }) {
  return (
    <Accordion type="single" collapsible defaultValue="item-0" className="w-full space-y-3">
      {faqs.map((faq, index) => (
        <AccordionItem
          key={index}
          value={`item-${index}`}
          className="rounded-2xl border border-border bg-card px-6 transition-all last:border-b data-[state=open]:border-primary/30 data-[state=open]:shadow-[0_18px_40px_-28px_rgb(5_61_41/0.45)] hover:border-primary/25"
        >
          <AccordionTrigger className="py-5 font-display text-[1.05rem] font-semibold tracking-tight hover:no-underline [&>svg]:size-5 [&>svg]:text-primary">
            {faq.question}
          </AccordionTrigger>
          <AccordionContent className="pb-6 text-[0.98rem] leading-relaxed text-muted-foreground">{faq.answer}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
