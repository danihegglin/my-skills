import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import Landing from "./components/Landing";
import type { Place } from "./lib/geocode";

// The report pulls in the map engine; keep it out of the landing page bundle.
const ReportView = lazy(() => import("./components/ReportView"));

type UrlState = { place: Place | null; floor: number };

function readUrl(): UrlState {
  const q = new URLSearchParams(location.search);
  const lat = Number(q.get("lat"));
  const lon = Number(q.get("lon"));
  const floor = Math.max(0, Math.min(30, Number(q.get("floor")) || 1));
  if (!q.has("lat") || !Number.isFinite(lat) || !Number.isFinite(lon)) return { place: null, floor };
  return {
    place: {
      id: `url${lat},${lon}`,
      lat,
      lon,
      title: q.get("q") || "Selected location",
      subtitle: q.get("s") || "",
      countryCode: q.get("cc") || undefined,
    },
    floor,
  };
}

function urlFor(place: Place | null, floor: number) {
  if (!place) return location.pathname;
  const q = new URLSearchParams({ q: place.title, s: place.subtitle, lat: place.lat.toFixed(6), lon: place.lon.toFixed(6) });
  if (place.countryCode) q.set("cc", place.countryCode);
  if (floor !== 1) q.set("floor", String(floor));
  return `${location.pathname}?${q}`;
}

export default function App() {
  const [state, setState] = useState<UrlState>(readUrl);

  useEffect(() => {
    const onPop = () => setState(readUrl());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    document.title = state.place ? `${state.place.title} · PropLens` : "PropLens · Know any address before you move in";
  }, [state.place]);

  const select = useCallback(
    (place: Place | null) => {
      history.pushState(null, "", urlFor(place, state.floor));
      setState({ ...state, place });
      scrollTo({ top: 0 });
    },
    [state],
  );

  const setFloor = useCallback(
    (floor: number) => {
      history.replaceState(null, "", urlFor(state.place, floor));
      setState({ ...state, floor });
    },
    [state],
  );

  return state.place ? (
    <Suspense fallback={<div className="min-h-dvh" />}>
      <ReportView place={state.place} floor={state.floor} onFloor={setFloor} onSelect={select} />
    </Suspense>
  ) : (
    <Landing onSelect={select} />
  );
}
