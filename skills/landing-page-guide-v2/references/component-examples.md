# Landing Page Component Examples

This reference provides complete, production-ready component implementations for **Astro** using ShadCN UI.

**How ShadCN works in Astro:** ShadCN components are React components (via `@astrojs/react`). Used inside `.astro` files *without* a `client:*` directive, they render to static HTML at build time and ship **zero JavaScript**. Only components that need interactivity (e.g. the FAQ accordion) are wrapped in a small React island and hydrated with `client:visible`.

**Syntax reminders:**
- Plain HTML elements in `.astro` files use `class`; React (ShadCN) components take `className`.
- Icons come from `@lucide/astro` (Astro components, use `class`).
- No `key` prop is needed when mapping in `.astro` templates.

## Hero Section (Elements 1-5)

```astro
---
// src/components/Hero.astro
import { Image } from 'astro:assets'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ArrowRight, Play } from '@lucide/astro'
import dashboardPreview from '@/assets/dashboard-preview.jpg'
---

<section class="relative min-h-screen flex items-center justify-center bg-gradient-to-b from-blue-50 to-white overflow-hidden">
  <!-- Background decorations -->
  <div class="absolute inset-0 -z-10">
    <div class="absolute top-20 left-10 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob" />
    <div class="absolute top-40 right-10 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000" />
  </div>

  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
    <div class="grid lg:grid-cols-2 gap-12 items-center">
      <!-- Left Content -->
      <div class="space-y-8">
        <!-- Badge for announcement -->
        <Badge variant="secondary" className="w-fit">
          🎉 신규 기능 출시 - AI 자동화 업데이트
        </Badge>

        <!-- Element 3: SEO Optimized Title -->
        <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight">
          팀 협업을{' '}
          <span class="text-blue-600 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
            10배 빠르게
          </span>
          <br />
          만드는 프로젝트 관리 도구
        </h1>

        <!-- Subtitle -->
        <p class="text-lg sm:text-xl text-gray-600 leading-relaxed max-w-2xl">
          복잡한 프로젝트도 간단하게, 모든 팀원이 하나로 연결되는 워크스페이스
        </p>

        <!-- Element 4: Primary CTA with ShadCN Button (static, zero JS) -->
        <div class="flex flex-col sm:flex-row gap-4">
          <Button size="lg" className="text-lg px-8 py-6 shadow-lg hover:shadow-xl transition-all">
            무료로 시작하기
            <ArrowRight class="ml-2 h-5 w-5" />
          </Button>
          <Button size="lg" variant="outline" className="text-lg px-8 py-6">
            <Play class="mr-2 h-5 w-5" />
            데모 보기
          </Button>
        </div>

        <!-- Element 5: Social Proof -->
        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-6 pt-4">
          <div class="flex items-center gap-2">
            <div class="flex">
              {[...Array(5)].map(() => (
                <svg class="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                  <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                </svg>
              ))}
            </div>
            <span class="text-sm font-medium text-gray-600">5.0 (2,341 리뷰)</span>
          </div>
          <div class="h-4 w-px bg-gray-300 hidden sm:block" />
          <div class="text-gray-600">
            <span class="font-bold text-gray-900">5,000+</span> 개 팀이 사용 중
          </div>
        </div>

        <!-- Trusted by logos -->
        <div class="pt-8 border-t">
          <p class="text-sm text-gray-500 mb-4">신뢰하는 기업들</p>
          <div class="flex flex-wrap gap-8 items-center opacity-60 grayscale hover:grayscale-0 transition-all">
            <!-- Company logos -->
          </div>
        </div>
      </div>

      <!-- Right Content - Element 6: Image/Video -->
      <div class="relative">
        <div class="relative rounded-2xl overflow-hidden shadow-2xl ring-1 ring-gray-900/10">
          <!-- Above the fold: load eagerly with high priority -->
          <Image
            src={dashboardPreview}
            alt="프로젝트 관리 대시보드 미리보기"
            width={1200}
            loading="eager"
            fetchpriority="high"
            class="w-full h-auto"
          />
          <!-- Play button overlay -->
          <Button
            size="lg"
            className="absolute inset-0 m-auto w-fit h-fit rounded-full p-6"
            variant="secondary"
          >
            <Play class="h-8 w-8 fill-current" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</section>
```

## Benefits Section (Element 7)

```astro
---
// src/components/Benefits.astro
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Clock, DollarSign, Zap, Shield, Users, Rocket } from '@lucide/astro'

const benefits = [
  {
    icon: Clock,
    title: '시간 절약',
    description: '복잡한 작업을 자동화하여 하루 2시간을 절약하세요',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
  },
  {
    icon: DollarSign,
    title: '비용 절감',
    description: '월 평균 30% 운영 비용을 줄일 수 있습니다',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
  },
  {
    icon: Zap,
    title: '간편한 사용',
    description: '설치 5분, 바로 시작할 수 있는 직관적인 인터페이스',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
  },
  {
    icon: Shield,
    title: '안전한 보안',
    description: '엔터프라이즈급 보안으로 데이터를 안전하게 보호합니다',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
  },
  {
    icon: Users,
    title: '팀 협업',
    description: '실시간 협업으로 팀의 생산성을 극대화하세요',
    color: 'text-pink-600',
    bgColor: 'bg-pink-50',
  },
  {
    icon: Rocket,
    title: '빠른 성장',
    description: '확장 가능한 인프라로 비즈니스 성장을 지원합니다',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
  },
]
---

<section class="py-20 bg-gray-50">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-16">
      <h2 class="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
        왜 우리 제품을 선택해야 할까요?
      </h2>
      <p class="text-lg text-gray-600 max-w-2xl mx-auto">
        업계 최고의 기능과 서비스로 여러분의 성공을 지원합니다
      </p>
    </div>

    <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {benefits.map((benefit) => (
        <Card className="hover:shadow-lg transition-all duration-300 border-none">
          <CardHeader>
            <div class={`w-12 h-12 rounded-lg ${benefit.bgColor} flex items-center justify-center mb-4`}>
              <benefit.icon class={`w-6 h-6 ${benefit.color}`} />
            </div>
            <CardTitle className="text-xl">{benefit.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription className="text-base">
              {benefit.description}
            </CardDescription>
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
</section>
```

## Testimonials Section (Element 8)

```astro
---
// src/components/Testimonials.astro
import { Card, CardContent } from '@/components/ui/card'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Quote } from '@lucide/astro'

const testimonials = [
  {
    name: '김민수',
    role: 'CEO',
    company: '테크스타트업',
    image: '/testimonials/person1.jpg',
    rating: 5,
    content: '이 제품을 사용한 후 업무 효율이 3배 향상되었습니다. 정말 놀라운 변화였어요!',
  },
  {
    name: '이지은',
    role: 'Product Manager',
    company: '글로벌IT',
    image: '/testimonials/person2.jpg',
    rating: 5,
    content: '팀 협업이 이렇게 쉬울 수 있다는 걸 처음 알았습니다. 강력 추천합니다!',
  },
  {
    name: '박준호',
    role: 'CTO',
    company: '핀테크코리아',
    image: '/testimonials/person3.jpg',
    rating: 5,
    content: '기술 지원팀의 빠른 대응과 안정적인 서비스에 매우 만족하고 있습니다.',
  },
]
---

<section class="py-20 bg-white">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-16">
      <Badge variant="secondary" className="mb-4">
        ⭐ 고객 후기
      </Badge>
      <h2 class="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
        고객들의 이야기
      </h2>
      <p class="text-lg text-gray-600 max-w-2xl mx-auto">
        5,000개 이상의 팀이 우리 제품으로 성공하고 있습니다
      </p>
    </div>

    <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
      {testimonials.map((testimonial) => (
        <Card className="hover:shadow-lg transition-all duration-300">
          <CardContent className="pt-6">
            <Quote class="w-8 h-8 text-blue-600 mb-4 opacity-50" />

            <!-- Rating -->
            <div class="flex mb-4">
              {[...Array(testimonial.rating)].map(() => (
                <svg class="w-5 h-5 text-yellow-400 fill-current" viewBox="0 0 20 20">
                  <path d="M10 15l-5.878 3.09 1.123-6.545L.489 6.91l6.572-.955L10 0l2.939 5.955 6.572.955-4.756 4.635 1.123 6.545z" />
                </svg>
              ))}
            </div>

            <!-- Content -->
            <p class="text-gray-700 mb-6 leading-relaxed">
              "{testimonial.content}"
            </p>

            <!-- Author -->
            <div class="flex items-center gap-3 pt-4 border-t">
              <Avatar>
                <AvatarImage src={testimonial.image} alt={testimonial.name} />
                <AvatarFallback>{testimonial.name.charAt(0)}</AvatarFallback>
              </Avatar>
              <div>
                <p class="font-semibold text-gray-900">{testimonial.name}</p>
                <p class="text-sm text-gray-600">
                  {testimonial.role}, {testimonial.company}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  </div>
</section>
```

## FAQ Section (Element 9)

The accordion needs client-side state, so it lives in a small React island. The surrounding section stays a static `.astro` component.

```tsx
// src/components/FAQAccordion.tsx (React island)
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

type Faq = { question: string; answer: string }

export default function FAQAccordion({ faqs }: { faqs: Faq[] }) {
  return (
    <Accordion type="single" collapsible className="w-full space-y-4">
      {faqs.map((faq, index) => (
        <AccordionItem
          key={index}
          value={`item-${index}`}
          className="bg-white rounded-lg border px-6"
        >
          <AccordionTrigger className="text-left hover:no-underline">
            <span className="font-semibold text-lg pr-4">{faq.question}</span>
          </AccordionTrigger>
          <AccordionContent className="text-gray-600 text-base leading-relaxed">
            {faq.answer}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
```

```astro
---
// src/components/FAQ.astro
import { Badge } from '@/components/ui/badge'
import FAQAccordion from './FAQAccordion'

const faqs = [
  {
    question: '무료 체험 기간은 얼마나 되나요?',
    answer: '14일간 무료로 모든 기능을 체험하실 수 있습니다. 신용카드 등록 없이 바로 시작하세요.',
  },
  {
    question: '계약 기간 없이 이용할 수 있나요?',
    answer: '네, 월 단위 구독으로 언제든지 취소가 가능합니다. 장기 계약 의무는 없습니다.',
  },
  {
    question: '다른 플랫폼과의 차이점은 무엇인가요?',
    answer: '직관적인 UI, 강력한 자동화 기능, 그리고 24/7 고객 지원이 우리의 강점입니다.',
  },
]
---

<section class="py-20 bg-gray-50">
  <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
    <div class="text-center mb-12">
      <Badge variant="secondary" className="mb-4">
        ❓ FAQ
      </Badge>
      <h2 class="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
        자주 묻는 질문
      </h2>
      <p class="text-lg text-gray-600">
        궁금하신 점이 있으시면 언제든지 문의해 주세요
      </p>
    </div>

    <!-- Hydrate only when the FAQ scrolls into view -->
    <FAQAccordion client:visible faqs={faqs} />
  </div>
</section>
```

## Final CTA Section (Element 10)

```astro
---
// src/components/FinalCTA.astro
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowRight, CircleCheck } from '@lucide/astro'
---

<section class="py-20 bg-gradient-to-br from-blue-600 to-purple-700 relative overflow-hidden">
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
    <Card className="p-8 sm:p-12 text-center border-none shadow-2xl">
      <h2 class="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
        지금 바로 시작하세요
      </h2>
      <p class="text-lg sm:text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
        14일 무료 체험으로 모든 기능을 경험해보세요
      </p>

      <div class="flex flex-col sm:flex-row justify-center items-center gap-4 sm:gap-8 mb-8 text-gray-700">
        <div class="flex items-center gap-2">
          <CircleCheck class="w-5 h-5 text-green-600" />
          <span>14일 무료 체험</span>
        </div>
        <div class="flex items-center gap-2">
          <CircleCheck class="w-5 h-5 text-green-600" />
          <span>신용카드 불필요</span>
        </div>
      </div>

      <div class="flex flex-col sm:flex-row gap-4 justify-center">
        <Button size="lg" className="text-lg px-8 py-6">
          무료로 시작하기
          <ArrowRight class="ml-2 h-5 w-5" />
        </Button>
      </div>
    </Card>
  </div>
</section>
```

## Footer (Element 11)

```astro
---
// src/components/Footer.astro
import { Separator } from '@/components/ui/separator'

const year = new Date().getFullYear()
---

<footer class="bg-gray-900 text-white">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
      <div class="col-span-2 md:col-span-1">
        <h3 class="font-bold text-lg mb-4">회사 이름</h3>
        <div class="space-y-2 text-sm text-gray-400">
          <p>서울시 강남구 테헤란로 123</p>
          <p>support@example.com</p>
          <p>02-1234-5678</p>
        </div>
      </div>

      <div>
        <h3 class="font-bold text-lg mb-4">법적 고지</h3>
        <ul class="space-y-2 text-sm text-gray-400">
          <!-- Astro uses plain <a> tags; enable prefetch for instant navigation -->
          <li><a href="/privacy" data-astro-prefetch class="hover:text-white">개인정보 보호정책</a></li>
          <li><a href="/terms" data-astro-prefetch class="hover:text-white">이용 약관</a></li>
        </ul>
      </div>
    </div>

    <Separator className="bg-gray-800 mb-8" />

    <div class="text-center">
      <p class="text-sm text-gray-400">
        &copy; {year} Company Name. All rights reserved.
      </p>
    </div>
  </div>
</footer>
```

## Page Assembly

```astro
---
// src/pages/index.astro
import Layout from '@/layouts/Layout.astro'
import Header from '@/components/Header.astro'
import Hero from '@/components/Hero.astro'
import MediaSection from '@/components/MediaSection.astro'
import Benefits from '@/components/Benefits.astro'
import Testimonials from '@/components/Testimonials.astro'
import FAQ from '@/components/FAQ.astro'
import FinalCTA from '@/components/FinalCTA.astro'
import Footer from '@/components/Footer.astro'
---

<Layout
  title="SEO Optimized Title with Keywords | Brand Name"
  description="Compelling description with main keywords"
>
  <Header />
  <main>
    <Hero />
    <MediaSection />
    <Benefits />
    <Testimonials />
    <FAQ />
    <FinalCTA />
  </main>
  <Footer />
</Layout>
```
