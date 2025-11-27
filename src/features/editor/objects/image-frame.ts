import { fabric } from "fabric";
import { v4 as uuidv4 } from "uuid";

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
    super({
      ...options,
      fill: "transparent",
      stroke: undefined, // No stroke in normal mode
      strokeWidth: 0,
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
    if (!this.linkedImageId) return null;

    const objects = canvas.getObjects();
    for (const obj of objects) {
      if (obj.type === "framedImage" && (obj as any).id === this.linkedImageId) {
        return obj as fabric.Image;
      }
    }
    return null;
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
