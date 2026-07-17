import type { CompositionMotif } from "./composition-library";

export type DiagramTone = "ink" | "muted" | "accent" | "field";
export type DiagramMode = "stroke" | "fill";
export type DiagramCurve = "linear" | "smooth";
export type Point = readonly [number, number];

type DiagramElementBase = Readonly<{
  id: string;
  tone: DiagramTone;
}>;

export type DiagramLineElement = DiagramElementBase & Readonly<{
  kind: "line";
  from: Point;
  to: Point;
}>;

export type DiagramPathElement = DiagramElementBase & Readonly<{
  kind: "path";
  points: readonly Point[];
  mode: DiagramMode;
  curve: DiagramCurve;
  closed: boolean;
}>;

export type DiagramRayFanElement = DiagramElementBase & Readonly<{
  kind: "rayFan";
  origin: Point;
  targets: readonly Point[];
}>;

export type DiagramRectElement = DiagramElementBase & Readonly<{
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  mode: DiagramMode;
  radius: number;
}>;

export type DiagramPolygonElement = DiagramElementBase & Readonly<{
  kind: "polygon";
  points: readonly Point[];
  mode: DiagramMode;
}>;

export type DiagramEllipseElement = DiagramElementBase & Readonly<{
  kind: "ellipse";
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  mode: DiagramMode;
  role: string;
  rotation: number;
}>;

export type DiagramElement =
  | DiagramLineElement
  | DiagramPathElement
  | DiagramRayFanElement
  | DiagramRectElement
  | DiagramPolygonElement
  | DiagramEllipseElement;

export type MotifBlueprint = Readonly<{
  viewBox: readonly [number, number, number, number];
  align: "start" | "center" | "end";
  labelEdge: "nw" | "ne" | "sw" | "se";
  rationale: string;
  semanticTags: readonly string[];
  elements: readonly DiagramElement[];
}>;

export type MotifFrame = Readonly<{ width: number; height: number }>;

export function fitMotifFrame(
  slotWidth: number,
  slotHeight: number,
  aspect: number,
): MotifFrame {
  if (
    !Number.isFinite(slotWidth) ||
    !Number.isFinite(slotHeight) ||
    !Number.isFinite(aspect) ||
    slotWidth <= 0 ||
    slotHeight <= 0 ||
    aspect <= 0
  ) {
    return Object.freeze({ width: 0, height: 0 });
  }
  const width = Math.min(slotWidth, slotHeight * aspect);
  return Object.freeze({ width, height: width / aspect });
}

const NORMALIZED_VIEWBOX = Object.freeze([0, 0, 100, 100]) as readonly [
  number,
  number,
  number,
  number,
];

function p(x: number, y: number): Point {
  return Object.freeze([x, y]) as Point;
}

function line(
  id: string,
  from: Point,
  to: Point,
  tone: DiagramTone = "ink",
): DiagramLineElement {
  return Object.freeze({ id, kind: "line", from, to, tone });
}

function path(
  id: string,
  points: readonly Point[],
  tone: DiagramTone = "ink",
  mode: DiagramMode = "stroke",
  curve: DiagramCurve = "smooth",
  closed = false,
): DiagramPathElement {
  return Object.freeze({
    id,
    kind: "path",
    points: Object.freeze([...points]),
    tone,
    mode,
    curve,
    closed,
  });
}

function rayFan(
  id: string,
  origin: Point,
  targets: readonly Point[],
  tone: DiagramTone = "muted",
): DiagramRayFanElement {
  return Object.freeze({
    id,
    kind: "rayFan",
    origin,
    targets: Object.freeze([...targets]),
    tone,
  });
}

function rect(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  tone: DiagramTone,
  mode: DiagramMode,
  radius = 0,
): DiagramRectElement {
  return Object.freeze({ id, kind: "rect", x, y, width, height, tone, mode, radius });
}

function polygon(
  id: string,
  points: readonly Point[],
  tone: DiagramTone,
  mode: DiagramMode,
): DiagramPolygonElement {
  return Object.freeze({
    id,
    kind: "polygon",
    points: Object.freeze([...points]),
    tone,
    mode,
  });
}

function ellipse(
  id: string,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  tone: DiagramTone,
  mode: DiagramMode,
  role: string,
  rotation = 0,
): DiagramEllipseElement {
  return Object.freeze({
    id,
    kind: "ellipse",
    cx,
    cy,
    rx,
    ry,
    tone,
    mode,
    role,
    rotation,
  });
}

function assertPointInViewBox(point: Point, viewBox: MotifBlueprint["viewBox"], label: string) {
  const [x, y] = point;
  const [minX, minY, width, height] = viewBox;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < minX ||
    x > minX + width ||
    y < minY ||
    y > minY + height
  ) {
    throw new Error(`Composition motif ${label} has an off-canvas point (${x}, ${y}).`);
  }
}

function validateElement(
  element: DiagramElement,
  viewBox: MotifBlueprint["viewBox"],
  motifId: string,
) {
  const label = `${motifId}/${element.id}`;
  if (!element.id.trim()) throw new Error(`Composition motif ${motifId} has an empty element id.`);
  if (element.kind === "line") {
    assertPointInViewBox(element.from, viewBox, label);
    assertPointInViewBox(element.to, viewBox, label);
  } else if (element.kind === "path" || element.kind === "polygon") {
    if (element.points.length < (element.kind === "polygon" ? 3 : 2)) {
      throw new Error(`Composition motif ${label} does not contain enough points.`);
    }
    element.points.forEach((point) => assertPointInViewBox(point, viewBox, label));
  } else if (element.kind === "rayFan") {
    if (element.targets.length < 2) {
      throw new Error(`Composition motif ${label} must contain at least two ray targets.`);
    }
    assertPointInViewBox(element.origin, viewBox, label);
    element.targets.forEach((point) => assertPointInViewBox(point, viewBox, label));
  } else if (element.kind === "rect") {
    assertPointInViewBox(p(element.x, element.y), viewBox, label);
    assertPointInViewBox(p(element.x + element.width, element.y + element.height), viewBox, label);
    if (element.width <= 0 || element.height <= 0 || element.radius < 0) {
      throw new Error(`Composition motif ${label} has invalid rectangle dimensions.`);
    }
  } else {
    if (!element.role.trim()) throw new Error(`Composition motif ${label} needs a semantic role.`);
    assertPointInViewBox(p(element.cx - element.rx, element.cy - element.ry), viewBox, label);
    assertPointInViewBox(p(element.cx + element.rx, element.cy + element.ry), viewBox, label);
    if (element.rx <= 0 || element.ry <= 0 || !Number.isFinite(element.rotation)) {
      throw new Error(`Composition motif ${label} has invalid ellipse dimensions.`);
    }
  }
}

function blueprint(
  id: CompositionMotif,
  align: MotifBlueprint["align"],
  labelEdge: MotifBlueprint["labelEdge"],
  rationale: string,
  semanticTags: readonly string[],
  elements: readonly DiagramElement[],
): MotifBlueprint {
  const ids = new Set<string>();
  for (const element of elements) {
    if (ids.has(element.id)) throw new Error(`Composition motif ${id} repeats element ${element.id}.`);
    ids.add(element.id);
    validateElement(element, NORMALIZED_VIEWBOX, id);
  }
  return Object.freeze({
    viewBox: NORMALIZED_VIEWBOX,
    align,
    labelEdge,
    rationale,
    semanticTags: Object.freeze([...semanticTags]),
    elements: Object.freeze([...elements]),
  });
}

/**
 * Thirty-two painting-authored diagrams. Each blueprint is a coherent visual
 * argument about its artwork: construction lines share explicit anchors,
 * filled shapes are deliberate fields, and ellipses only represent objects
 * that are actually circular or elliptical in the painting.
 */
export const MOTIF_BLUEPRINTS: Readonly<Record<CompositionMotif, MotifBlueprint>> = Object.freeze({
  "ermine-arc": blueprint(
    "ermine-arc",
    "start",
    "sw",
    "Cecilia's counter-turn links her gaze and hand to the ermine's answering spine.",
    ["counter-turn", "gaze", "hand", "ermine"],
    [
      polygon("sleeve-field", [p(3, 77), p(31, 67), p(45, 100), p(3, 100)], "field", "fill"),
      path("head-turn", [p(18, 27), p(37, 15), p(59, 24), p(73, 43)], "ink"),
      path("ermine-spine", [p(21, 69), p(40, 58), p(60, 61), p(81, 75)], "muted"),
      line("hand-axis", p(20, 70), p(55, 54), "accent"),
      line("gaze-axis", p(59, 27), p(94, 20), "muted"),
      path("gesture-link", [p(52, 45), p(59, 53), p(62, 62)], "ink"),
    ],
  ),
  "sea-born": blueprint(
    "sea-born",
    "center",
    "ne",
    "Venus rises on a shell whose ribs share one hinge and settle into one horizon.",
    ["shell", "single-origin", "horizon", "birth"],
    [
      polygon("sea-plane", [p(0, 82), p(100, 82), p(100, 100), p(0, 100)], "field", "fill"),
      line("venus-axis", p(50, 17), p(50, 86), "muted"),
      path("shell-lip", [p(13, 66), p(30, 80), p(50, 86), p(70, 80), p(87, 66)], "ink"),
      rayFan(
        "shell-ribs",
        p(50, 86),
        [p(18, 57), p(28, 49), p(39, 44), p(50, 42), p(61, 44), p(72, 49), p(82, 57)],
        "muted",
      ),
      path("shore", [p(0, 82), p(49, 79), p(100, 82)], "accent"),
    ],
  ),
  "triptych-spill": blueprint(
    "triptych-spill",
    "end",
    "se",
    "The three painted worlds remain legible as unequal but connected panels on one horizon.",
    ["triptych", "eden", "earth", "inferno"],
    [
      rect("eden-field", 4, 79, 24, 8, "field", "fill"),
      rect("earth-field", 28, 79, 44, 8, "accent", "fill"),
      rect("inferno-field", 72, 79, 24, 8, "field", "fill"),
      rect("outer-frame", 4, 7, 92, 80, "ink", "stroke"),
      line("eden-seam", p(28, 7), p(28, 87), "muted"),
      line("inferno-seam", p(72, 7), p(72, 87), "muted"),
      line("shared-horizon", p(4, 35), p(96, 35), "ink"),
    ],
  ),
  "convex-witness": blueprint(
    "convex-witness",
    "center",
    "sw",
    "The chandelier, convex mirror, joined hands, and dog form the room's quiet central register.",
    ["mirror", "domestic-axis", "joined-hands", "bilateral-room"],
    [
      polygon("dress-field", [p(58, 55), p(81, 43), p(95, 90), p(55, 90)], "field", "fill"),
      line("room-axis", p(50, 7), p(50, 92), "muted"),
      ellipse("convex-mirror", 50, 39, 12, 12, "accent", "stroke", "convex room mirror"),
      path("left-figure", [p(10, 89), p(15, 43), p(28, 27), p(44, 89)], "ink"),
      path("right-figure", [p(56, 89), p(64, 28), p(82, 34), p(93, 89)], "ink"),
      path("joined-hands", [p(35, 60), p(49, 58), p(63, 61)], "accent"),
      line("floor-datum", p(8, 89), p(94, 89), "muted"),
    ],
  ),
  "pearl-orbit": blueprint(
    "pearl-orbit",
    "start",
    "se",
    "A single suspended pearl resolves the sitter's head turn and outward gaze without an orbit.",
    ["pearl", "head-turn", "gaze", "suspension"],
    [
      polygon("scarf-field", [p(28, 29), p(41, 8), p(82, 15), p(73, 36)], "field", "fill"),
      path("head-contour", [p(18, 18), p(39, 8), p(66, 18), p(80, 45)], "muted"),
      path("jaw-light", [p(34, 46), p(51, 63), p(70, 58)], "ink"),
      line("gaze", p(36, 31), p(7, 27), "muted"),
      line("pearl-suspension", p(71, 44), p(76, 68), "accent"),
      ellipse("pearl", 76, 74, 6, 7, "accent", "fill", "pearl earring"),
    ],
  ),
  "anatomical-index": blueprint(
    "anatomical-index",
    "end",
    "ne",
    "The cadaver is a datum beneath an arc of witnesses and a precise tendon demonstration.",
    ["cadaver", "observation-arc", "tendon", "lesson"],
    [
      polygon("muscle-field", [p(56, 64), p(81, 54), p(85, 60), p(60, 71)], "accent", "fill"),
      line("body-datum", p(7, 72), p(93, 72), "ink"),
      path("witness-arc", [p(12, 49), p(28, 25), p(52, 21), p(79, 35), p(91, 54)], "muted"),
      line("witness-1", p(22, 35), p(24, 41), "muted"),
      line("witness-2", p(33, 27), p(35, 34), "muted"),
      line("witness-3", p(45, 22), p(46, 30), "muted"),
      line("witness-4", p(58, 23), p(57, 31), "muted"),
      line("witness-5", p(70, 29), p(67, 36), "muted"),
      line("witness-6", p(81, 39), p(77, 45), "muted"),
      line("tendon-1", p(58, 65), p(76, 55), "accent"),
      line("tendon-2", p(61, 67), p(79, 57), "ink"),
      line("tendon-3", p(64, 69), p(82, 59), "muted"),
    ],
  ),
  "vanishing-court": blueprint(
    "vanishing-court",
    "start",
    "nw",
    "Every architectural ray returns to the lit rear doorway that holds the court in perspective.",
    ["single-vanishing-point", "doorway", "court", "witness"],
    [
      rect("door-light", 47, 25, 10, 17, "accent", "fill"),
      rayFan(
        "room-rays",
        p(52, 42),
        [p(5, 96), p(29, 96), p(75, 96), p(95, 96)],
        "muted",
      ),
      line("horizon", p(6, 42), p(94, 42), "ink"),
      rect("mirror", 62, 29, 14, 9, "ink", "stroke"),
      rect("painter-canvas", 5, 17, 18, 68, "muted", "stroke"),
      line("left-room-bay", p(29, 9), p(29, 91), "muted"),
      line("right-room-bay", p(79, 9), p(79, 91), "muted"),
    ],
  ),
  "rising-diagonal": blueprint(
    "rising-diagonal",
    "end",
    "sw",
    "Liberty and the crowd form one rising pyramid capped by the flag's flat fields.",
    ["liberty", "crowd-pyramid", "flag", "ascent"],
    [
      polygon("flag-field-a", [p(70, 5), p(98, 10), p(83, 24), p(69, 18)], "field", "fill"),
      polygon("flag-field-b", [p(69, 18), p(83, 24), p(76, 34), p(65, 27)], "accent", "fill"),
      polygon("crowd-pyramid", [p(9, 89), p(57, 18), p(94, 89)], "ink", "stroke"),
      line("barricade", p(3, 90), p(97, 90), "muted"),
      line("flag-staff", p(57, 19), p(72, 4), "ink"),
      path("crowd-rise", [p(12, 83), p(34, 69), p(56, 45), p(82, 76)], "muted"),
    ],
  ),
  "signal-mast": blueprint(
    "signal-mast",
    "end",
    "ne",
    "Two opposed human pyramids resolve at the survivor's signal above the raft datum.",
    ["raft", "double-pyramid", "survivor", "signal"],
    [
      polygon("signal-cloth", [p(78, 18), p(94, 25), p(78, 31)], "accent", "fill"),
      polygon("weight-pyramid", [p(5, 88), p(49, 35), p(67, 88)], "muted", "stroke"),
      polygon("survival-pyramid", [p(32, 88), p(78, 18), p(97, 88)], "ink", "stroke"),
      line("raft-base", p(5, 88), p(97, 88), "ink"),
      line("mast", p(78, 18), p(78, 82), "muted"),
      path("opposing-wave", [p(3, 72), p(27, 62), p(51, 69), p(74, 58), p(98, 64)], "field"),
    ],
  ),
  "final-tow": blueprint(
    "final-tow",
    "end",
    "sw",
    "The fading ship and compact tug remain joined across one horizon by the final tow.",
    ["horizon", "temeraire", "tug", "sunset"],
    [
      rect("tug-field", 17, 58, 10, 10, "field", "fill"),
      polygon("ship-hull", [p(51, 62), p(80, 61), p(73, 68), p(50, 68)], "muted", "fill"),
      ellipse("setting-sun", 89, 44, 9, 9, "accent", "fill", "setting sun"),
      line("horizon", p(3, 67), p(97, 67), "ink"),
      line("mast-a", p(62, 25), p(62, 64), "ink"),
      line("mast-b", p(70, 32), p(70, 64), "muted"),
      line("tow", p(27, 64), p(61, 65), "accent"),
      path("wake", [p(13, 72), p(37, 76), p(64, 73)], "muted"),
    ],
  ),
  "fog-register": blueprint(
    "fog-register",
    "start",
    "se",
    "A single human axis stands against three receding ridge contours with no invented horizon.",
    ["wanderer", "ridge", "fog", "altitude"],
    [
      polygon("wanderer-field", [p(45, 82), p(47, 49), p(43, 40), p(50, 32), p(57, 40), p(53, 49), p(57, 82)], "field", "fill"),
      path("far-ridge", [p(3, 25), p(23, 18), p(44, 26), p(67, 17), p(97, 24)], "muted"),
      path("middle-ridge", [p(2, 46), p(20, 37), p(42, 48), p(65, 34), p(98, 43)], "ink"),
      path("near-ridge", [p(1, 75), p(23, 61), p(43, 72), p(69, 56), p(99, 68)], "accent"),
      line("figure-axis", p(50, 31), p(50, 84), "muted"),
    ],
  ),
  "orange-signal": blueprint(
    "orange-signal",
    "end",
    "nw",
    "One orange sun establishes a vertical reflection register in the harbor mist.",
    ["sun", "reflection", "harbor", "signal"],
    [
      ellipse("sun", 34, 22, 7, 7, "accent", "fill", "rising sun"),
      line("horizon", p(4, 39), p(96, 39), "ink"),
      line("reflection-1", p(29, 47), p(39, 47), "accent"),
      line("reflection-2", p(25, 56), p(43, 56), "accent"),
      line("reflection-3", p(20, 66), p(48, 66), "accent"),
      line("reflection-4", p(14, 78), p(54, 78), "muted"),
      line("crane-left", p(10, 34), p(10, 74), "field"),
      line("crane-right", p(88, 29), p(88, 70), "field"),
    ],
  ),
  "celestial-current": blueprint(
    "celestial-current",
    "end",
    "sw",
    "Two continuous sky currents are counterweighted by the cypress and mapped stars.",
    ["sky-current", "cypress", "stars", "village"],
    [
      polygon("cypress-field", [p(4, 95), p(8, 42), p(14, 17), p(20, 46), p(26, 95)], "field", "fill"),
      path("outer-current", [p(22, 23), p(43, 8), p(76, 14), p(94, 36), p(75, 56), p(48, 48)], "ink"),
      path("inner-current", [p(34, 29), p(52, 19), p(72, 26), p(76, 42), p(61, 48), p(49, 39)], "accent"),
      polygon("star-a", [p(31, 14), p(33, 18), p(37, 20), p(33, 22), p(31, 26), p(29, 22), p(25, 20), p(29, 18)], "accent", "fill"),
      polygon("star-b", [p(55, 8), p(57, 12), p(61, 14), p(57, 16), p(55, 20), p(53, 16), p(49, 14), p(53, 12)], "ink", "fill"),
      polygon("star-c", [p(82, 17), p(84, 21), p(88, 23), p(84, 25), p(82, 29), p(80, 25), p(76, 23), p(80, 21)], "accent", "fill"),
      line("village-datum", p(3, 83), p(97, 83), "muted"),
    ],
  ),
  "solar-fold": blueprint(
    "solar-fold",
    "start",
    "ne",
    "The sleeping body is read as one off-center curl held inside a single field of heat.",
    ["body-curl", "sleep", "cloth", "heat"],
    [
      path(
        "cloth-field",
        [p(18, 76), p(12, 51), p(24, 25), p(62, 12), p(88, 36), p(84, 75), p(54, 92)],
        "field",
        "fill",
        "smooth",
        true,
      ),
      path("body-curl", [p(22, 72), p(18, 42), p(37, 18), p(70, 19), p(86, 43), p(73, 75), p(43, 84), p(26, 69)], "ink"),
      path("knee-tangent", [p(58, 52), p(75, 61), p(77, 77)], "accent"),
      line("sleep-datum", p(20, 86), p(82, 86), "muted"),
    ],
  ),
  "winter-descent": blueprint(
    "winter-descent",
    "end",
    "ne",
    "Hunters and dogs descend one slope toward the nested frozen ponds below.",
    ["descent", "hunters", "dogs", "frozen-ponds"],
    [
      polygon("snow-bank", [p(0, 79), p(100, 63), p(100, 100), p(0, 100)], "field", "fill"),
      line("descent", p(8, 20), p(88, 76), "accent"),
      line("hunter-1", p(19, 25), p(15, 36), "ink"),
      line("hunter-2", p(29, 31), p(25, 42), "ink"),
      line("dog-1", p(40, 41), p(46, 43), "muted"),
      line("dog-2", p(51, 49), p(57, 51), "muted"),
      line("dog-3", p(61, 57), p(67, 59), "muted"),
      ellipse("near-pond", 77, 78, 18, 7, "ink", "stroke", "frozen pond"),
      ellipse("far-pond", 84, 64, 11, 4, "muted", "stroke", "distant frozen pond"),
    ],
  ),
  "pressed-garden": blueprint(
    "pressed-garden",
    "end",
    "sw",
    "The garden is an enclosure first: wall, tree axis, quadrants, and one gate.",
    ["enclosure", "garden", "tree", "gate"],
    [
      rect("garden-field", 13, 13, 74, 70, "field", "fill"),
      rect("gate-field", 44, 69, 13, 14, "accent", "fill", 6),
      rect("garden-wall", 8, 8, 84, 80, "ink", "stroke"),
      line("tree-axis", p(51, 14), p(50, 83), "ink"),
      line("vertical-quarter", p(50, 8), p(50, 88), "muted"),
      line("horizontal-quarter", p(8, 50), p(92, 50), "muted"),
      path("gate-arch", [p(43, 83), p(44, 70), p(50, 65), p(57, 70), p(58, 83)], "accent"),
      path("root-system", [p(50, 58), p(35, 73), p(20, 78), p(50, 58), p(66, 72), p(80, 77)], "ink", "stroke", "linear"),
    ],
  ),
  "anamorphic-datum": blueprint(
    "anamorphic-datum",
    "start",
    "se",
    "Two vertical ambassadors and two shelves are deliberately broken by the anamorphic skull.",
    ["ambassadors", "shelves", "anamorphosis", "skull"],
    [
      rect("curtain-field", 5, 5, 90, 69, "field", "fill"),
      line("left-ambassador", p(18, 12), p(18, 88), "ink"),
      line("right-ambassador", p(82, 12), p(82, 88), "ink"),
      line("upper-shelf", p(25, 37), p(75, 37), "muted"),
      line("lower-shelf", p(25, 56), p(75, 56), "muted"),
      ellipse("anamorphic-skull", 55, 81, 31, 6, "accent", "stroke", "anamorphic skull", -10),
      line("floor-datum", p(7, 91), p(93, 91), "ink"),
    ],
  ),
  "measured-motion": blueprint(
    "measured-motion",
    "end",
    "ne",
    "The horse's rearing S-curve is measured at withers, knees, and hooves against empty ground.",
    ["horse", "rearing", "measurement", "groundless-field"],
    [
      polygon("flank-field", [p(34, 26), p(62, 20), p(78, 47), p(63, 65), p(36, 56)], "field", "fill"),
      path("horse-contour", [p(27, 76), p(23, 48), p(36, 22), p(62, 16), p(79, 37), p(69, 62), p(82, 79)], "ink"),
      line("ground", p(8, 88), p(92, 88), "muted"),
      line("measure-withers", p(32, 25), p(43, 25), "accent"),
      line("measure-knee-a", p(24, 54), p(36, 54), "accent"),
      line("measure-knee-b", p(66, 61), p(78, 61), "accent"),
      line("measure-hoof-a", p(19, 80), p(31, 80), "accent"),
      line("measure-hoof-b", p(75, 81), p(87, 81), "accent"),
    ],
  ),
  "river-span": blueprint(
    "river-span",
    "start",
    "sw",
    "The bridge arch frames the river's single recession point and two widening banks.",
    ["bridge", "river", "single-vanishing-point", "passage"],
    [
      rect("left-pier", 45, 45, 7, 28, "field", "fill"),
      rect("right-pier", 75, 42, 7, 27, "field", "fill"),
      path("bridge-arch", [p(43, 51), p(62, 30), p(83, 48)], "ink"),
      line("bridge-deck", p(40, 39), p(85, 39), "accent"),
      rayFan("river-banks", p(63, 44), [p(17, 97), p(89, 97)], "muted"),
      path("distant-horizon", [p(3, 25), p(29, 21), p(55, 25), p(78, 20), p(97, 24)], "muted"),
      line("water-axis", p(63, 44), p(63, 96), "ink"),
    ],
  ),
  "screen-current": blueprint(
    "screen-current",
    "end",
    "se",
    "Two opposing plum trees are joined by one broad S-current across the folding screens.",
    ["plum-trees", "screen-folds", "stream", "opposition"],
    [
      path(
        "stream-field",
        [p(2, 69), p(20, 57), p(39, 63), p(49, 47), p(61, 31), p(80, 39), p(98, 25), p(98, 48), p(79, 58), p(61, 51), p(48, 70), p(27, 79), p(2, 89)],
        "field",
        "fill",
        "smooth",
        true,
      ),
      line("fold-1", p(18, 5), p(18, 95), "muted"),
      line("fold-2", p(34, 5), p(34, 95), "muted"),
      line("center-gutter", p(50, 5), p(50, 95), "accent"),
      line("fold-4", p(66, 5), p(66, 95), "muted"),
      line("fold-5", p(82, 5), p(82, 95), "muted"),
      path("white-plum", [p(2, 15), p(24, 25), p(39, 47), p(47, 62)], "ink"),
      path("red-plum", [p(98, 9), p(80, 19), p(67, 37), p(56, 51)], "accent"),
      polygon("white-blossom-a", [p(24, 20), p(27, 24), p(24, 28), p(21, 24)], "ink", "fill"),
      polygon("white-blossom-b", [p(37, 38), p(40, 42), p(37, 46), p(34, 42)], "ink", "fill"),
      polygon("red-blossom-a", [p(78, 15), p(81, 19), p(78, 23), p(75, 19)], "accent", "fill"),
      polygon("red-blossom-b", [p(66, 31), p(69, 35), p(66, 39), p(63, 35)], "accent", "fill"),
    ],
  ),
  "three-measures": blueprint(
    "three-measures",
    "end",
    "ne",
    "Tulip, hourglass, and skull occupy equal bays on one mortality baseline.",
    ["tulip", "hourglass", "skull", "vanitas"],
    [
      ellipse("skull-mass", 80, 50, 12, 17, "field", "fill", "human skull"),
      line("baseline", p(5, 78), p(95, 78), "ink"),
      line("bay-a", p(34, 12), p(34, 82), "muted"),
      line("bay-b", p(66, 12), p(66, 82), "muted"),
      line("tulip-stem", p(18, 30), p(18, 77), "ink"),
      polygon("tulip-bloom", [p(18, 14), p(27, 25), p(18, 34), p(9, 25)], "accent", "fill"),
      polygon("hourglass", [p(43, 25), p(57, 25), p(52, 49), p(57, 73), p(43, 73), p(48, 49)], "ink", "stroke"),
      polygon("skull-eye-a", [p(73, 46), p(77, 43), p(79, 48), p(75, 51)], "ink", "fill"),
      polygon("skull-eye-b", [p(82, 43), p(87, 46), p(85, 51), p(81, 48)], "ink", "fill"),
    ],
  ),
  "mechanical-sun": blueprint(
    "mechanical-sun",
    "center",
    "sw",
    "The lamp is the sole origin for the orrery's spokes, orbits, and illuminated planets.",
    ["orrery", "single-origin", "lamp", "knowledge"],
    [
      ellipse("outer-orbit", 55, 50, 36, 29, "muted", "stroke", "outer orbital path"),
      ellipse("middle-orbit", 55, 50, 26, 20, "ink", "stroke", "middle orbital path"),
      ellipse("inner-orbit", 55, 50, 15, 11, "accent", "stroke", "inner orbital path"),
      rayFan(
        "orrery-spokes",
        p(55, 50),
        [p(55, 12), p(83, 24), p(93, 50), p(79, 77), p(55, 88), p(27, 75), p(17, 50), p(30, 22)],
        "muted",
      ),
      ellipse("lamp-core", 55, 50, 7, 7, "accent", "fill", "orrery lamp"),
      ellipse("planet-a", 83, 27, 4, 4, "field", "fill", "orrery planet"),
      ellipse("planet-b", 77, 69, 3, 3, "ink", "fill", "orrery planet"),
      ellipse("planet-c", 34, 37, 3.5, 3.5, "field", "fill", "orrery planet"),
    ],
  ),
  "sleep-pressure": blueprint(
    "sleep-pressure",
    "start",
    "ne",
    "Five equal-weight pressure lines terminate on the sleeping torso beneath the curtain.",
    ["sleep", "pressure", "torso", "curtain"],
    [
      polygon("curtain-field", [p(72, 4), p(96, 4), p(96, 82), p(84, 67), p(78, 34)], "field", "fill"),
      path("torso", [p(10, 69), p(34, 58), p(60, 61), p(87, 72)], "ink"),
      line("pressure-1", p(20, 17), p(20, 65), "muted"),
      line("pressure-2", p(34, 11), p(34, 59), "muted"),
      line("pressure-3", p(48, 8), p(48, 59), "accent"),
      line("pressure-4", p(62, 13), p(62, 62), "muted"),
      line("pressure-5", p(76, 20), p(76, 67), "muted"),
      line("bed-datum", p(5, 79), p(94, 79), "ink"),
    ],
  ),
  "perspective-proof": blueprint(
    "perspective-proof",
    "end",
    "se",
    "The architectural grid proves one vanishing point around the recessed sacred scene.",
    ["single-vanishing-point", "architecture", "flagellation", "foreground"],
    [
      rect("sacred-room", 26, 28, 16, 17, "accent", "fill"),
      rect("foreground-a", 61, 48, 8, 39, "field", "fill"),
      rect("foreground-b", 73, 44, 8, 43, "field", "fill"),
      rect("foreground-c", 85, 49, 8, 38, "field", "fill"),
      rayFan(
        "architecture-rays",
        p(34, 39),
        [p(4, 4), p(4, 96), p(25, 96), p(64, 96), p(96, 96), p(96, 12)],
        "muted",
      ),
      line("cross-plane-1", p(4, 51), p(96, 51), "ink"),
      line("cross-plane-2", p(4, 64), p(96, 64), "muted"),
      line("cross-plane-3", p(4, 78), p(96, 78), "muted"),
      line("left-column", p(12, 7), p(12, 92), "ink"),
      line("scene-column", p(56, 7), p(56, 92), "ink"),
    ],
  ),
  "severed-baseline": blueprint(
    "severed-baseline",
    "end",
    "nw",
    "The blade and two arm vectors meet at the neck and cut across the bed's stable datum.",
    ["blade", "arms", "neck-intersection", "violence"],
    [
      polygon("bed-field", [p(2, 72), p(98, 72), p(98, 98), p(2, 98)], "field", "fill"),
      polygon("oxblood-cut", [p(54, 58), p(73, 49), p(76, 55), p(58, 63)], "accent", "fill"),
      line("bed-baseline", p(3, 72), p(97, 72), "ink"),
      line("blade", p(16, 84), p(83, 32), "accent"),
      line("judith-arm", p(20, 26), p(57, 60), "ink"),
      line("abra-arm", p(91, 82), p(57, 60), "muted"),
      line("neck-register", p(50, 60), p(64, 60), "ink"),
    ],
  ),
  "two-armies": blueprint(
    "two-armies",
    "start",
    "se",
    "Two ordered wedges collide beneath the painting's opposed sun and moon.",
    ["army-wedges", "collision", "sun", "moon"],
    [
      polygon("alexander-field", [p(2, 96), p(48, 59), p(52, 67), p(42, 98)], "field", "fill"),
      polygon("darius-field", [p(98, 96), p(55, 58), p(51, 67), p(62, 98)], "accent", "fill"),
      polygon("alexander-front", [p(2, 96), p(48, 59), p(52, 67), p(42, 98)], "ink", "stroke"),
      polygon("darius-front", [p(98, 96), p(55, 58), p(51, 67), p(62, 98)], "ink", "stroke"),
      line("collision-axis", p(52, 58), p(52, 98), "ink"),
      line("horizon", p(4, 48), p(96, 48), "muted"),
      ellipse("celestial-sun", 84, 22, 8, 8, "accent", "fill", "celestial sun"),
      ellipse("celestial-moon", 16, 18, 6, 6, "ink", "stroke", "celestial moon"),
    ],
  ),
  "petal-avalanche": blueprint(
    "petal-avalanche",
    "end",
    "ne",
    "The roses behave as one descending weather front rather than disconnected petals.",
    ["rose-field", "cascade", "weather", "banquet"],
    [
      path(
        "rose-mass",
        [p(3, 20), p(24, 23), p(43, 38), p(59, 45), p(79, 57), p(98, 78), p(98, 97), p(50, 94), p(17, 82), p(2, 60)],
        "accent",
        "fill",
        "smooth",
        true,
      ),
      path("flow-a", [p(5, 19), p(31, 28), p(56, 45), p(91, 70)], "ink"),
      path("flow-b", [p(3, 34), p(27, 39), p(55, 55), p(96, 82)], "muted"),
      path("flow-c", [p(2, 51), p(23, 55), p(52, 69), p(90, 91)], "ink"),
      line("banquet-datum", p(13, 67), p(94, 67), "field"),
    ],
  ),
  "acid-cabaret": blueprint(
    "acid-cabaret",
    "end",
    "sw",
    "The foreground table's oblique plane challenges the vertical mirror seams and cyan edge face.",
    ["table-plane", "mirror", "nightlife", "edge-anchor"],
    [
      polygon("table-field", [p(0, 62), p(62, 45), p(79, 100), p(0, 100)], "field", "fill"),
      rect("edge-signal", 88, 18, 9, 70, "accent", "fill"),
      line("table-edge", p(0, 62), p(62, 45), "accent"),
      line("mirror-seam-a", p(22, 7), p(22, 79), "muted"),
      line("mirror-seam-b", p(49, 7), p(49, 72), "muted"),
      line("mirror-seam-c", p(76, 7), p(76, 83), "muted"),
      line("counter-horizon", p(5, 31), p(94, 31), "ink"),
    ],
  ),
  "unstable-table": blueprint(
    "unstable-table",
    "start",
    "se",
    "Two incompatible table planes hold a basket, bottle, cloth, and mapped apples in productive imbalance.",
    ["broken-perspective", "table", "basket", "apples"],
    [
      polygon("cloth-field", [p(21, 58), p(88, 51), p(94, 88), p(34, 96), p(8, 78)], "muted", "fill"),
      line("table-plane-a", p(3, 79), p(96, 65), "ink"),
      line("table-plane-b", p(8, 50), p(91, 57), "accent"),
      path("basket-arc", [p(8, 48), p(22, 20), p(49, 23), p(57, 49)], "ink"),
      line("bottle-axis", p(62, 11), p(62, 61), "field"),
      ellipse("apple-a", 25, 39, 7, 7, "field", "fill", "apple"),
      ellipse("apple-b", 39, 34, 6, 6, "accent", "fill", "apple"),
      ellipse("apple-c", 51, 46, 7, 7, "field", "fill", "apple"),
      ellipse("apple-d", 70, 66, 7, 7, "accent", "fill", "apple"),
      ellipse("apple-e", 84, 61, 6, 6, "field", "fill", "apple"),
    ],
  ),
  "falling-sun": blueprint(
    "falling-sun",
    "start",
    "ne",
    "The fallen body's diagonal is held between two wing contours and two mourning figures.",
    ["icarus", "wings", "fall", "lament"],
    [
      ellipse("sun", 88, 84, 9, 9, "accent", "fill", "setting sun"),
      line("body-descent", p(27, 31), p(68, 75), "accent"),
      path("left-wing", [p(7, 20), p(19, 8), p(34, 24), p(43, 58), p(26, 76)], "ink"),
      path("right-wing", [p(55, 52), p(70, 27), p(91, 24), p(88, 64), p(69, 78)], "ink"),
      line("feather-1", p(13, 22), p(29, 43), "muted"),
      line("feather-2", p(18, 18), p(34, 39), "muted"),
      line("feather-3", p(63, 43), p(84, 35), "muted"),
      line("feather-4", p(67, 51), p(89, 47), "muted"),
      line("feather-5", p(70, 59), p(88, 60), "muted"),
      path("nymph-left", [p(18, 88), p(21, 72), p(31, 65)], "field"),
      path("nymph-right", [p(82, 88), p(79, 73), p(69, 66)], "field"),
    ],
  ),
  "basin-rhythm": blueprint(
    "basin-rhythm",
    "end",
    "nw",
    "One wash basin anchors the mother's enclosing arm and the child's descending limb.",
    ["basin", "embrace", "care", "floor-grid"],
    [
      rect("rug-tile-a", 12, 82, 14, 10, "field", "fill"),
      rect("rug-tile-b", 28, 82, 14, 10, "accent", "fill"),
      rect("rug-tile-c", 44, 82, 14, 10, "field", "fill"),
      rect("rug-tile-d", 60, 82, 14, 10, "accent", "fill"),
      ellipse("wash-basin", 51, 69, 31, 14, "accent", "stroke", "wash basin"),
      path("mother-embrace", [p(20, 61), p(23, 27), p(50, 17), p(71, 36), p(68, 61)], "ink"),
      line("child-limb", p(49, 35), p(61, 74), "muted"),
      line("floor-grid-a", p(8, 80), p(88, 80), "muted"),
      line("floor-grid-b", p(8, 94), p(88, 94), "muted"),
      polygon("pitcher-field", [p(82, 49), p(94, 55), p(91, 81), p(79, 75)], "field", "fill"),
    ],
  ),
  "name-restored": blueprint(
    "name-restored",
    "start",
    "sw",
    "Madeleine's gaze extends into the blank ground where her name and record can finally sit.",
    ["madeleine", "gaze", "identity", "record"],
    [
      rect("sash-field", 8, 55, 13, 33, "field", "fill"),
      rect("nameplate", 51, 20, 42, 9, "accent", "fill"),
      line("portrait-register", p(42, 8), p(42, 92), "ink"),
      line("gaze-axis", p(35, 32), p(94, 32), "accent"),
      line("record-a", p(52, 43), p(91, 43), "muted"),
      line("record-b", p(52, 54), p(83, 54), "muted"),
      line("record-c", p(52, 65), p(94, 65), "muted"),
      line("forearm-datum", p(30, 76), p(94, 76), "ink"),
      path("headwrap", [p(13, 30), p(17, 8), p(36, 7), p(45, 25), p(40, 49)], "field"),
    ],
  ),
} satisfies Record<CompositionMotif, MotifBlueprint>);
