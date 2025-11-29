import { fabric } from "fabric";
import { v4 as uuidv4 } from "uuid";

// Common interface for all frame types
export interface IFrame extends fabric.Object {
  id: string;
  linkedImageId: string | null;
  _previousLeft: number;
  _previousTop: number;
  _previousScaleX: number;
  _previousScaleY: number;
  getLinkedImage(canvas: fabric.Canvas): fabric.Image | null;
  updatePlaceholderStyle(canvas: fabric.Canvas): void;
  getClipPath(): fabric.Object;
  updatePreviousTransform(): void;
}

// Frame type names
export const FRAME_TYPES = ["imageFrame", "circleFrame", "triangleFrame", "polygonFrame"] as const;
export type FrameType = (typeof FRAME_TYPES)[number];

export function isFrameType(type: string | undefined): type is FrameType {
  return FRAME_TYPES.includes(type as FrameType);
}

// Placeholder styles for empty frames
export const FRAME_PLACEHOLDER_STYLES = {
  fill: "#f3f4f6",           // Light gray background
  stroke: "#d1d5db",         // Gray border
  strokeWidth: 2,
  strokeDashArray: [8, 4],   // Dashed line
};

// Styles when frame has an image
export const FRAME_WITH_IMAGE_STYLES = {
  fill: "transparent",
  stroke: undefined as string | undefined,
  strokeWidth: 0,
  strokeDashArray: undefined as number[] | undefined,
};

interface ImageFrameOptions extends fabric.IRectOptions {
  id?: string;
  linkedImageId?: string;
}

export class ImageFrame extends fabric.Rect {
  public id: string;
  public linkedImageId: string | null = null;
  public _previousLeft: number = 0;
  public _previousTop: number = 0;
  public _previousScaleX: number = 1;
  public _previousScaleY: number = 1;

  constructor(options: ImageFrameOptions = {}) {
    // Start with placeholder styles if no image linked
    const hasImage = !!options.linkedImageId;
    const initialStyles = hasImage ? FRAME_WITH_IMAGE_STYLES : FRAME_PLACEHOLDER_STYLES;

    super({
      ...options,
      ...initialStyles,
    });

    this.type = "imageFrame";
    this.id = options.id || uuidv4();
    this.linkedImageId = options.linkedImageId || null;

    // Store initial position/scale for delta calculations
    this._previousLeft = this.left || 0;
    this._previousTop = this.top || 0;
    this._previousScaleX = this.scaleX || 1;
    this._previousScaleY = this.scaleY || 1;

    // Disable rotation control for frames
    this.setControlsVisibility({
      mtr: false, // No rotation handle
    });
  }

  /**
   * Get the linked FramedImage object from the canvas
   */
  getLinkedImage(canvas: fabric.Canvas): fabric.Image | null {
    const objects = canvas.getObjects();

    // First try to find by linkedImageId
    if (this.linkedImageId) {
      for (const obj of objects) {
        if (obj.type === "framedImage" && (obj as any).id === this.linkedImageId) {
          return obj as fabric.Image;
        }
      }
    }

    // Fallback: search for any FramedImage linked to this frame's ID
    for (const obj of objects) {
      if (obj.type === "framedImage" && (obj as any).linkedFrameId === this.id) {
        // Update our linkedImageId to match
        this.linkedImageId = (obj as any).id;
        return obj as fabric.Image;
      }
    }

    return null;
  }

  /**
   * Update frame styling based on whether it has an image
   * - Empty frame: gray placeholder with dashed border
   * - With image: transparent (image shows through)
   */
  updatePlaceholderStyle(canvas: fabric.Canvas) {
    const hasImage = this.linkedImageId && this.getLinkedImage(canvas);

    if (hasImage) {
      this.set(FRAME_WITH_IMAGE_STYLES);
    } else {
      this.set(FRAME_PLACEHOLDER_STYLES);
    }
    this.setCoords();
  }

  /**
   * Get a clipPath object matching this frame's shape (rectangle)
   */
  getClipPath(): fabric.Rect {
    const width = (this.width || 100) * (this.scaleX || 1);
    const height = (this.height || 100) * (this.scaleY || 1);
    const center = this.getCenterPoint();

    return new fabric.Rect({
      left: center.x,
      top: center.y,
      width: width,
      height: height,
      rx: this.rx,
      ry: this.ry,
      originX: "center",
      originY: "center",
      absolutePositioned: true,
    });
  }

  /**
   * Update the stored previous position/scale (call this after modification is complete)
   */
  updatePreviousTransform() {
    this._previousLeft = this.left || 0;
    this._previousTop = this.top || 0;
    this._previousScaleX = this.scaleX || 1;
    this._previousScaleY = this.scaleY || 1;
  }

  /**
   * Override toObject for serialization
   */
  toObject(propertiesToInclude: string[] = []): any {
    return {
      ...super.toObject(propertiesToInclude),
      id: this.id,
      linkedImageId: this.linkedImageId,
    };
  }

  /**
   * Deserialize from JSON
   */
  static fromObject(object: any, callback?: (obj: ImageFrame) => void): ImageFrame {
    const frame = new ImageFrame({
      ...object,
      id: object.id,
      linkedImageId: object.linkedImageId,
    });
    if (callback) {
      callback(frame);
    }
    return frame;
  }
}

// Register with Fabric.js
(fabric as any).ImageFrame = ImageFrame;
