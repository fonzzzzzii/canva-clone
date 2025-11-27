import { fabric } from "fabric";
import { v4 as uuidv4 } from "uuid";
import { ImageFrame } from "./image-frame";

interface FramedImageOptions extends fabric.IImageOptions {
  id?: string;
  linkedFrameId?: string;
  imageUrl?: string;
}

export class FramedImage extends fabric.Image {
  public id: string;
  public linkedFrameId: string | null = null;
  public imageUrl: string = "";
  public isInEditMode: boolean = false;
  // Store the offset from frame center (set when user crops/positions the image)
  public offsetX: number = 0;
  public offsetY: number = 0;
  // Store the custom scale (if user scales in edit mode)
  public customScaleX: number = 1;
  public customScaleY: number = 1;

  constructor(
    element: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | string,
    options: FramedImageOptions = {}
  ) {
    super(element as HTMLImageElement, {
      ...options,
      selectable: false, // Start non-selectable (frame mode)
      evented: false, // Don't respond to events initially
      originX: "center",
      originY: "center",
    });

    this.type = "framedImage";
    this.id = options.id || uuidv4();
    this.linkedFrameId = options.linkedFrameId || null;
    this.imageUrl = options.imageUrl || "";
  }

  /**
   * Get the linked ImageFrame object from the canvas
   */
  getLinkedFrame(canvas: fabric.Canvas): ImageFrame | null {
    if (!this.linkedFrameId) return null;

    const objects = canvas.getObjects();
    for (const obj of objects) {
      if (obj.type === "imageFrame" && (obj as ImageFrame).id === this.linkedFrameId) {
        return obj as ImageFrame;
      }
    }
    return null;
  }

  /**
   * Apply clipping based on the frame's position and size
   * Uses absolutePositioned so the clip stays at the frame's canvas position
   */
  applyFrameClip(frame: ImageFrame) {
    const frameWidth = (frame.width || 0) * (frame.scaleX || 1);
    const frameHeight = (frame.height || 0) * (frame.scaleY || 1);

    this.clipPath = new fabric.Rect({
      left: frame.left,
      top: frame.top,
      width: frameWidth,
      height: frameHeight,
      originX: "center",
      originY: "center",
      absolutePositioned: true,
    });
  }

  /**
   * Enter edit mode - image becomes selectable, frame becomes locked
   */
  enterEditMode(canvas: fabric.Canvas) {
    this.isInEditMode = true;
    this.selectable = true;
    this.evented = true;

    // Remove clipPath to show full image
    this.clipPath = undefined;

    // Add visual indicator that we're in edit mode
    (this as any).set({
      borderColor: "#10b981",
      cornerColor: "#10b981",
      cornerStyle: "circle",
      transparentCorners: false,
      cornerSize: 12,
    });

    // Make the frame non-selectable
    const frame = this.getLinkedFrame(canvas);
    if (frame) {
      frame.selectable = false;
      frame.evented = false;

      // Show frame border in edit mode
      frame.set({
        stroke: "#10b981",
        strokeWidth: 2,
        strokeDashArray: [5, 5],
      });
    }

    this.setCoords();
  }

  /**
   * Exit edit mode - image becomes locked, frame becomes selectable
   * Saves the current offset from frame center for future reference
   */
  exitEditMode(canvas: fabric.Canvas) {
    this.isInEditMode = false;
    this.selectable = false;
    this.evented = false;

    // Reapply clipping
    const frame = this.getLinkedFrame(canvas);
    if (frame) {
      // Save the offset from frame center (user's crop position)
      this.offsetX = (this.left || 0) - (frame.left || 0);
      this.offsetY = (this.top || 0) - (frame.top || 0);

      // Save the custom scale
      this.customScaleX = this.scaleX || 1;
      this.customScaleY = this.scaleY || 1;

      this.applyFrameClip(frame);

      // Make frame selectable again
      frame.selectable = true;
      frame.evented = true;

      // Remove frame border
      frame.set({
        stroke: undefined,
        strokeWidth: 0,
        strokeDashArray: undefined,
      });

      frame.setCoords();
    }

    // Reset visual styling
    (this as any).set({
      borderColor: undefined,
      cornerColor: undefined,
    });

    this.setCoords();
  }

  /**
   * Override toObject for serialization
   */
  toObject(propertiesToInclude: string[] = []): any {
    // Temporarily remove clipPath before serialization to avoid issues
    const savedClipPath = this.clipPath;
    this.clipPath = undefined;

    const result = {
      ...super.toObject(propertiesToInclude),
      id: this.id,
      linkedFrameId: this.linkedFrameId,
      imageUrl: this.imageUrl,
      isInEditMode: false, // Always save as not in edit mode
      offsetX: this.offsetX,
      offsetY: this.offsetY,
      customScaleX: this.customScaleX,
      customScaleY: this.customScaleY,
    };

    // Restore clipPath
    this.clipPath = savedClipPath;

    return result;
  }

  /**
   * Deserialize from JSON
   */
  static fromObject(object: any, callback: (obj: FramedImage) => void) {
    fabric.Image.fromURL(
      object.imageUrl || object.src,
      (img) => {
        const element = (img as any).getElement();
        const framedImage = new FramedImage(element, {
          ...object,
          id: object.id,
          linkedFrameId: object.linkedFrameId,
          imageUrl: object.imageUrl,
        });

        // Apply stored transforms
        framedImage.set({
          left: object.left,
          top: object.top,
          scaleX: object.scaleX,
          scaleY: object.scaleY,
          angle: object.angle,
        });

        // Restore offset values
        framedImage.offsetX = object.offsetX || 0;
        framedImage.offsetY = object.offsetY || 0;
        framedImage.customScaleX = object.customScaleX || object.scaleX || 1;
        framedImage.customScaleY = object.customScaleY || object.scaleY || 1;

        callback(framedImage);
      },
      { crossOrigin: "anonymous" }
    );
  }
}

// Register with Fabric.js
(fabric as any).FramedImage = FramedImage;
