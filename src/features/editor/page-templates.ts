import { PageTemplate } from "./types";

// Padding from page edges (in percentage)
const PADDING = 5;
const INNER_WIDTH = 100 - PADDING * 2;
const INNER_HEIGHT = 100 - PADDING * 2;

export const PAGE_TEMPLATES: PageTemplate[] = [
  // ============ BLANK ============
  {
    id: "blank",
    name: "Blank",
    category: "blank",
    frames: [],
  },

  // ============ SINGLE PHOTO LAYOUTS ============
  {
    id: "single-full",
    name: "Full Page",
    category: "single",
    frames: [{ x: PADDING, y: PADDING, width: INNER_WIDTH, height: INNER_HEIGHT }],
  },
  {
    id: "single-center",
    name: "Centered",
    category: "single",
    frames: [{ x: 15, y: 15, width: 70, height: 70 }],
  },
  {
    id: "single-top-left",
    name: "Top Left",
    category: "single",
    frames: [{ x: PADDING, y: PADDING, width: 60, height: 60 }],
  },
  {
    id: "single-top-right",
    name: "Top Right",
    category: "single",
    frames: [{ x: 35, y: PADDING, width: 60, height: 60 }],
  },
  {
    id: "single-bottom-left",
    name: "Bottom Left",
    category: "single",
    frames: [{ x: PADDING, y: 35, width: 60, height: 60 }],
  },
  {
    id: "single-bottom-right",
    name: "Bottom Right",
    category: "single",
    frames: [{ x: 35, y: 35, width: 60, height: 60 }],
  },
  {
    id: "single-landscape-center",
    name: "Landscape Center",
    category: "single",
    frames: [{ x: 10, y: 20, width: 80, height: 60 }],
  },
  {
    id: "single-portrait-center",
    name: "Portrait Center",
    category: "single",
    frames: [{ x: 20, y: 10, width: 60, height: 80 }],
  },

  // ============ TWO PHOTO LAYOUTS ============
  {
    id: "double-horizontal-half",
    name: "Horizontal Split",
    category: "double",
    frames: [
      { x: PADDING, y: PADDING, width: INNER_WIDTH, height: 43 },
      { x: PADDING, y: 52, width: INNER_WIDTH, height: 43 },
    ],
  },
  {
    id: "double-vertical-half",
    name: "Vertical Split",
    category: "double",
    frames: [
      { x: PADDING, y: PADDING, width: 43, height: INNER_HEIGHT },
      { x: 52, y: PADDING, width: 43, height: INNER_HEIGHT },
    ],
  },
  {
    id: "double-top-large-bottom-small",
    name: "Top Large",
    category: "double",
    frames: [
      { x: PADDING, y: PADDING, width: INNER_WIDTH, height: 60 },
      { x: 25, y: 70, width: 50, height: 25 },
    ],
  },
  {
    id: "double-bottom-large-top-small",
    name: "Bottom Large",
    category: "double",
    frames: [
      { x: 25, y: PADDING, width: 50, height: 25 },
      { x: PADDING, y: 35, width: INNER_WIDTH, height: 60 },
    ],
  },
  {
    id: "double-left-large-right-small",
    name: "Left Large",
    category: "double",
    frames: [
      { x: PADDING, y: PADDING, width: 60, height: INNER_HEIGHT },
      { x: 70, y: PADDING, width: 25, height: INNER_HEIGHT },
    ],
  },
  {
    id: "double-right-large-left-small",
    name: "Right Large",
    category: "double",
    frames: [
      { x: PADDING, y: PADDING, width: 25, height: INNER_HEIGHT },
      { x: 35, y: PADDING, width: 60, height: INNER_HEIGHT },
    ],
  },
  {
    id: "double-diagonal-tl-br",
    name: "Diagonal TL-BR",
    category: "double",
    frames: [
      { x: PADDING, y: PADDING, width: 55, height: 45 },
      { x: 40, y: 50, width: 55, height: 45 },
    ],
  },
  {
    id: "double-diagonal-tr-bl",
    name: "Diagonal TR-BL",
    category: "double",
    frames: [
      { x: 40, y: PADDING, width: 55, height: 45 },
      { x: PADDING, y: 50, width: 55, height: 45 },
    ],
  },

  // ============ THREE PHOTO LAYOUTS ============
  {
    id: "triple-horizontal",
    name: "Three Horizontal",
    category: "triple",
    frames: [
      { x: PADDING, y: PADDING, width: INNER_WIDTH, height: 28 },
      { x: PADDING, y: 37, width: INNER_WIDTH, height: 28 },
      { x: PADDING, y: 67, width: INNER_WIDTH, height: 28 },
    ],
  },
  {
    id: "triple-vertical",
    name: "Three Vertical",
    category: "triple",
    frames: [
      { x: PADDING, y: PADDING, width: 28, height: INNER_HEIGHT },
      { x: 37, y: PADDING, width: 28, height: INNER_HEIGHT },
      { x: 67, y: PADDING, width: 28, height: INNER_HEIGHT },
    ],
  },
  {
    id: "triple-one-top-two-bottom",
    name: "One Top, Two Bottom",
    category: "triple",
    frames: [
      { x: PADDING, y: PADDING, width: INNER_WIDTH, height: 55 },
      { x: PADDING, y: 65, width: 43, height: 30 },
      { x: 52, y: 65, width: 43, height: 30 },
    ],
  },
  {
    id: "triple-two-top-one-bottom",
    name: "Two Top, One Bottom",
    category: "triple",
    frames: [
      { x: PADDING, y: PADDING, width: 43, height: 30 },
      { x: 52, y: PADDING, width: 43, height: 30 },
      { x: PADDING, y: 40, width: INNER_WIDTH, height: 55 },
    ],
  },
  {
    id: "triple-one-left-two-right",
    name: "One Left, Two Right",
    category: "triple",
    frames: [
      { x: PADDING, y: PADDING, width: 55, height: INNER_HEIGHT },
      { x: 65, y: PADDING, width: 30, height: 43 },
      { x: 65, y: 52, width: 30, height: 43 },
    ],
  },
  {
    id: "triple-two-left-one-right",
    name: "Two Left, One Right",
    category: "triple",
    frames: [
      { x: PADDING, y: PADDING, width: 30, height: 43 },
      { x: PADDING, y: 52, width: 30, height: 43 },
      { x: 40, y: PADDING, width: 55, height: INNER_HEIGHT },
    ],
  },
  {
    id: "triple-feature-left",
    name: "Feature Left",
    category: "triple",
    frames: [
      { x: PADDING, y: PADDING, width: 60, height: INNER_HEIGHT },
      { x: 70, y: PADDING, width: 25, height: 43 },
      { x: 70, y: 52, width: 25, height: 43 },
    ],
  },
  {
    id: "triple-feature-right",
    name: "Feature Right",
    category: "triple",
    frames: [
      { x: PADDING, y: PADDING, width: 25, height: 43 },
      { x: PADDING, y: 52, width: 25, height: 43 },
      { x: 35, y: PADDING, width: 60, height: INNER_HEIGHT },
    ],
  },

  // ============ FOUR PHOTO LAYOUTS ============
  {
    id: "quad-grid",
    name: "2x2 Grid",
    category: "quad",
    frames: [
      { x: PADDING, y: PADDING, width: 43, height: 43 },
      { x: 52, y: PADDING, width: 43, height: 43 },
      { x: PADDING, y: 52, width: 43, height: 43 },
      { x: 52, y: 52, width: 43, height: 43 },
    ],
  },
  {
    id: "quad-horizontal",
    name: "Four Horizontal",
    category: "quad",
    frames: [
      { x: PADDING, y: PADDING, width: INNER_WIDTH, height: 20 },
      { x: PADDING, y: 29, width: INNER_WIDTH, height: 20 },
      { x: PADDING, y: 53, width: INNER_WIDTH, height: 20 },
      { x: PADDING, y: 76, width: INNER_WIDTH, height: 20 },
    ],
  },
  {
    id: "quad-vertical",
    name: "Four Vertical",
    category: "quad",
    frames: [
      { x: PADDING, y: PADDING, width: 20, height: INNER_HEIGHT },
      { x: 29, y: PADDING, width: 20, height: INNER_HEIGHT },
      { x: 53, y: PADDING, width: 20, height: INNER_HEIGHT },
      { x: 76, y: PADDING, width: 20, height: INNER_HEIGHT },
    ],
  },
  {
    id: "quad-one-large-three-small",
    name: "One Large, Three Small",
    category: "quad",
    frames: [
      { x: PADDING, y: PADDING, width: 60, height: INNER_HEIGHT },
      { x: 70, y: PADDING, width: 25, height: 28 },
      { x: 70, y: 37, width: 25, height: 28 },
      { x: 70, y: 67, width: 25, height: 28 },
    ],
  },
  {
    id: "quad-three-small-one-large",
    name: "Three Small, One Large",
    category: "quad",
    frames: [
      { x: PADDING, y: PADDING, width: 25, height: 28 },
      { x: PADDING, y: 37, width: 25, height: 28 },
      { x: PADDING, y: 67, width: 25, height: 28 },
      { x: 35, y: PADDING, width: 60, height: INNER_HEIGHT },
    ],
  },
  {
    id: "quad-top-large-three-bottom",
    name: "Top Large, Three Bottom",
    category: "quad",
    frames: [
      { x: PADDING, y: PADDING, width: INNER_WIDTH, height: 60 },
      { x: PADDING, y: 70, width: 28, height: 25 },
      { x: 37, y: 70, width: 28, height: 25 },
      { x: 67, y: 70, width: 28, height: 25 },
    ],
  },
  {
    id: "quad-three-top-bottom-large",
    name: "Three Top, Bottom Large",
    category: "quad",
    frames: [
      { x: PADDING, y: PADDING, width: 28, height: 25 },
      { x: 37, y: PADDING, width: 28, height: 25 },
      { x: 67, y: PADDING, width: 28, height: 25 },
      { x: PADDING, y: 35, width: INNER_WIDTH, height: 60 },
    ],
  },
  {
    id: "quad-corners",
    name: "Corner Photos",
    category: "quad",
    frames: [
      { x: PADDING, y: PADDING, width: 35, height: 35 },
      { x: 60, y: PADDING, width: 35, height: 35 },
      { x: PADDING, y: 60, width: 35, height: 35 },
      { x: 60, y: 60, width: 35, height: 35 },
    ],
  },

  // ============ GRID LAYOUTS ============
  {
    id: "grid-2x3",
    name: "2x3 Grid",
    category: "grid",
    frames: [
      { x: PADDING, y: PADDING, width: 43, height: 28 },
      { x: 52, y: PADDING, width: 43, height: 28 },
      { x: PADDING, y: 37, width: 43, height: 28 },
      { x: 52, y: 37, width: 43, height: 28 },
      { x: PADDING, y: 67, width: 43, height: 28 },
      { x: 52, y: 67, width: 43, height: 28 },
    ],
  },
  {
    id: "grid-3x2",
    name: "3x2 Grid",
    category: "grid",
    frames: [
      { x: PADDING, y: PADDING, width: 28, height: 43 },
      { x: 37, y: PADDING, width: 28, height: 43 },
      { x: 67, y: PADDING, width: 28, height: 43 },
      { x: PADDING, y: 52, width: 28, height: 43 },
      { x: 37, y: 52, width: 28, height: 43 },
      { x: 67, y: 52, width: 28, height: 43 },
    ],
  },
  {
    id: "grid-3x3",
    name: "3x3 Grid",
    category: "grid",
    frames: [
      { x: PADDING, y: PADDING, width: 28, height: 28 },
      { x: 37, y: PADDING, width: 28, height: 28 },
      { x: 67, y: PADDING, width: 28, height: 28 },
      { x: PADDING, y: 37, width: 28, height: 28 },
      { x: 37, y: 37, width: 28, height: 28 },
      { x: 67, y: 37, width: 28, height: 28 },
      { x: PADDING, y: 67, width: 28, height: 28 },
      { x: 37, y: 67, width: 28, height: 28 },
      { x: 67, y: 67, width: 28, height: 28 },
    ],
  },
  {
    id: "grid-1x4",
    name: "1x4 Strip",
    category: "grid",
    frames: [
      { x: PADDING, y: PADDING, width: 20, height: INNER_HEIGHT },
      { x: 29, y: PADDING, width: 20, height: INNER_HEIGHT },
      { x: 53, y: PADDING, width: 20, height: INNER_HEIGHT },
      { x: 76, y: PADDING, width: 20, height: INNER_HEIGHT },
    ],
  },
  {
    id: "grid-4x1",
    name: "4x1 Strip",
    category: "grid",
    frames: [
      { x: PADDING, y: PADDING, width: INNER_WIDTH, height: 20 },
      { x: PADDING, y: 29, width: INNER_WIDTH, height: 20 },
      { x: PADDING, y: 53, width: INNER_WIDTH, height: 20 },
      { x: PADDING, y: 76, width: INNER_WIDTH, height: 20 },
    ],
  },

  // ============ DECORATIVE LAYOUTS ============
  {
    id: "deco-polaroid-single",
    name: "Polaroid Style",
    category: "decorative",
    frames: [{ x: 15, y: 10, width: 70, height: 65 }],
  },
  {
    id: "deco-overlap-two",
    name: "Two Overlapping",
    category: "decorative",
    frames: [
      { x: PADDING, y: 15, width: 55, height: 55 },
      { x: 35, y: 30, width: 55, height: 55 },
    ],
  },
  {
    id: "deco-overlap-three",
    name: "Three Overlapping",
    category: "decorative",
    frames: [
      { x: PADDING, y: PADDING, width: 50, height: 50 },
      { x: 25, y: 25, width: 50, height: 50 },
      { x: 45, y: 45, width: 50, height: 50 },
    ],
  },
  {
    id: "deco-scattered",
    name: "Scattered Photos",
    category: "decorative",
    frames: [
      { x: PADDING, y: 10, width: 40, height: 35 },
      { x: 50, y: PADDING, width: 35, height: 40 },
      { x: 55, y: 50, width: 40, height: 35 },
      { x: 10, y: 55, width: 35, height: 40 },
    ],
  },
  {
    id: "deco-staircase",
    name: "Staircase",
    category: "decorative",
    frames: [
      { x: PADDING, y: PADDING, width: 30, height: 30 },
      { x: 25, y: 25, width: 30, height: 30 },
      { x: 45, y: 45, width: 30, height: 30 },
      { x: 65, y: 65, width: 30, height: 30 },
    ],
  },
  {
    id: "deco-l-shape",
    name: "L-Shape",
    category: "decorative",
    frames: [
      { x: PADDING, y: PADDING, width: INNER_WIDTH, height: 40 },
      { x: PADDING, y: 50, width: 40, height: 45 },
    ],
  },
  {
    id: "deco-t-shape",
    name: "T-Shape",
    category: "decorative",
    frames: [
      { x: PADDING, y: PADDING, width: INNER_WIDTH, height: 40 },
      { x: 30, y: 50, width: 40, height: 45 },
    ],
  },
  {
    id: "deco-cross",
    name: "Cross Layout",
    category: "decorative",
    frames: [
      { x: 30, y: PADDING, width: 40, height: 25 },
      { x: PADDING, y: 35, width: 25, height: 30 },
      { x: 30, y: 35, width: 40, height: 30 },
      { x: 70, y: 35, width: 25, height: 30 },
      { x: 30, y: 70, width: 40, height: 25 },
    ],
  },
  {
    id: "deco-frame-in-frame",
    name: "Frame in Frame",
    category: "decorative",
    frames: [
      { x: PADDING, y: PADDING, width: INNER_WIDTH, height: INNER_HEIGHT },
      { x: 25, y: 25, width: 50, height: 50 },
    ],
  },
  {
    id: "deco-side-stack",
    name: "Side Stack",
    category: "decorative",
    frames: [
      { x: PADDING, y: 10, width: 25, height: 25 },
      { x: PADDING, y: 40, width: 25, height: 25 },
      { x: PADDING, y: 70, width: 25, height: 25 },
      { x: 35, y: PADDING, width: 60, height: INNER_HEIGHT },
    ],
  },
  {
    id: "deco-top-stack",
    name: "Top Stack",
    category: "decorative",
    frames: [
      { x: 10, y: PADDING, width: 25, height: 25 },
      { x: 40, y: PADDING, width: 25, height: 25 },
      { x: 70, y: PADDING, width: 25, height: 25 },
      { x: PADDING, y: 35, width: INNER_WIDTH, height: 60 },
    ],
  },
  {
    id: "deco-mosaic",
    name: "Mosaic",
    category: "decorative",
    frames: [
      { x: PADDING, y: PADDING, width: 60, height: 40 },
      { x: 70, y: PADDING, width: 25, height: 20 },
      { x: 70, y: 29, width: 25, height: 20 },
      { x: PADDING, y: 50, width: 28, height: 45 },
      { x: 37, y: 50, width: 28, height: 45 },
      { x: 67, y: 50, width: 28, height: 45 },
    ],
  },
  {
    id: "deco-filmstrip",
    name: "Filmstrip",
    category: "decorative",
    frames: [
      { x: 10, y: 30, width: 18, height: 40 },
      { x: 30, y: 30, width: 18, height: 40 },
      { x: 50, y: 30, width: 18, height: 40 },
      { x: 70, y: 30, width: 18, height: 40 },
    ],
  },
  {
    id: "deco-diamond",
    name: "Diamond Center",
    category: "decorative",
    frames: [
      { x: 25, y: 25, width: 50, height: 50 },
    ],
  },
  {
    id: "deco-panoramic",
    name: "Panoramic",
    category: "decorative",
    frames: [
      { x: PADDING, y: 30, width: INNER_WIDTH, height: 40 },
    ],
  },
];

// Group templates by category for UI display
export const TEMPLATE_CATEGORIES = {
  blank: PAGE_TEMPLATES.filter((t) => t.category === "blank"),
  single: PAGE_TEMPLATES.filter((t) => t.category === "single"),
  double: PAGE_TEMPLATES.filter((t) => t.category === "double"),
  triple: PAGE_TEMPLATES.filter((t) => t.category === "triple"),
  quad: PAGE_TEMPLATES.filter((t) => t.category === "quad"),
  grid: PAGE_TEMPLATES.filter((t) => t.category === "grid"),
  decorative: PAGE_TEMPLATES.filter((t) => t.category === "decorative"),
};

export const CATEGORY_LABELS: Record<string, string> = {
  blank: "Blank",
  single: "Single Photo",
  double: "Two Photos",
  triple: "Three Photos",
  quad: "Four Photos",
  grid: "Grid Layouts",
  decorative: "Decorative",
};

// Helper to get a template by ID
export const getTemplateById = (id: string): PageTemplate | undefined => {
  return PAGE_TEMPLATES.find((t) => t.id === id);
};
