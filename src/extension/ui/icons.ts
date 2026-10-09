import {
  ArrowUpRight,
  Bell,
  Captions,
  Check,
  ChevronsRight,
  CircleOff,
  CodeXml,
  FastForward,
  FileText,
  Hand,
  Info,
  LifeBuoy,
  Lock,
  Scissors,
  ShieldCheck,
  SlidersHorizontal,
  TimerReset,
  Tv,
  Undo2,
  UserX,
  Users,
  X,
  type IconNode,
} from "lucide";

/** Lucide icons used by the design (design/SkipSponsorAI.pen, library "lucide"). */
const ICONS = {
  "arrow-up-right": ArrowUpRight,
  bell: Bell,
  captions: Captions,
  check: Check,
  "chevrons-right": ChevronsRight,
  "circle-off": CircleOff,
  "code-xml": CodeXml,
  "fast-forward": FastForward,
  "file-text": FileText,
  hand: Hand,
  info: Info,
  "life-buoy": LifeBuoy,
  lock: Lock,
  scissors: Scissors,
  "shield-check": ShieldCheck,
  "sliders-horizontal": SlidersHorizontal,
  "timer-reset": TimerReset,
  tv: Tv,
  "undo-2": Undo2,
  "user-x": UserX,
  users: Users,
  x: X,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICONS;

const SVG_NS = "http://www.w3.org/2000/svg";

/** Inline SVG icon (stroke = currentColor), safe for Shadow DOM and strict CSP. */
export function icon(
  name: IconName,
  size = 16,
  strokeWidth = 2,
): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  for (const [k, v] of Object.entries({
    width: String(size),
    height: String(size),
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": String(strokeWidth),
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    focusable: "false",
  }))
    svg.setAttribute(k, v);
  for (const [tag, attrs] of ICONS[name]) {
    const child = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs))
      child.setAttribute(k, String(v));
    svg.appendChild(child);
  }
  return svg;
}
