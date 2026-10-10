import { ArrowRight, LoaderCircle, LocateFixed, MapPin, Search } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { Place } from "../lib/geocode";
import { reversePlace, searchPlaces } from "../lib/geocode";

type Props = {
  onSelect: (place: Place) => void;
  size?: "lg" | "sm";
  autoFocus?: boolean;
  placeholder?: string;
};

export default function SearchBox({ onSelect, size = "lg", autoFocus, placeholder = "Enter a street address" }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const pendingSubmit = useRef(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      searchPlaces(q, ctrl.signal)
        .then((r) => {
          setResults(r);
          setActive(r.length ? 0 : -1);
          setError(r.length ? null : "No matching address found. Try adding the city.");
          setLoading(false);
          if (pendingSubmit.current && r[0]) {
            pendingSubmit.current = false;
            choose(r[0]);
          }
        })
        .catch((err) => {
          if (ctrl.signal.aborted) return;
          setError(err instanceof Error ? err.message : "Search failed");
          setLoading(false);
        });
    }, 220);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  function choose(place: Place) {
    setOpen(false);
    setQuery(`${place.title}${place.subtitle ? `, ${place.subtitle}` : ""}`);
    onSelect(place);
  }

  function submit() {
    if (results[active] ?? results[0]) choose(results[active] ?? results[0]);
    else if (query.trim().length >= 3) pendingSubmit.current = true;
  }

  function locate() {
    if (!navigator.geolocation) {
      setError("Your browser can't share its location.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const place = await reversePlace(pos.coords.latitude, pos.coords.longitude);
        setLocating(false);
        choose(place);
      },
      () => {
        setLocating(false);
        setError("Location access was denied.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  const lg = size === "lg";
  const showList = open && query.trim().length >= 3 && (results.length > 0 || !!error);

  return (
    <div ref={box} className="relative w-full">
      <form
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={`flex items-center gap-2 rounded-full border border-line bg-card shadow-[0_1px_2px_rgb(16_20_15/0.05),0_8px_30px_-12px_rgb(16_20_15/0.18)] transition focus-within:border-ink/40 focus-within:shadow-[0_0_0_4px_rgb(212_242_106/0.55)] ${lg ? "p-2 pl-5" : "p-1 pl-4"}`}
      >
        <Search className={`shrink-0 text-muted ${lg ? "size-5" : "size-4"}`} aria-hidden />
        <input
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
          aria-label="Address"
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setError(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Escape") setOpen(false);
          }}
          className={`min-w-0 flex-1 bg-transparent text-ink outline-none placeholder:text-muted ${lg ? "py-2 text-[17px]" : "py-1.5 text-[15px]"}`}
        />
        {loading && <LoaderCircle className="size-4 shrink-0 animate-spin text-muted" aria-label="Searching" />}
        {lg && (
          <button
            type="button"
            onClick={locate}
            title="Use my location"
            aria-label="Use my location"
            className="grid size-10 shrink-0 place-items-center rounded-full text-ink-2 transition hover:bg-wash hover:text-ink"
          >
            {locating ? <LoaderCircle className="size-[18px] animate-spin" /> : <LocateFixed className="size-[18px]" />}
          </button>
        )}
        <button
          type="submit"
          className={`group inline-flex shrink-0 items-center gap-2 rounded-full bg-ink font-medium text-white transition hover:bg-forest ${lg ? "h-12 px-6 text-[15px]" : "h-9 px-4 text-sm"}`}
        >
          {lg ? "Analyze" : <span className="sr-only">Analyze</span>}
          <ArrowRight className={`text-lime transition-transform group-hover:translate-x-0.5 ${lg ? "size-[18px]" : "size-4"}`} aria-hidden />
        </button>
      </form>

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+8px)] z-[1100] overflow-hidden rounded-3xl border border-line bg-card p-1.5 shadow-[0_24px_60px_-20px_rgb(16_20_15/0.35)]"
        >
          {results.map((r, i) => (
            <li
              key={r.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onPointerEnter={() => setActive(i)}
              onPointerDown={(e) => {
                e.preventDefault();
                choose(r);
              }}
              className={`flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 ${i === active ? "bg-wash" : ""}`}
            >
              <span className={`grid size-9 shrink-0 place-items-center rounded-full ${i === active ? "bg-lime" : "bg-paper"}`}>
                <MapPin className="size-4 text-ink" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-medium text-ink">{r.title}</span>
                <span className="block truncate text-[13px] text-muted">{r.subtitle}</span>
              </span>
            </li>
          ))}
          {!results.length && error && <li className="px-4 py-3 text-sm text-ink-2">{error}</li>}
        </ul>
      )}
      {!showList && error && !open && <p className="mt-2 pl-5 text-sm text-ink-2">{error}</p>}
    </div>
  );
}
