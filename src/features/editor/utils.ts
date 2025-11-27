import { uuid } from "uuidv4";
import { fabric } from "fabric";
import type { RGBColor } from "react-color";

export function transformText(objects: any) {
  if (!objects) return;

  objects.forEach((item: any) => {
    if (item.objects) {
      transformText(item.objects);
    } else {
      item.type === "text" && (item.type === "textbox");
    }
  });
};

export function downloadFile(file: string, type: string) {
  const anchorElement = document.createElement("a");

  anchorElement.href = file;
  anchorElement.download = `${uuid()}.${type}`;
  document.body.appendChild(anchorElement);
  anchorElement.click();
  anchorElement.remove();
};

export function isTextType(type: string | undefined) {
  return type === "text" || type === "i-text" || type === "textbox";
};

export function rgbaObjectToString(rgba: RGBColor | "transparent") {
  if (rgba === "transparent") {
    return `rgba(0,0,0,0)`;
  }

  const alpha = rgba.a === undefined ? 1 : rgba.a;

  return `rgba(${rgba.r}, ${rgba.g}, ${rgba.b}, ${alpha})`;
};

export const createFilter = (value: string) => {
  let effect;

  switch (value) {
    case "greyscale":
      effect = new fabric.Image.filters.Grayscale();
      break;
    case "polaroid":
      // @ts-ignore
      effect = new fabric.Image.filters.Polaroid();
      break;
    case "sepia":
      effect = new fabric.Image.filters.Sepia();
      break;
    case "kodachrome":
      // @ts-ignore
      effect = new fabric.Image.filters.Kodachrome();
      break;
    case "contrast":
      effect = new fabric.Image.filters.Contrast({ contrast: 0.3 });
      break;
    case "brightness":
      effect = new fabric.Image.filters.Brightness({ brightness: 0.8 });
      break;
    case "brownie":
      // @ts-ignore
      effect = new fabric.Image.filters.Brownie();
      break;
    case "vintage":
      // @ts-ignore
      effect = new fabric.Image.filters.Vintage();
      break;
    case "technicolor":
      // @ts-ignore
      effect = new fabric.Image.filters.Technicolor();
      break;
    case "pixelate":
      effect = new fabric.Image.filters.Pixelate();
      break;
    case "invert":
      effect = new fabric.Image.filters.Invert();
      break;
    case "blur":
      effect = new fabric.Image.filters.Blur();
      break;
    case "sharpen":
      effect = new fabric.Image.filters.Convolute({
        matrix: [0, -1, 0, -1, 5, -1, 0, -1, 0],
      });
      break;
    case "emboss":
      effect = new fabric.Image.filters.Convolute({
        matrix: [1, 1, 1, 1, 0.7, -1, -1, -1, -1],
      });
      break;
    case "removecolor":
      // @ts-ignore
      effect = new fabric.Image.filters.RemoveColor({
        threshold: 0.2,
        distance: 0.5
      });
      break;
    case "blacknwhite":
      // @ts-ignore
      effect = new fabric.Image.filters.BlackWhite();
      break;
    case "vibrance":
      // @ts-ignore
      effect = new fabric.Image.filters.Vibrance({ 
        vibrance: 1,
      });
      break;
    case "blendcolor":
      effect = new fabric.Image.filters.BlendColor({ 
        color: "#00ff00",
        mode: "multiply",
      });
      break;
    case "huerotate":
      effect = new fabric.Image.filters.HueRotation({ 
        rotation: 0.5,
      });
      break;
    case "resize":
      effect = new fabric.Image.filters.Resize();
      break;
    case "gamma":
      // @ts-ignore
      effect = new fabric.Image.filters.Gamma({
        gamma: [1, 0.5, 2.1]
      });
    case "saturation":
      effect = new fabric.Image.filters.Saturation({
        saturation: 0.7,
      });
      break;
    default:
      effect = null;
      return;
  };

  return effect;
};

// Snapping utilities
export function roundToGrid(value: number, gridSize: number): number {
  return Math.round(value / gridSize) * gridSize;
}

export function calculateGridSnap(
  position: { left: number; top: number },
  gridSize: number
): { left: number; top: number } {
  return {
    left: roundToGrid(position.left, gridSize),
    top: roundToGrid(position.top, gridSize),
  };
}

export function findAlignmentLines(
  canvas: fabric.Canvas,
  activeObject: fabric.Object,
  threshold: number
): { vertical: number[]; horizontal: number[] } {
  const vertical: number[] = [];
  const horizontal: number[] = [];

  const activeObjectBounds = activeObject.getBoundingRect();
  const activeObjectCenter = {
    x: activeObjectBounds.left + activeObjectBounds.width / 2,
    y: activeObjectBounds.top + activeObjectBounds.height / 2,
  };

  canvas.getObjects().forEach((obj) => {
    // Skip the active object and all workspaces (both single and multi-page)
    if (obj === activeObject || obj.name === "clip" || obj.name?.startsWith("clip-page-")) return;

    const objBounds = obj.getBoundingRect();
    const objCenter = {
      x: objBounds.left + objBounds.width / 2,
      y: objBounds.top + objBounds.height / 2,
    };

    // Check vertical alignment
    // Center to center
    if (Math.abs(activeObjectCenter.x - objCenter.x) < threshold) {
      vertical.push(objCenter.x);
    }
    // Left to left
    if (Math.abs(activeObjectBounds.left - objBounds.left) < threshold) {
      vertical.push(objBounds.left);
    }
    // Right to right
    if (Math.abs(activeObjectBounds.left + activeObjectBounds.width - (objBounds.left + objBounds.width)) < threshold) {
      vertical.push(objBounds.left + objBounds.width);
    }

    // Check horizontal alignment
    // Center to center
    if (Math.abs(activeObjectCenter.y - objCenter.y) < threshold) {
      horizontal.push(objCenter.y);
    }
    // Top to top
    if (Math.abs(activeObjectBounds.top - objBounds.top) < threshold) {
      horizontal.push(objBounds.top);
    }
    // Bottom to bottom
    if (Math.abs(activeObjectBounds.top + activeObjectBounds.height - (objBounds.top + objBounds.height)) < threshold) {
      horizontal.push(objBounds.top + objBounds.height);
    }
  });

  return { vertical, horizontal };
}

export function calculateCanvasSnap(
  object: fabric.Object,
  workspace: fabric.Object,
  threshold: number
): { snapToCenter: { x: boolean; y: boolean }; lines: { vertical: number[]; horizontal: number[] } } {
  const workspaceBounds = workspace.getBoundingRect();
  const workspaceCenter = {
    x: workspaceBounds.left + workspaceBounds.width / 2,
    y: workspaceBounds.top + workspaceBounds.height / 2,
  };

  const objectBounds = object.getBoundingRect();
  const objectCenter = {
    x: objectBounds.left + objectBounds.width / 2,
    y: objectBounds.top + objectBounds.height / 2,
  };

  const vertical: number[] = [];
  const horizontal: number[] = [];
  const snapToCenter = { x: false, y: false };

  // Check canvas center alignment
  if (Math.abs(objectCenter.x - workspaceCenter.x) < threshold) {
    vertical.push(workspaceCenter.x);
    snapToCenter.x = true;
  }

  if (Math.abs(objectCenter.y - workspaceCenter.y) < threshold) {
    horizontal.push(workspaceCenter.y);
    snapToCenter.y = true;
  }

  // Check canvas edges
  if (Math.abs(objectBounds.left - workspaceBounds.left) < threshold) {
    vertical.push(workspaceBounds.left);
  }

  if (Math.abs(objectBounds.left + objectBounds.width - (workspaceBounds.left + workspaceBounds.width)) < threshold) {
    vertical.push(workspaceBounds.left + workspaceBounds.width);
  }

  if (Math.abs(objectBounds.top - workspaceBounds.top) < threshold) {
    horizontal.push(workspaceBounds.top);
  }

  if (Math.abs(objectBounds.top + objectBounds.height - (workspaceBounds.top + workspaceBounds.height)) < threshold) {
    horizontal.push(workspaceBounds.top + workspaceBounds.height);
  }

  return { snapToCenter, lines: { vertical, horizontal } };
}

export function roundRotationAngle(angle: number, snapDegrees: number = 15): number {
  return Math.round(angle / snapDegrees) * snapDegrees;
}
