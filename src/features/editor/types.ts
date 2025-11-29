import { fabric } from "fabric";
import { ITextboxOptions } from "fabric/fabric-impl";
import * as material from "material-colors";

export const JSON_KEYS = [
  "name",
  "gradientAngle",
  "selectable",
  "hasControls",
  "linkData",
  "editable",
  "extensionType",
  "extension",
  "pageNumber",
  "isPageWorkspace",
  "imageUrl",
  "frameWidth",
  "frameHeight",
  "imageScaleX",
  "imageScaleY",
  "imageOffsetX",
  "imageOffsetY",
  "fitMode",
  "locked",
];

export const filters = [
  "none",
  "polaroid",
  "sepia",
  "kodachrome",
  "contrast",
  "brightness",
  "greyscale",
  "brownie",
  "vintage",
  "technicolor",
  "pixelate",
  "invert",
  "blur",
  "sharpen",
  "emboss",
  "removecolor",
  "blacknwhite",
  "vibrance",
  "blendcolor",
  "huerotate",
  "resize",
  "saturation",
  "gamma",
];

export const fonts = [
  "Arial",
  "Arial Black",
  "Verdana",
  "Helvetica",
  "Tahoma",
  "Trebuchet MS",
  "Times New Roman",
  "Georgia",
  "Garamond",
  "Courier New",
  "Brush Script MT",
  "Palatino",
  "Bookman",
  "Comic Sans MS",
  "Impact",
  "Lucida Sans Unicode",
  "Geneva",
  "Lucida Console",
];

export const selectionDependentTools = [
  "fill",
  "font",
  "filter",
  "opacity",
  "remove-bg",
  "stroke-color",
  "stroke-width",
];

export const colors = [
  material.red["500"],
  material.pink["500"],
  material.purple["500"],
  material.deepPurple["500"],
  material.indigo["500"],
  material.blue["500"],
  material.lightBlue["500"],
  material.cyan["500"],
  material.teal["500"],
  material.green["500"],
  material.lightGreen["500"],
  material.lime["500"],
  material.yellow["500"],
  material.amber["500"],
  material.orange["500"],
  material.deepOrange["500"],
  material.brown["500"],
  material.blueGrey["500"],
  "transparent",
];

export type ActiveTool =
  | "select"
  | "shapes"
  | "text"
  | "images"
  | "draw"
  | "fill"
  | "stroke-color"
  | "stroke-width"
  | "font"
  | "opacity"
  | "filter"
  | "settings"
  | "ai"
  | "remove-bg"
  | "templates"
  | "image-frame"
  | "properties"
  | "pages";

// Page template types for the Pages tab
export interface FramePosition {
  x: number;      // percentage 0-100
  y: number;      // percentage 0-100
  width: number;  // percentage 0-100
  height: number; // percentage 0-100
}

export interface PageTemplate {
  id: string;
  name: string;
  category: "blank" | "single" | "double" | "triple" | "quad" | "grid" | "decorative";
  frames: FramePosition[];
}

export interface PageInfo {
  pageNumber: number;
  spreadIndex: number;
  isLeftPage: boolean;
}

export const FILL_COLOR = "rgba(0,0,0,1)";
export const STROKE_COLOR = "rgba(0,0,0,1)";
export const STROKE_WIDTH = 2;
export const STROKE_DASH_ARRAY = [];
export const FONT_FAMILY = "Arial";
export const FONT_SIZE = 30;
export const FONT_WEIGHT = 400;

export const CIRCLE_OPTIONS = {
  radius: 200,
  left: 100,
  top: 100,
  fill: FILL_COLOR,
  stroke: STROKE_COLOR,
  strokeWidth: STROKE_WIDTH,
};

export const RECTANGLE_OPTIONS = {
  left: 100,
  top: 100,
  fill: FILL_COLOR,
  stroke: STROKE_COLOR,
  strokeWidth: STROKE_WIDTH,
  width: 400,
  height: 400,
  angle: 0,
};

export const DIAMOND_OPTIONS = {
  left: 100,
  top: 100,
  fill: FILL_COLOR,
  stroke: STROKE_COLOR,
  strokeWidth: STROKE_WIDTH,
  width: 600,
  height: 600,
  angle: 0,
};

export const TRIANGLE_OPTIONS = {
  left: 100,
  top: 100,
  fill: FILL_COLOR,
  stroke: STROKE_COLOR,
  strokeWidth: STROKE_WIDTH,
  width: 400,
  height: 400,
  angle: 0,
};

export const TEXT_OPTIONS = {
  type: "textbox",
  left: 100,
  top: 100,
  fill: FILL_COLOR,
  fontSize: FONT_SIZE,
  fontFamily: FONT_FAMILY,
};

export interface SnappingOptions {
  snapToGrid: boolean;
  snapToObjects: boolean;
  snapToCanvas: boolean;
  snapRotation: boolean;
  snapGridSize: number;
  visualGridSize: number;
  snapThreshold: number;
  showGrid: boolean;
}

export interface SnapLine {
  x?: number;
  y?: number;
  orientation: "horizontal" | "vertical";
  source?: "canvas" | "object"; // canvas = page snapping, object = object-to-object snapping
}

export interface EditorHookProps {
  defaultState?: string;
  defaultWidth?: number;
  defaultHeight?: number;
  defaultPageCount?: number;
  clearSelectionCallback?: () => void;
  saveCallback?: (values: {
    json: string;
    height: number;
    width: number;
  }) => void;
};

export type BuildEditorProps = {
  undo: () => void;
  redo: () => void;
  save: (skip?: boolean) => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  autoZoom: () => void;
  copy: () => void;
  paste: () => void;
  canvas: fabric.Canvas;
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  selectedObjects: fabric.Object[];
  strokeDashArray: number[];
  fontFamily: string;
  setStrokeDashArray: (value: number[]) => void;
  setFillColor: (value: string) => void;
  setStrokeColor: (value: string) => void;
  setStrokeWidth: (value: number) => void;
  setFontFamily: (value: string) => void;
  snappingOptions: SnappingOptions;
  setSnappingOptions: (options: Partial<SnappingOptions>) => void;
  pageCount: number;
  focusedPageNumber: number;
  setFocusedPageNumber: (pageNumber: number) => void;
};

export interface Editor {
  savePng: () => void;
  saveJpg: () => void;
  saveSvg: () => void;
  saveJson: () => void;
  loadJson: (json: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  autoZoom: () => void;
  zoomIn: (point?: fabric.Point) => void;
  zoomOut: (point?: fabric.Point) => void;
  getWorkspace: () => fabric.Object | undefined;
  changeBackground: (value: string) => void;
  changeSize: (value: { width: number; height: number }) => void;
  enableDrawingMode: () => void;
  disableDrawingMode: () => void;
  onCopy: () => void;
  onPaste: () => void;
  changeImageFilter: (value: string) => void;
  addImage: (value: string, options?: { left?: number; top?: number }) => void;
  replaceFrameImage: (frame: any, newImageUrl: string) => void;
  delete: () => void;
  changeFontSize: (value: number) => void;
  getActiveFontSize: () => number;
  changeTextAlign: (value: string) => void;
  getActiveTextAlign: () => string;
  changeFontUnderline: (value: boolean) => void;
  getActiveFontUnderline: () => boolean;
  changeFontLinethrough: (value: boolean) => void;
  getActiveFontLinethrough: () => boolean;
  changeFontStyle: (value: string) => void;
  getActiveFontStyle: () => string;
  changeFontWeight: (value: number) => void;
  getActiveFontWeight: () => number;
  getActiveFontFamily: () => string;
  changeFontFamily: (value: string) => void;
  addText: (value: string, options?: ITextboxOptions) => void;
  getActiveOpacity: () => number;
  changeOpacity: (value: number) => void;
  bringForward: () => void;
  sendBackwards: () => void;
  changeStrokeWidth: (value: number) => void;
  changeFillColor: (value: string) => void;
  changeStrokeColor: (value: string) => void;
  changeStrokeDashArray: (value: number[]) => void;
  addCircle: () => void;
  addSoftRectangle: () => void;
  addRectangle: () => void;
  addTriangle: () => void;
  addInverseTriangle: () => void;
  addDiamond: () => void;
  canvas: fabric.Canvas;
  getActiveFillColor: () => string;
  getActiveStrokeColor: () => string;
  getActiveStrokeWidth: () => number;
  getActiveStrokeDashArray: () => number[];
  selectedObjects: fabric.Object[];
  toggleSnapToGrid: () => void;
  toggleSnapToObjects: () => void;
  toggleSnapToCanvas: () => void;
  toggleSnapRotation: () => void;
  toggleGrid: () => void;
  setSnapGridSize: (size: number) => void;
  setVisualGridSize: (size: number) => void;
  getSnappingOptions: () => SnappingOptions;
  alignLeft: (alignToPage?: boolean) => void;
  alignCenterHorizontal: (alignToPage?: boolean) => void;
  alignRight: (alignToPage?: boolean) => void;
  alignTop: (alignToPage?: boolean) => void;
  alignCenterVertical: (alignToPage?: boolean) => void;
  alignBottom: (alignToPage?: boolean) => void;
  distributeHorizontal: () => void;
  distributeVertical: () => void;
  setFocusedPage: (pageNumber: number) => void;
  getFocusedPageNumber: () => number;
  getPageCount: () => number;
  zoomToPage: (pageNumber: number) => void;
  // Grouping
  groupSelected: () => void;
  ungroupSelected: () => void;
  isGrouped: () => boolean;
  // Lock/Unlock
  lockSelected: () => void;
  unlockSelected: () => void;
  isLocked: () => boolean;
  // Ordering
  bringToFront: () => void;
  sendToBack: () => void;
  // Duplicate
  duplicate: () => void;
  // Page management
  getPages: () => PageInfo[];
  getCurrentSpreadIndex: () => number;
  goToPage: (pageNumber: number) => void;
  addSpreadAfter: (spreadIndex: number, leftTemplate: PageTemplate, rightTemplate: PageTemplate) => void;
  deleteSpread: (spreadIndex: number) => void;
  applyTemplateToPage: (pageNumber: number, template: PageTemplate) => void;
  // Page reordering
  movePage: (fromPageNumber: number, toPageNumber: number) => void;
  moveSpread: (fromSpreadIndex: number, toSpreadIndex: number) => void;
  canMovePage: (pageNumber: number, direction: 'left' | 'right') => boolean;
  getPagePosition: (pageNumber: number) => { left: number; top: number } | null;
  getPageByNumber: (pageNumber: number) => fabric.Rect | null;
  // Drag preview - swaps two pages visually without saving
  swapPagePositionsVisually: (pageA: number, pageB: number) => void;
  // Trigger save manually
  save: () => void;
};
