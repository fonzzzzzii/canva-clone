import { fabric } from "fabric";
import { v4 as uuidv4 } from "uuid";
import { IFrame, isFrameType } from "./image-frame";

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
  // Shift key constraint tracking for straight-line movement
  public _initialDragPosition?: { x: number; y: number }; // Position when drag started (captured on mouse down)
  public _lockedAxis?: 'horizontal' | 'vertical';

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
   * Get the linked frame object from the canvas (supports all frame types)
   */
  getLinkedFrame(canvas: fabric.Canvas): IFrame | null {
    if (!this.linkedFrameId) return null;

    const objects = canvas.getObjects();
    for (const obj of objects) {
      if (isFrameType(obj.type) && (obj as IFrame).id === this.linkedFrameId) {
        return obj as IFrame;
      }
    }
    return null;
  }

  /**
   * Apply clipping based on the frame's shape
   * Uses the frame's getClipPath() method to get the appropriate clip shape
   */
  applyFrameClip(frame: IFrame) {
    // Check if frame has getClipPath method (proper frame class instance)
    if (typeof frame.getClipPath === "function") {
      this.clipPath = frame.getClipPath();
    } else {
      // Fallback for plain objects or legacy frames - create a basic rect clip
      const frameWidth = ((frame as any).width || 100) * (frame.scaleX || 1);
      const frameHeight = ((frame as any).height || 100) * (frame.scaleY || 1);

      // Get center point if available, otherwise calculate from left/top
      let centerX = frame.left || 0;
      let centerY = frame.top || 0;
      if (typeof (frame as any).getCenterPoint === "function") {
        const center = (frame as any).getCenterPoint();
        centerX = center.x;
        centerY = center.y;
      }

      this.clipPath = new fabric.Rect({
        left: centerX,
        top: centerY,
        width: frameWidth,
        height: frameHeight,
        originX: "center",
        originY: "center",
        absolutePositioned: true,
      });
    }
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
      borderColor: "#ffffff",  // White border for visibility on dark backgrounds
      cornerColor: "#ffffff",
      cornerStyle: "circle",
      transparentCorners: false,
      cornerSize: 12,
      // Add shadow for dark outline effect (visible on light backgrounds)
      shadow: new fabric.Shadow({
        color: "rgba(0,0,0,0.9)",  // Stronger opacity for better visibility
        blur: 4,                    // Wider blur for more prominent outline
        offsetX: 0,
        offsetY: 0,
      }),
    });

    // Make the frame non-selectable
    const frame = this.getLinkedFrame(canvas);
    if (frame) {
      frame.selectable = false;
      frame.evented = false;

      // Show frame border in edit mode
      frame.set({
        stroke: "#ffffff",           // White stroke for visibility on dark backgrounds
        strokeWidth: 4,              // Thicker for better visibility
        strokeDashArray: [10, 5],    // Longer dashes for better visibility
        strokeLineCap: "round",      // Smoother corners
        strokeLineJoin: "round",
        paintFirst: "stroke",        // Render stroke before fill
        // Add shadow for dark outline effect (visible on light backgrounds)
        shadow: new fabric.Shadow({
          color: "rgba(0,0,0,0.9)",  // Stronger opacity for better visibility
          blur: 4,                    // Wider blur for more prominent outline
          offsetX: 0,
          offsetY: 0,
        }),
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
      // Calculate frame center - use getCenterPoint for non-circle frames to match getClipPath
      let frameCenterX: number;
      let frameCenterY: number;
      if (frame.type === "circleFrame") {
        const radiusX = ((frame as any).radius || 200) * (frame.scaleX || 1);
        const radiusY = ((frame as any).radius || 200) * (frame.scaleY || 1);
        frameCenterX = (frame.left || 0) + radiusX;
        frameCenterY = (frame.top || 0) + radiusY;
      } else {
        const center = (frame as any).getCenterPoint();
        frameCenterX = center.x;
        frameCenterY = center.y;
      }

      // Save the offset from frame CENTER (user's crop position)
      this.offsetX = (this.left || 0) - frameCenterX;
      this.offsetY = (this.top || 0) - frameCenterY;

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
        shadow: undefined,           // Remove shadow from frame
      });

      frame.setCoords();
    }

    // Reset visual styling
    (this as any).set({
      borderColor: undefined,
      cornerColor: undefined,
      shadow: undefined,           // Remove shadow when exiting edit mode
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
