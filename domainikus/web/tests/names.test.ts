import { describe, expect, it } from "vitest";
import { display, expand, extractKeywords, generate, normalizeDomain, slugify } from "../shared/names";

describe("names", () => {
  it("slugifies with German transliteration", () => {
    expect(slugify("Bäckerei Zürich!")).toBe("baeckereizuerich");
    expect(slugify("Café-Crème")).toBe("cafe-creme");
    expect(slugify("--x--")).toBe("x");
  });

  it("normalizes domains", () => {
    expect(normalizeDomain("https://www.Example.com/path")).toBe("example.com");
    expect(normalizeDomain("bäckerei.ch")).toBe("xn--bckerei-5wa.ch");
    expect(normalizeDomain("bad_name.com")).toBeNull();
    expect(normalizeDomain("-bad.com")).toBeNull();
    expect(normalizeDomain("nodot")).toBeNull();
  });

  it("displays punycode as Unicode", () => {
    expect(display("xn--bckerei-5wa.ch")).toBe("bäckerei.ch");
    expect(display("xn--mnchen-3ya.de")).toBe("münchen.de");
    expect(display("plain.com")).toBe("plain.com");
  });

  it("drops English and German stopwords", () => {
    expect(extractKeywords("An app to book dog walkers nearby")).toEqual(["book", "dog", "walkers", "nearby"]);
    expect(extractKeywords("Eine Bäckerei mit frischem Brot")).toEqual(["baeckerei", "frischem", "brot"]);
  });

  it("expands bare names over TLDs", () => {
    expect(expand(["foo", "bar.io"], ["com", "ch"])).toEqual(["foo.com", "foo.ch", "bar.io"]);
  });

  it("ranks combinations before single words", () => {
    const names = generate("dog walkers", { affixes: false });
    expect(names[0]).toMatchObject({ name: "dogwalkers", source: "input" });
    expect(names.map((n) => n.name)).toContain("walkersdog");
    expect(new Set(names.slice(-2).map((n) => n.source))).toEqual(new Set(["keyword"]));
  });

  it("uses extra names, AI names and synonyms", () => {
    const names = generate("fast bakery", {
      extra: ["Brotli"],
      ai: [{ name: "presto", source: "ai", note: "Italian for fast" }],
      related: { fast: ["quick"], bakery: ["bread"] },
      affixes: false,
    }).map((n) => n.name);
    expect(names.slice(0, 3)).toEqual(["fastbakery", "brotli", "presto"]);
    expect(names).toEqual(expect.arrayContaining(["quickbakery", "fastbread", "quickbread"]));
  });
});
