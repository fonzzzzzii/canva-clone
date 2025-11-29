import { fabric } from "fabric";
import { v4 as uuidv4 } from "uuid";
import { FRAME_PLACEHOLDER_STYLES, FRAME_WITH_IMAGE_STYLES } from "./image-frame";

interface TriangleFrameOptions extends fabric.ITriangleOptions {
  id?: string;
  linkedImageId?: string;
}

export class TriangleFrame extends fabric.Triangle {
  public id: string;
  public linkedImageId: string | null = null;
  public _previousLeft: number = 0;
  public _previousTop: number = 0;
  public _previousScaleX: number = 1;
  public _previousScaleY: number = 1;

  constructor(options: TriangleFrameOptions = {}) {
    // Start with placeholder styles if no image linked
    const hasImage = !!options.linkedImageId;
    const initialStyles = hasImage ? FRAME_WITH_IMAGE_STYLES : FRAME_PLACEHOLDER_STYLES;

    super({
      ...options,
      ...initialStyles,
    });

    this.type = "triangleFrame";
    this.id = options.id || uuidv4();
    this.linkedImageId = options.linkedImageId || null;

    // Store initial position/scale for delta calculations
    this._previousLeft = this.left || 0;
    this._previousTop = this.top || 0;
    this._previousScaleX = this.scaleX || 1;
    this._previousScaleY = this.scaleY || 1;

    // Disable rotation control for frames
    this.setControlsVisibility({
      mtr: false,
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
   * Get a clipPath object matching this frame's shape
   */
  getClipPath(): fabric.Triangle {
    const width = (this.width || 100) * (this.scaleX || 1);
    const height = (this.height || 100) * (this.scaleY || 1);
    // Calculate center manually to match syncFrameImage calculation
    const centerX = (this.left || 0) + width / 2;
    const centerY = (this.top || 0) + height / 2;

    return new fabric.Triangle({
      left: centerX,
      top: centerY,
      width: width,
      height: height,
      originX: "center",
      originY: "center",
      absolutePositioned: true,
    });
  }

  /**
   * Update the stored previous position/scale
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
  static fromObject(object: any, callback?: (obj: TriangleFrame) => void): TriangleFrame {
    const frame = new TriangleFrame({
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
(fabric as any).TriangleFrame = TriangleFrame;
