import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'

type Faq = { question: string; answer: string }

export default function FAQAccordion({ faqs }: { faqs: Faq[] }) {
  return (
    <Accordion type="single" collapsible className="w-full space-y-3">
      {faqs.map((faq, index) => (
        <AccordionItem
          key={index}
          value={`item-${index}`}
          className="rounded-xl border border-border bg-ink px-6 transition-colors last:border-b data-[state=open]:border-signal/50 hover:border-white/20"
        >
          <AccordionTrigger className="py-5 font-display text-lg font-bold hover:no-underline [&>svg]:size-5 [&>svg]:text-signal">
            {faq.question}
          </AccordionTrigger>
          <AccordionContent className="pb-6 text-base leading-relaxed text-haze">{faq.answer}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
