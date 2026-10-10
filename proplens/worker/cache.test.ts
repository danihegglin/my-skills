import { describe, expect, it } from "vitest";
import { cacheKey, cacheable, join, ruleFor, split } from "./cache";

const enc = (s: string) => new TextEncoder().encode(s);

describe("cache rules", () => {
  it("caches the app's lookups and nothing else", () => {
    expect(ruleFor(new URL("https://overpass-api.de/api/interpreter"), true)).toEqual({ kind: "overpass", days: 30 });
    expect(ruleFor(new URL("https://maps.mail.ru/osm/tools/overpass/api/interpreter"), true)?.kind).toBe("overpass");
    expect(ruleFor(new URL("https://archive-api.open-meteo.com/v1/archive?latitude=47.38"), false)?.kind).toBe("climate");
    expect(ruleFor(new URL("https://api.open-meteo.com/v1/elevation?latitude=47.38"), false)?.kind).toBe("elevation");
    expect(ruleFor(new URL("https://wms.geo.admin.ch/?SERVICE=WMS&REQUEST=GetFeatureInfo"), false)?.kind).toBe("swiss-noise");
    expect(ruleFor(new URL("https://api3.geo.admin.ch/rest/services/api/MapServer/identify?x=1"), false)?.kind).toBe("geo-admin");
    // Not an open proxy: other hosts, plain http, other paths and other methods are refused.
    expect(ruleFor(new URL("https://example.com/api/interpreter"), true)).toBeNull();
    expect(ruleFor(new URL("http://overpass-api.de/api/interpreter"), true)).toBeNull();
    expect(ruleFor(new URL("https://overpass-api.de/api/interpreter"), false)).toBeNull();
    expect(ruleFor(new URL("https://api.open-meteo.com/v1/forecast?latitude=1"), false)).toBeNull();
    expect(ruleFor(new URL("https://wms.geo.admin.ch/?REQUEST=GetMap"), false)).toBeNull();
    expect(ruleFor(new URL("https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=x"), false)).toBeNull();
  });

  it("keys Overpass by the query, whichever mirror is asked", async () => {
    const q = "[out:json];way(1);out;";
    const a = await cacheKey({ kind: "overpass", days: 30 }, new URL("https://overpass-api.de/api/interpreter"), q);
    const b = await cacheKey({ kind: "overpass", days: 30 }, new URL("https://overpass.kumi.systems/api/interpreter"), ` ${q}\n`);
    const c = await cacheKey({ kind: "overpass", days: 30 }, new URL("https://overpass-api.de/api/interpreter"), q.replace("1", "2"));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("only keeps complete answers", () => {
    expect(cacheable("overpass", enc('{"elements":[{"id":1}]}'))).toBe(true);
    expect(cacheable("overpass", enc('{"elements":[],"remark":"runtime error: Query timed out"}'))).toBe(false);
    expect(cacheable("overpass", enc("<html>504 Gateway Time-out</html>"))).toBe(false);
    expect(cacheable("climate", enc('{"daily":{}}'))).toBe(true);
    expect(cacheable("swiss-noise", enc("GetFeatureInfo results:\n\nLayer 'ch.bafu.laerm-strassenlaerm_tag'"))).toBe(true);
    expect(cacheable("swiss-noise", enc('<ServiceExceptionReport><ServiceException>msWMSFeatureInfo()</ServiceException>'))).toBe(false);
    expect(cacheable("elevation", new Uint8Array(0))).toBe(false);
  });

  it("splits large entries into parts and joins them back", () => {
    const bytes = Uint8Array.from({ length: 2500 }, (_, i) => i % 251);
    const parts = split(bytes, 1000);
    expect(parts.map((p) => p.byteLength)).toEqual([1000, 1000, 500]);
    expect(join(parts)).toEqual(bytes);
  });
});
