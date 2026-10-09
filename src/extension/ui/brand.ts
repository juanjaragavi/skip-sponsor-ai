/**
 * Brand mark "A — Leap": the playhead arcs over a highlighted segment on the
 * track. Geometry from design/SkipSponsorAI.pen ("Mark / Tile" components,
 * 64-unit grid); see scripts/build-icons.mjs for the raster icons.
 */
const SVG_NS = "http://www.w3.org/2000/svg";

const PARTS: [tag: string, attrs: Record<string, string>][] = [
  ["rect", { width: "64", height: "64", rx: "16", fill: "#7B61FF" }],
  [
    "path",
    {
      d: "M24 41h16a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5h-16a2.5 2.5 0 0 1-2.5-2.5v-5a2.5 2.5 0 0 1 2.5-2.5z",
      fill: "#FFFFFF",
      "fill-opacity": "0.3",
    },
  ],
  [
    "path",
    {
      d: "M11 43h6a3 3 0 0 1 0 6h-6a3 3 0 0 1 0-6z m36 0h6a3 3 0 0 1 0 6h-6a3 3 0 0 1 0-6z",
      fill: "#FFFFFF",
    },
  ],
  [
    "path",
    {
      d: "M15 37q17-29 34 0m-9-3l9.5 3.5 2-10",
      fill: "none",
      stroke: "#FFFFFF",
      "stroke-width": "5",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    },
  ],
];

export function brandMark(size = 24): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("aria-hidden", "true");
  for (const [tag, attrs] of PARTS) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.appendChild(el);
  }
  return svg;
}
