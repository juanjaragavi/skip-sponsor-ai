import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GET_PANEL_REQUEST_EVENT,
  GET_PANEL_RESULT_EVENT,
  MODERN_TRANSCRIPT_PANEL_ID,
  modernTranscriptParams,
  parsePanelTranscript,
  readTranscriptViaPanelApi,
  requestPanelFromPage,
} from "../../extension/innertube-transcript";

/** One transcript row as YouTube's get_panel answer nests it (trimmed, 2026-10-13). */
function item(timestamp: string, text: string): unknown {
  return {
    macroMarkersPanelItemViewModel: {
      item: {
        timelineItemViewModel: {
          timestamp,
          contentItems: [
            {
              transcriptSegmentViewModel: {
                simpleText: text,
                style: "TIMELINE_VIEW_STYLE_MODERN_INLINE_TIMESTAMPS",
                timestamp,
                timestampA11yLabel: `${timestamp} seconds`,
              },
            },
          ],
        },
      },
      panelId: "PAmodern_transcript_view",
      onTap: {
        innertubeCommand: {
          watchEndpoint: { videoId: "JsBZOcqZerk", startTimeSeconds: 4 },
        },
      },
    },
  };
}

/** Shape of a real response: one itemSection per chapter, plus a search box. */
function panelResponse(sections: unknown[][]): unknown {
  return {
    responseContext: { serviceTrackingParams: [{ service: "CSI" }] },
    content: {
      engagementPanelSectionListRenderer: {
        header: {
          searchBoxViewModel: {
            placeholderText: "Search transcript",
            onInputAction: { command: { continuationCommand: { token: "x" } } },
          },
        },
        content: {
          sectionListRenderer: {
            contents: sections.map((contents) => ({
              itemSectionRenderer: { contents },
            })),
          },
        },
      },
    },
    trackingParams: "abc",
  };
}

describe("modernTranscriptParams", () => {
  it("matches the params YouTube's web client sent for real videos", () => {
    // Captured from /youtubei/v1/get_panel requests on 2026-10-13.
    expect(modernTranscriptParams("t28bEMboL9Y")).toBe(
      "qgkPCgt0MjhiRU1ib0w5WRgB",
    );
    expect(modernTranscriptParams("JsBZOcqZerk")).toBe(
      "qgkPCgtKc0JaT2NxWmVyaxgB",
    );
    expect(modernTranscriptParams("6FWmdzmcYMg")).toBe(
      "qgkPCgs2RldtZHptY1lNZxgB",
    );
  });

  it("refuses anything that is not an 11-character video id", () => {
    expect(modernTranscriptParams("")).toBeNull();
    expect(modernTranscriptParams("short")).toBeNull();
    expect(modernTranscriptParams("t28bEMboL9Y0")).toBeNull();
    expect(modernTranscriptParams("t28bEMb/L9Y")).toBeNull();
  });
});

describe("parsePanelTranscript", () => {
  it("returns every row across chapter sections, in order", () => {
    const res = panelResponse([
      [item("0:00", "This is the Enigma."), item("0:04", "I see a sigil.")],
      [item("1:02:03", "Thanks to our sponsor.")],
    ]);
    expect(parsePanelTranscript(res)).toEqual([
      { timestamp: "0:00", text: "This is the Enigma." },
      { timestamp: "0:04", text: "I see a sigil." },
      { timestamp: "1:02:03", text: "Thanks to our sponsor." },
    ]);
  });

  it("returns [] for a video without a transcript (empty panel)", () => {
    expect(
      parsePanelTranscript({ responseContext: {}, trackingParams: "x" }),
    ).toEqual([]);
    expect(parsePanelTranscript(panelResponse([]))).toEqual([]);
  });

  it("skips malformed rows and tolerates non-object input", () => {
    const bad = {
      a: [{ transcriptSegmentViewModel: { timestamp: 4, simpleText: "x" } }],
      b: { transcriptSegmentViewModel: { timestamp: "0:05" } },
      c: { transcriptSegmentViewModel: null },
      d: [null, 1, "s", true],
    };
    expect(parsePanelTranscript(bad)).toEqual([]);
    expect(parsePanelTranscript(null)).toEqual([]);
    expect(parsePanelTranscript("text")).toEqual([]);
  });
});

/** document/window stand-ins: an EventTarget with the MAIN-world marker. */
function installPage(mainWorld = true) {
  const doc = new EventTarget() as EventTarget & {
    documentElement: { getAttribute: (n: string) => string | null };
  };
  doc.documentElement = {
    getAttribute: (n: string) =>
      n === "data-skipsponsor-main" && mainWorld ? "1" : null,
  };
  vi.stubGlobal("document", doc);
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  return doc;
}

/** A fake MAIN-world responder; `answer` builds the reply for each request. */
function respondWith(
  doc: EventTarget,
  answer: (req: { id: string; panelId: string; params: string }) => unknown,
) {
  const seen: { id: string; panelId: string; params: string }[] = [];
  doc.addEventListener(GET_PANEL_REQUEST_EVENT, (e) => {
    const req = JSON.parse(String((e as CustomEvent).detail)) as {
      id: string;
      panelId: string;
      params: string;
    };
    seen.push(req);
    const reply = answer(req);
    if (reply === undefined) return;
    doc.dispatchEvent(
      new CustomEvent(GET_PANEL_RESULT_EVENT, {
        detail: typeof reply === "string" ? reply : JSON.stringify(reply),
      }),
    );
  });
  return seen;
}

describe("requestPanelFromPage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("asks the MAIN world for the modern transcript panel and parses the answer", async () => {
    const doc = installPage();
    const seen = respondWith(doc, (req) => ({
      id: req.id,
      ok: true,
      status: 200,
      text: JSON.stringify({ hello: "panel" }),
    }));
    await expect(requestPanelFromPage("JsBZOcqZerk")).resolves.toEqual({
      hello: "panel",
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.panelId).toBe(MODERN_TRANSCRIPT_PANEL_ID);
    expect(seen[0]!.params).toBe("qgkPCgtKc0JaT2NxWmVyaxgB");
  });

  it("ignores answers for other requests and unparsable details", async () => {
    const doc = installPage();
    respondWith(doc, (req) => {
      doc.dispatchEvent(
        new CustomEvent(GET_PANEL_RESULT_EVENT, { detail: "{not json" }),
      );
      doc.dispatchEvent(
        new CustomEvent(GET_PANEL_RESULT_EVENT, {
          detail: JSON.stringify({
            id: "other",
            ok: true,
            status: 200,
            text: "{}",
          }),
        }),
      );
      doc.dispatchEvent(
        new CustomEvent(GET_PANEL_RESULT_EVENT, {
          detail: JSON.stringify({ id: req.id }),
        }),
      );
      return { id: req.id, ok: true, status: 200, text: '{"mine":1}' };
    });
    await expect(requestPanelFromPage("JsBZOcqZerk")).resolves.toEqual({
      mine: 1,
    });
  });

  it("resolves null on an HTTP error or a body that is not JSON", async () => {
    const doc = installPage();
    respondWith(doc, (req) => ({
      id: req.id,
      ok: false,
      status: 400,
      text: "",
    }));
    await expect(requestPanelFromPage("JsBZOcqZerk")).resolves.toBeNull();

    const doc2 = installPage();
    respondWith(doc2, (req) => ({
      id: req.id,
      ok: true,
      status: 200,
      text: "<html>",
    }));
    await expect(requestPanelFromPage("JsBZOcqZerk")).resolves.toBeNull();
  });

  it("resolves null when nobody answers before the timeout", async () => {
    vi.useFakeTimers();
    const doc = installPage();
    respondWith(doc, () => undefined);
    const p = requestPanelFromPage("JsBZOcqZerk", 500);
    vi.advanceTimersByTime(501);
    await expect(p).resolves.toBeNull();
  });

  it("does not ask without the MAIN-world script or with a bad video id", async () => {
    const doc = installPage(false);
    const seen = respondWith(doc, (req) => ({
      id: req.id,
      ok: true,
      status: 200,
      text: "{}",
    }));
    await expect(requestPanelFromPage("JsBZOcqZerk")).resolves.toBeNull();
    installPage(true);
    await expect(requestPanelFromPage("bad id")).resolves.toBeNull();
    expect(seen).toHaveLength(0);
  });
});

describe("readTranscriptViaPanelApi", () => {
  const res = panelResponse([
    [
      item("0:00", "Intro line."),
      item("0:05", "This video is sponsored by Acme."),
    ],
    [item("0:30", "Back to the topic.")],
  ]);

  it("turns panel rows into upload-ready cues", async () => {
    const cues = await readTranscriptViaPanelApi(
      "JsBZOcqZerk",
      () => 60,
      () => true,
      async () => res,
    );
    expect(cues).toEqual([
      { t0: 0, t1: 5, text: "Intro line." },
      { t0: 5, t1: 30, text: "This video is sponsored by Acme." },
      { t0: 30, t1: 60, text: "Back to the topic." },
    ]);
  });

  it("retries a failed request once, but not an empty panel", async () => {
    const flaky = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(res);
    const cues = await readTranscriptViaPanelApi(
      "JsBZOcqZerk",
      () => 60,
      () => true,
      flaky,
    );
    expect(flaky).toHaveBeenCalledTimes(2);
    expect(cues).toHaveLength(3);

    const empty = vi.fn().mockResolvedValue(panelResponse([]));
    await expect(
      readTranscriptViaPanelApi(
        "JsBZOcqZerk",
        () => 60,
        () => true,
        empty,
      ),
    ).resolves.toBeNull();
    expect(empty).toHaveBeenCalledTimes(1);

    const down = vi.fn().mockResolvedValue(null);
    await expect(
      readTranscriptViaPanelApi(
        "JsBZOcqZerk",
        () => 60,
        () => true,
        down,
      ),
    ).resolves.toBeNull();
    expect(down).toHaveBeenCalledTimes(2);
  });

  it("returns null for no transcript, a failed request or a page that moved on", async () => {
    const empty = await readTranscriptViaPanelApi(
      "a",
      () => 60,
      () => true,
      async () => panelResponse([]),
    );
    const failed = await readTranscriptViaPanelApi(
      "a",
      () => 60,
      () => true,
      async () => null,
    );
    const stale = await readTranscriptViaPanelApi(
      "a",
      () => 60,
      () => false,
      async () => res,
    );
    const blank = await readTranscriptViaPanelApi(
      "a",
      () => 60,
      () => true,
      async () => panelResponse([[item("0:00", "   ")]]),
    );
    expect([empty, failed, stale, blank]).toEqual([null, null, null, null]);
  });
});

const MAIN_WORLD = "../../extension/main-world";

describe("main-world get_panel handler", () => {
  type Reply = { id: string; ok: boolean; status: number; text: string };
  let doc: EventTarget & { documentElement: { setAttribute: () => void } };
  let replies: Reply[];
  let fetchMock: ReturnType<typeof vi.fn>;

  async function load(ytcfg: unknown) {
    vi.resetModules();
    doc = new EventTarget() as typeof doc;
    doc.documentElement = { setAttribute: () => undefined };
    replies = [];
    doc.addEventListener(GET_PANEL_RESULT_EVENT, (e) =>
      replies.push(JSON.parse(String((e as CustomEvent).detail)) as Reply),
    );
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", { ytcfg });
    vi.stubGlobal("fetch", fetchMock);
    // main-world.ts is a classic script (no exports), so import it by path.
    await import(/* @vite-ignore */ MAIN_WORLD);
  }

  function ask(detail: unknown) {
    doc.dispatchEvent(
      new CustomEvent(GET_PANEL_REQUEST_EVENT, {
        detail: typeof detail === "string" ? detail : JSON.stringify(detail),
      }),
    );
  }

  const flush = () => new Promise((r) => setTimeout(r, 0));
  const valid = {
    id: "r1",
    panelId: MODERN_TRANSCRIPT_PANEL_ID,
    params: "qgkPCgtKc0JaT2NxWmVyaxgB",
  };

  beforeEach(() => {
    fetchMock = vi.fn(
      async () => new Response('{"panel":true}', { status: 200 }),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs the page's own client context to get_panel and returns the body", async () => {
    const context = { client: { clientName: "WEB", clientVersion: "2.2026" } };
    await load({
      get: (k: string) =>
        ({
          INNERTUBE_CONTEXT: context,
          INNERTUBE_CONTEXT_CLIENT_NAME: 1,
          INNERTUBE_CLIENT_VERSION: "2.2026",
        })[k],
    });
    ask(valid);
    await flush();
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/youtubei/v1/get_panel?prettyPrint=false");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    expect(init.headers).toMatchObject({
      "content-type": "application/json",
      "x-youtube-client-name": "1",
      "x-youtube-client-version": "2.2026",
    });
    expect(JSON.parse(String(init.body))).toEqual({
      context,
      panelId: MODERN_TRANSCRIPT_PANEL_ID,
      params: valid.params,
    });
    expect(replies).toEqual([
      { id: "r1", ok: true, status: 200, text: '{"panel":true}' },
    ]);
  });

  it("reads ytcfg.data_ when ytcfg.get is missing, and reports HTTP errors without a body", async () => {
    fetchMock = vi.fn(
      async () => new Response("Precondition", { status: 400 }),
    );
    await load({ data_: { INNERTUBE_CONTEXT: { client: {} } } });
    ask(valid);
    await flush();
    await flush();
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(replies).toEqual([{ id: "r1", ok: false, status: 400, text: "" }]);
  });

  it("answers ok:false when the page has no client context or the fetch fails", async () => {
    await load(undefined);
    ask(valid);
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(replies).toEqual([{ id: "r1", ok: false, status: 0, text: "" }]);

    fetchMock = vi.fn(async () => {
      throw new TypeError("network");
    });
    await load({ data_: { INNERTUBE_CONTEXT: { client: {} } } });
    ask(valid);
    await flush();
    await flush();
    expect(replies).toEqual([{ id: "r1", ok: false, status: 0, text: "" }]);
  });

  it("ignores other panels, bad params and malformed requests", async () => {
    await load({ data_: { INNERTUBE_CONTEXT: { client: {} } } });
    ask("{oops");
    ask({ ...valid, id: 7 });
    ask({ ...valid, panelId: "engagement-panel-comments-section" });
    ask({ ...valid, params: "x" });
    ask({ ...valid, params: "<script>alert(1)</script>" });
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(replies).toEqual([]);
  });
});
