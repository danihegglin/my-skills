import { Baby, Croissant, Footprints, GraduationCap, Landmark, Mail, Pill, School, ShoppingBag, ShoppingBasket, Store } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { forwardRef } from "react";
import type { Poi, SchoolGroupId, SchoolsResult, ShopEssentialId, ShoppingResult } from "../lib/amenities";
import { formatDistance, walkMinutes } from "../lib/geo";
import { Section, SubHeading } from "./ui";

function Walk({ m }: { m: number }) {
  return (
    <span className="inline-flex items-center gap-1 tabular">
      <Footprints className="size-3.5" aria-hidden />
      {walkMinutes(m)} min
    </span>
  );
}

const GROUP_ICONS: Record<SchoolGroupId, LucideIcon> = { early: Baby, school: School, higher: Landmark };

export const SchoolsSection = forwardRef<HTMLElement, { schools: SchoolsResult | null }>(function SchoolsSection({ schools }, ref) {
  if (!schools) {
    return (
      <Section ref={ref} id="schools" icon={GraduationCap} accent="var(--color-school)" title="Schools" score={null} verdict="School data could not be loaded for this area.">
        <span />
      </Section>
    );
  }
  const [early, school] = schools.groups;
  const parts: string[] = [];
  if (early.items[0]) parts.push(`${early.items[0].kindLabel.toLowerCase()} ${walkMinutes(early.items[0].distance)} min away`);
  if (school.items[0]) parts.push(`nearest school ${walkMinutes(school.items[0].distance)} min on foot`);
  const verdict = parts.length
    ? `${parts.join(", ")}. ${early.within1km + school.within1km} schools and childcare centres within 1 km.`.replace(/^./, (c) => c.toUpperCase())
    : "No schools or childcare mapped within 2.5 km.";
  return (
    <Section ref={ref} id="schools" icon={GraduationCap} accent="var(--color-school)" title="Schools" score={schools.score} verdict={verdict}>
      <div className="space-y-6">
        {schools.groups.map((g) => {
          const Icon = GROUP_ICONS[g.id];
          return (
            <div key={g.id}>
              <SubHeading aside={`${g.within1km} within 1 km`}>
                <span className="inline-flex items-center gap-1.5">
                  <Icon className="size-3.5" aria-hidden />
                  {g.label}
                </span>
              </SubHeading>
              {g.items.length ? (
                <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-paper">
                  {g.items.slice(0, 3).map((p) => (
                    <PoiRow key={p.id} p={p} />
                  ))}
                </ul>
              ) : (
                <p className="rounded-3xl bg-paper px-4 py-3 text-[14px] text-muted">None within 2.5 km</p>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-6 text-[13px] leading-relaxed text-muted">
        From OpenStreetMap. Walking times assume 4.8 km/h along streets. School catchment areas aren't included; check with the local authority.
      </p>
    </Section>
  );
});

function PoiRow({ p }: { p: Poi }) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-medium" title={p.name}>
          {p.name}
        </div>
        <div className="truncate text-[13px] text-ink-2">{p.note ?? p.kindLabel}</div>
      </div>
      <div className="shrink-0 text-right text-[13px] leading-snug">
        <div className="font-medium text-ink">
          <Walk m={p.distance} />
        </div>
        <div className="text-muted tabular">{formatDistance(p.distance)}</div>
      </div>
    </li>
  );
}

const ESSENTIAL_ICONS: Record<ShopEssentialId, LucideIcon> = {
  supermarket: ShoppingBasket,
  grocery: Store,
  bakery: Croissant,
  pharmacy: Pill,
  post: Mail,
  mall: ShoppingBag,
};

export const ShoppingSection = forwardRef<HTMLElement, { shopping: ShoppingResult | null }>(function ShoppingSection({ shopping }, ref) {
  if (!shopping) {
    return (
      <Section ref={ref} id="shopping" icon={ShoppingBasket} accent="var(--color-shop)" title="Shopping" score={null} verdict="Shop data could not be loaded for this area.">
        <span />
      </Section>
    );
  }
  const market = shopping.essentials[0].nearest;
  const verdict = market
    ? `${market.name} is the nearest supermarket, ${formatDistance(market.distance)} away.${
        shopping.shopsNearby != null ? ` ${shopping.shopsNearby.toLocaleString("en")} shops of all kinds within 800 m.` : ""
      }`
    : "No supermarket within 1.5 km. Plan on driving for the weekly shop.";
  return (
    <Section ref={ref} id="shopping" icon={ShoppingBasket} accent="var(--color-shop)" title="Shopping" score={shopping.score} verdict={verdict}>
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
        {shopping.essentials.map((e) => {
          const Icon = ESSENTIAL_ICONS[e.id];
          const p = e.nearest;
          return (
            <div key={e.id} className="flex min-w-0 flex-col rounded-3xl bg-paper p-3.5 sm:p-4">
              <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
                <Icon className="size-4" aria-hidden />
                <span className="truncate">{e.label}</span>
              </div>
              {p ? (
                <>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="font-display text-[30px] font-bold leading-none tracking-tight tabular">{walkMinutes(p.distance)}</span>
                    <span className="text-[14px] text-ink-2">min walk</span>
                  </div>
                  <div className="mt-2 truncate text-[14px] font-medium" title={p.name}>
                    {p.name}
                  </div>
                  <div className="mt-0.5 text-[13px] text-muted">
                    {formatDistance(p.distance)} · {e.count} within 1 km
                  </div>
                </>
              ) : (
                <div className="mt-3 text-[14px] text-muted">None within 1.5 km</div>
              )}
            </div>
          );
        })}
      </div>
      {shopping.chains.length > 0 && (
        <div className="mt-6">
          <SubHeading>Supermarkets within 1 km</SubHeading>
          <div className="flex flex-wrap gap-2">
            {shopping.chains.map((c) => (
              <span key={c} className="rounded-full border border-line px-3 py-1 text-[14px] font-medium">
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
});
