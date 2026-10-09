#!/usr/bin/env python3
"""Rebuild the Chrome Web Store assets from design/SkipSponsorAI.pen.

Needs the pen.dev CLI (`npm i -g @pen.dev/cli`, >= 0.3.11) and ffmpeg.
The design file is never modified: pen works on a temporary copy.

V1 store artboards embed V1 mock components (Store / Skip Toast, Store /
Notify Banner, Store / Popup). They are rebuilt with scaled copies of the
shipped V2 components (Toast V2 / Cut, Toast V2 / Ask, Popup) so every image
matches the extension's real UI. Then everything is exported at 1x,
flattened to RGB (the store rejects alpha) and copied into store/.

Usage: python3 scripts/build-store-assets.py
"""
import json, re, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DESIGN = ROOT / "design" / "SkipSponsorAI.pen"
FFMPEG = shutil.which("ffmpeg") or sys.exit("ffmpeg not found on PATH")

LIB = r"""
SC = (n, k) => {
  const out = {};
  for (const [key, v] of Object.entries(n)) {
    if (["id", "children", "reusable", "descendants", "ref"].includes(key)) continue;
    out[key] = JSON.parse(JSON.stringify(v));
  }
  if (n.type === "ref") out.type = "frame";
  for (const key of ["width", "height", "x", "y", "gap", "fontSize", "letterSpacing", "strokeWidth"])
    if (typeof out[key] === "number") out[key] *= k;
  if (typeof out.lineHeight === "number" && out.lineHeight > 4) out.lineHeight *= k;
  for (const key of ["padding", "cornerRadius"]) {
    if (typeof out[key] === "number") out[key] *= k;
    else if (Array.isArray(out[key])) out[key] = out[key].map((p) => (typeof p === "number" ? p * k : p));
  }
  if (out.stroke && typeof out.stroke === "object" && "thickness" in out.stroke) {
    const t = out.stroke.thickness;
    out.stroke.thickness = typeof t === "number" ? t * k
      : t && typeof t === "object" ? Object.fromEntries(Object.entries(t).map(([a, b]) => [a, b * k])) : t;
  }
  if (out.effect) {
    const arr = Array.isArray(out.effect) ? out.effect : [out.effect];
    for (const e of arr) {
      for (const f of ["radius", "blur", "spread"]) if (typeof e[f] === "number") e[f] *= k;
      if (e.offset) { e.offset.x *= k; e.offset.y *= k; }
    }
  }
  return out;
};
INS = (parent, n, k, extra) => {
  const id = Insert(parent, Object.assign(SC(n, k), extra || {}));
  for (const c of n.children || []) INS(id, c, k);
  return id;
};
SWAP = { NSrUe: ["wNXBc", 360], sjrid: ["hGhLz", 360], FCuZx: ["J6AKb", 340] };
// "Auto, Notify, or Off": the Notify-selected popup, dropping from the toolbar.
OVERRIDE = { "Q6SjX:FCuZx": { comp: "gScER", k: 1.1, alignRight: true } };
"""

BUILD = r"""
pos = FindEmptySpace({ width: 6000, height: 3000, padding: 200 });
set = Insert(document, { type: "frame", name: "Release · Store Set (V2 components)", x: pos.x, y: pos.y, layout: "horizontal", gap: 120, padding: 80, fill: "#E9EBF1" });
made = {};
for (const src of ["FhtK5", "Q6SjX", "AnWaE", "UtuCa", "I3BOsm"]) {
  const copy = Copy(src, set, {});
  made[src] = copy;
  const targets = [];
  Get(copy, (n, c) => {
    if (n.type === "ref" && SWAP[n.ref]) targets.push({ id: n.id, ref: n.ref, parent: c.parentCtx.node.id, idx: c.index, x: c.bounds.x, y: c.bounds.y, w: c.bounds.width });
    if (n.type === "ref") c.skipChildren();
  });
  for (const t of targets.reverse()) {
    const o = OVERRIDE[src + ":" + t.ref];
    const [comp, native] = o ? [o.comp, 340] : SWAP[t.ref];
    const k = o ? o.k : t.w / native;
    const tree = Get(comp, { resolveInstances: true, includePathGeometry: true });
    const x = o && o.alignRight ? t.x + t.w - native * k : t.x;
    Delete(t.id);
    const id = INS(t.parent, tree, k, { x, y: t.y, name: tree.name + " ×" + k.toFixed(2) });
    Move(id, t.parent, t.idx);
    Print(src, "swapped", t.ref, "->", comp, "k", k.toFixed(2), "at", Math.round(t.x), Math.round(t.y));
  }
}
Print(JSON.stringify(made));
"""



# Export ids of the rebuilt copies are dynamic; map them back by source id.
EXPORT = r"""
Export(Object.values(made).concat(["NKqQ0", "vTFaj", "fvwNl", "R3kuH3"]), "png", OUT, { scale: 1 });
Print("MADE " + JSON.stringify(made));
"""

TARGETS = {
    "NKqQ0": "screenshots/01-skip-sponsor-reads.png",
    "FhtK5": "screenshots/02-undo.png",
    "Q6SjX": "screenshots/03-auto-notify-off.png",
    "vTFaj": "screenshots/04-any-language.png",
    "fvwNl": "screenshots/05-private-by-design.png",
    "R3kuH3": "promo/small-tile-440x280.png",
    "AnWaE": "promo/marquee-1400x560.png",
    "UtuCa": "showcase/showcase-1920x1080.png",
    "I3BOsm": "showcase/showcase-1280x720.png",
}


def main() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        out = Path(tmp) / "export"
        out.mkdir()
        js = LIB + BUILD + EXPORT.replace("OUT", json.dumps(str(out)))
        lines = "execute({ input: " + json.dumps(js) + " })\nexit()\n"
        proc = subprocess.run(
            ["pen", "interactive", "--in", str(DESIGN), "--out", str(Path(tmp) / "work.pen")],
            input=lines, capture_output=True, text=True, timeout=1200,
        )
        log = re.sub(r"\x1b\[[0-9;]*m", "", proc.stdout + proc.stderr)
        m = re.search(r"MADE (\{.*\})", log)
        if not m:
            sys.exit("pen export failed:\n" + log[-3000:])
        made = json.loads(m.group(1))
        for line in log.splitlines():
            if "swapped" in line:
                print(line.strip())
        for src, rel in TARGETS.items():
            node = made.get(src, src)
            dest = ROOT / "store" / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(
                [FFMPEG, "-loglevel", "error", "-y", "-i", str(out / f"{node}.png"),
                 "-vf", "format=rgb24", "-pix_fmt", "rgb24", str(dest)],
                check=True,
            )
            print(f"store/{rel}")


if __name__ == "__main__":
    main()
