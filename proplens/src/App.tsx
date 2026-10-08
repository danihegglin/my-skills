import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import AlertLink from "./components/AlertLink";
import Landing from "./components/Landing";
import type { AreaKind, AreaRef } from "./lib/area";
import { KIND_LABEL } from "./lib/area";
import type { LatLon } from "./lib/geo";
import type { Place } from "./lib/geocode";

// The report and the area ranking pull in the map engine; keep them out of the landing page bundle.
const ReportView = lazy(() => import("./components/ReportView"));
const AreaView = lazy(() => import("./components/AreaView"));

type View =
  | { kind: "landing" }
  | { kind: "report"; place: Place; floor: number }
  | { kind: "area"; area: AreaRef; focus?: LatLon }
  | { kind: "alerts"; action: "confirm" | "unsubscribe"; token: string };

function readUrl(): View {
  const q = new URLSearchParams(location.search);
  const action = q.get("alerts");
  if ((action === "confirm" || action === "unsubscribe") && q.get("token")) return { kind: "alerts", action, token: q.get("token")! };

  const areaId = q.get("area");
  if (areaId) {
    const kind = (q.get("type") as AreaKind) in KIND_LABEL ? (q.get("type") as AreaKind) : "postcode";
    const [lat, lon] = (q.get("at") ?? "").split(",").map(Number);
    const focus = Number.isFinite(lat) && Number.isFinite(lon) && q.get("at") ? { lat, lon } : undefined;
    return { kind: "area", area: { id: areaId, label: q.get("label") || "Area", kind, detail: q.get("detail") ?? KIND_LABEL[kind] }, focus };
  }

  const lat = Number(q.get("lat"));
  const lon = Number(q.get("lon"));
  const floor = Math.max(0, Math.min(30, Number(q.get("floor")) || 1));
  if (!q.has("lat") || !Number.isFinite(lat) || !Number.isFinite(lon)) return { kind: "landing" };
  return {
    kind: "report",
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

function urlFor(view: View) {
  if (view.kind === "report") {
    const { place, floor } = view;
    const q = new URLSearchParams({ q: place.title, s: place.subtitle, lat: place.lat.toFixed(6), lon: place.lon.toFixed(6) });
    if (place.countryCode) q.set("cc", place.countryCode);
    if (floor !== 1) q.set("floor", String(floor));
    return `${location.pathname}?${q}`;
  }
  if (view.kind === "area") {
    const { area, focus } = view;
    const q = new URLSearchParams({ area: area.id, label: area.label, type: area.kind, detail: area.detail });
    if (focus) q.set("at", `${focus.lat.toFixed(5)},${focus.lon.toFixed(5)}`);
    return `${location.pathname}?${q}`;
  }
  return location.pathname;
}

const TITLE = "PropLens · Know any address before you move in";

export default function App() {
  const [view, setView] = useState<View>(readUrl);

  useEffect(() => {
    const onPop = () => setView(readUrl());
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    document.title =
      view.kind === "report" ? `${view.place.title} · PropLens` : view.kind === "area" ? `Best addresses in ${view.area.label} · PropLens` : TITLE;
  }, [view]);

  const go = useCallback((next: View) => {
    history.pushState(null, "", urlFor(next));
    setView(next);
    scrollTo({ top: 0 });
  }, []);

  const floor = view.kind === "report" ? view.floor : 1;
  const select = useCallback((place: Place | null) => go(place ? { kind: "report", place, floor } : { kind: "landing" }), [go, floor]);
  const openArea = useCallback((area: AreaRef, focus?: LatLon) => go({ kind: "area", area, focus }), [go]);
  const home = useCallback(() => go({ kind: "landing" }), [go]);

  const setFloor = useCallback(
    (f: number) => {
      if (view.kind !== "report") return;
      const next = { ...view, floor: f };
      history.replaceState(null, "", urlFor(next));
      setView(next);
    },
    [view],
  );

  if (view.kind === "alerts") return <AlertLink action={view.action} token={view.token} onHome={home} />;
  if (view.kind === "landing") return <Landing onSelect={select} onArea={openArea} />;
  return (
    <Suspense fallback={<div className="min-h-dvh" />}>
      {view.kind === "report" ? (
        <ReportView place={view.place} floor={view.floor} onFloor={setFloor} onSelect={select} onArea={openArea} />
      ) : (
        <AreaView key={`${view.area.id}|${view.focus?.lat}`} area={view.area} focus={view.focus} onArea={openArea} onOpen={select} onHome={home} />
      )}
    </Suspense>
  );
}
