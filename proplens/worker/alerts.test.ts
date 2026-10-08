import { describe, expect, it } from "vitest";
import type { Home } from "./alerts";
import { addressKey, addressKeys, matchListing, parseSignup, wanted } from "./alerts";
import { digestEmail } from "./email";
import { toListing } from "./listings";

const area = { id: "plz:4390", label: "8005 Zürich", south: 47.378, west: 8.501, north: 47.395, east: 8.539 };
const valid = {
  email: " Someone@Example.com ",
  consent: true,
  website: "",
  mode: "buy",
  budget: 1_250_000.4,
  minScore: 72.6,
  page: "/?area=plz:4390",
  area,
  homes: [
    ["Josefstrasse 169", 47.3858, 8.5265, 90, 95, 100, 100, 67],
    ["Langstrasse 241, 243", 47.3842, 8.531, 70, 40, 100, 100, 50],
  ],
  ranked: "2026-10-08T12:00:00Z",
};

describe("signup", () => {
  it("normalises a valid signup and expands multi-number addresses", () => {
    const r = parseSignup(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.signup).toMatchObject({ email: "someone@example.com", mode: "buy", budget: 1_250_000, minScore: 73, area });
    expect(r.signup.homes.map((h) => h.key)).toEqual(["josefstrasse169", "langstrasse241", "langstrasse243"]);
  });

  it("rejects missing consent, bad emails, unknown areas and empty rankings", () => {
    expect(parseSignup({ ...valid, consent: false })).toMatchObject({ ok: false, error: expect.stringMatching(/agree/) });
    expect(parseSignup({ ...valid, email: "not-an-email" })).toMatchObject({ ok: false, error: expect.stringMatching(/email/) });
    expect(parseSignup({ ...valid, area: { ...area, id: "drop table" } })).toMatchObject({ ok: false, error: expect.stringMatching(/area/) });
    expect(parseSignup({ ...valid, area: { ...area, north: 48.5 } })).toMatchObject({ ok: false });
    expect(parseSignup({ ...valid, homes: [] })).toMatchObject({ ok: false, error: expect.stringMatching(/ranking/) });
  });

  it("drops ranking rows that are malformed or outside the area", () => {
    const r = parseSignup({ ...valid, homes: [...valid.homes, ["Far away 1", 46.2, 6.1, 90, 90, 90, 90, 90], ["Bad 2", 47.38, 8.52, 101, 0, 0, 0, 0], "junk"] });
    expect(r.ok && r.signup.homes.length).toBe(3);
  });

  it("flags the honeypot as spam so it can be answered silently", () => {
    expect(parseSignup({ ...valid, website: "http://spam.example" })).toMatchObject({ ok: false, spam: true });
  });
});

describe("address matching", () => {
  it("normalises spelling differences between OSM and listing sites", () => {
    expect(addressKey("Zollstr.", "12 A")).toBe("zollstrasse12a");
    expect(addressKey("Zollstrasse", "12a")).toBe("zollstrasse12a");
    expect(addressKey("Rue de Genève", "3")).toBe(addressKey("Rue de Geneve", "3"));
    expect(addressKeys("Im Glattbogen 5; 7")).toEqual(["imglattbogen5", "imglattbogen7"]);
    expect(addressKeys("Zollstrasse")).toEqual([]);
  });

  const home = (key: string, lat: number, lon: number, score = 80): Home => ({ key, address: key, lat, lon, score, noise: 80, schools: 80, shopping: 80, sun: 80 });
  const homes = [home("josefstrasse169", 47.3858, 8.5265, 90), home("langstrasse241", 47.3842, 8.531, 70)];
  const byKey = new Map(homes.map((h) => [h.key, h]));

  it("matches by street and number first, then by position within 30 m", () => {
    expect(matchListing({ street: "Josefstr. 169", lat: null, lon: null }, byKey, homes)?.score).toBe(90);
    // No street: about 15 m from Langstrasse 241.
    expect(matchListing({ street: null, lat: 47.38433, lon: 8.53105 }, byKey, homes)?.key).toBe("langstrasse241");
    // 100 m away from everything.
    expect(matchListing({ street: "Unknownweg 1", lat: 47.3851, lon: 8.531 }, byKey, homes)).toBeNull();
  });

  it("only alerts on homes at or above the score, in the right mode and budget", () => {
    const sub = { mode: "rent" as const, budget: 3000, minScore: 75 };
    const listing = { mode: "rent" as const, price: 2800, score: 80, category: "APARTMENT" };
    expect(wanted(sub, listing)).toBe(true);
    expect(wanted(sub, { ...listing, score: 75 })).toBe(true);
    expect(wanted(sub, { ...listing, score: 74 })).toBe(false);
    expect(wanted(sub, { ...listing, score: null })).toBe(false);
    expect(wanted(sub, { ...listing, price: 3200 })).toBe(false);
    expect(wanted(sub, { ...listing, price: null })).toBe(false);
    expect(wanted({ ...sub, budget: null }, { ...listing, price: null })).toBe(true);
    expect(wanted(sub, { ...listing, mode: "buy" })).toBe(false);
    expect(wanted(sub, { ...listing, category: "PARKING" })).toBe(false);
  });
});

describe("Flatfox listings", () => {
  const sample = {
    pk: 86431976,
    url: "/en/flat/langstrasse-241-8005-zurich/86431976/",
    status: "act",
    offer_type: "RENT",
    object_category: "APARTMENT",
    short_title: "2.5 rooms apartment",
    street: "Langstrasse 241",
    zipcode: 8005,
    city: "Zürich",
    public_address: "Langstrasse 241, 8005 Zürich",
    latitude: 47.3842716,
    longitude: 8.5310811,
    price_display: 2370,
    number_of_rooms: "2.5",
    livingspace: 58,
    floor: 2,
    published: "2026-10-08T14:09:22+02:00",
  };

  it("maps the public listing fields", () => {
    expect(toListing(sample)).toMatchObject({
      id: "flatfox:86431976",
      url: "https://flatfox.ch/en/flat/langstrasse-241-8005-zurich/86431976/",
      mode: "rent",
      category: "APARTMENT",
      street: "Langstrasse 241",
      price: 2370,
      rooms: 2.5,
      space: 58,
    });
    expect(toListing({ ...sample, offer_type: "SALE", price_display: null, selling_price: 980000 })).toMatchObject({ mode: "buy", price: 980000 });
  });

  it("skips inactive listings and unknown offer types", () => {
    expect(toListing({ ...sample, status: "dis" })).toBeNull();
    expect(toListing({ ...sample, offer_type: "SWAP" })).toBeNull();
  });
});

describe("digest email", () => {
  it("escapes listing text and links the listing, the report and unsubscribe", () => {
    const sub = { token: "00000000-0000-4000-8000-000000000000", email: "a@b.ch", area_label: "8005 Zürich", mode: "rent" as const, budget: 3000, min_score: 75 };
    const e = digestEmail(
      sub,
      [{ url: "https://flatfox.ch/1/", title: "<script>alert(1)</script>", address: "Langstrasse 241", price: 2370, rooms: 2.5, space: 58, mode: "rent", score: 80, home: { address: "Langstrasse 241", lat: 47.38, lon: 8.53 } }],
      2,
      "https://proplens.example",
    );
    expect(e.subject).toBe("3 new listings in 8005 Zürich scoring 75+");
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.html).toContain("https://proplens.example/?q=Langstrasse+241");
    expect(e.html).toContain("alerts=unsubscribe&amp;token=00000000-0000-4000-8000-000000000000");
    expect(e.unsubscribe).toBe("https://proplens.example/api/alerts/unsubscribe?token=00000000-0000-4000-8000-000000000000");
    expect(e.text).toContain("CHF 2'370/month");
  });
});
