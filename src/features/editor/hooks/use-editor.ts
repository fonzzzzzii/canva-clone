import { fabric } from "fabric";
import { useCallback, useState, useMemo, useRef, useEffect } from "react";

import {
  Editor,
  FILL_COLOR,
  STROKE_WIDTH,
  STROKE_COLOR,
  CIRCLE_OPTIONS,
  DIAMOND_OPTIONS,
  TRIANGLE_OPTIONS,
  BuildEditorProps,
  RECTANGLE_OPTIONS,
  EditorHookProps,
  STROKE_DASH_ARRAY,
  TEXT_OPTIONS,
  FONT_FAMILY,
  FONT_WEIGHT,
  FONT_SIZE,
  JSON_KEYS,
  SnappingOptions,
  SnapLine,
} from "@/features/editor/types";
import { useHistory } from "@/features/editor/hooks/use-history";
import {
  createFilter,
  downloadFile,
  isTextType,
  transformText
} from "@/features/editor/utils";
import { ImageFrame } from "@/features/editor/objects/image-frame";
import { FramedImage } from "@/features/editor/objects/framed-image";
import { useHotkeys } from "@/features/editor/hooks/use-hotkeys";
import { useClipboard } from "@/features/editor/hooks//use-clipboard";
import { useAutoResize } from "@/features/editor/hooks/use-auto-resize";
import { useCanvasEvents } from "@/features/editor/hooks/use-canvas-events";
import { useWindowEvents } from "@/features/editor/hooks/use-window-events";
import { useLoadState } from "@/features/editor/hooks/use-load-state";
import { useSnapping } from "@/features/editor/hooks/use-snapping";
import { useMouseEvents } from "@/features/editor/hooks/use-mouse-events";
// Removed old FramedImage import - now using CroppableImage

const buildEditor = ({
  save,
  undo,
  redo,
  canRedo,
  canUndo,
  autoZoom,
  copy,
  paste,
  canvas,
  fillColor,
  fontFamily,
  setFontFamily,
  setFillColor,
  strokeColor,
  setStrokeColor,
  strokeWidth,
  setStrokeWidth,
  selectedObjects,
  strokeDashArray,
  setStrokeDashArray,
  snappingOptions,
  setSnappingOptions,
  pageCount,
  focusedPageNumber,
  setFocusedPageNumber,
}: BuildEditorProps): Editor => {
  const generateSaveOptions = () => {
    const { width, height, left, top } = getWorkspace() as fabric.Rect;

    return {
      name: "Image",
      format: "png",
      quality: 1,
      width,
      height,
      left,
      top,
    };
  };

  const savePng = () => {
    const options = generateSaveOptions();

    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    const dataUrl = canvas.toDataURL(options);

    downloadFile(dataUrl, "png");
    autoZoom();
  };

  const saveSvg = () => {
    const options = generateSaveOptions();

    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    const dataUrl = canvas.toDataURL(options);

    downloadFile(dataUrl, "svg");
    autoZoom();
  };

  const saveJpg = () => {
    const options = generateSaveOptions();

    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    const dataUrl = canvas.toDataURL(options);

    downloadFile(dataUrl, "jpg");
    autoZoom();
  };

  const saveJson = async () => {
    const dataUrl = canvas.toJSON(JSON_KEYS);

    await transformText(dataUrl.objects);
    const fileString = `data:text/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(dataUrl, null, "\t"),
    )}`;
    downloadFile(fileString, "json");
  };

  const loadJson = (json: string) => {
    const data = JSON.parse(json);

    console.log("[LoadJSON Debug] Loading canvas with objects:", data.objects.map((obj: any) => ({
      type: obj.type,
      hasImageUrl: !!obj.imageUrl,
    })));

    // Register FramedImage for deserialization
    fabric.util.enlivenObjects(
      data.objects,
      (enlivenedObjects: fabric.Object[]) => {
        console.log("[LoadJSON Debug] Enlivened objects:", enlivenedObjects.map((obj: any) => ({
          type: obj.type,
          hasImageUrl: !!obj.imageUrl,
        })));

        enlivenedObjects.forEach((obj: any) => {
          // Handle FramedImage custom objects (type === "framedImage" or groups with imageUrl)
          if (obj.type === "framedImage" || (obj.type === "group" && obj.imageUrl)) {
            console.log("[LoadJSON Debug] Found FramedImage group, deserializing...");
            FramedImage.fromObject(obj, (framedImage) => {
              console.log("[LoadJSON Debug] FramedImage deserialized:", framedImage.type);
              canvas.add(framedImage);
            });
          }
          // Convert old fabric.Image objects to FramedImage (migration)
          else if (obj.type === "image" && !obj.name?.startsWith("clip")) {
            console.log("[LoadJSON Debug] Found old image, converting to FramedImage...");
            const imageUrl = (obj as any).getSrc?.() || (obj as any).src || (obj as any)._element?.src;
            if (imageUrl) {
              // Create FramedImage from this old image
              const framedImage = new FramedImage(obj as fabric.Image, {
                imageUrl,
                frameWidth: 400,
                frameHeight: 400,
                fitMode: "fill",
                left: obj.left,
                top: obj.top,
              });
              canvas.add(framedImage);
            } else {
              canvas.add(obj);
            }
          } else {
            console.log("[LoadJSON Debug] Adding regular object:", obj.type);
            canvas.add(obj);
          }
        });

        // Set canvas properties
        if (data.background) {
          canvas.setBackgroundColor(data.background, () => {
            canvas.renderAll();
          });
        }

        autoZoom();
      },
      ""
    );
  };

  const getWorkspace = () => {
    return canvas
    .getObjects()
    .find((object) => object.name === "clip" || object.name?.startsWith("clip-page-"));
  };

  const getWorkspaces = () => {
    return canvas
    .getObjects()
    .filter((object) => object.name === "clip" || object.name?.startsWith("clip-page-"));
  };

  const getFocusedWorkspace = () => {
    const workspaces = getWorkspaces();

    // For single page, return the first workspace
    if (workspaces.length <= 1) {
      return workspaces[0];
    }

    // For multi-page, find the workspace with matching pageNumber
    // @ts-ignore
    const focusedWorkspace = workspaces.find((ws) => ws.pageNumber === focusedPageNumber);

    // Fall back to first workspace if focused page not found
    return focusedWorkspace || workspaces[0];
  };

  const updatePageFocusVisuals = () => {
    const workspaces = getWorkspaces();

    if (workspaces.length <= 1) return;

    workspaces.forEach((workspace) => {
      // @ts-ignore
      const isFocused = workspace.pageNumber === focusedPageNumber;

      workspace.set({
        stroke: isFocused ? "#3b82f6" : undefined,
        strokeWidth: isFocused ? 4 : 0,
      });
      workspace.setCoords();
    });

    canvas.requestRenderAll();
  };

  const center = (object: fabric.Object) => {
    const workspace = getFocusedWorkspace();
    const center = workspace?.getCenterPoint();

    if (!center) return;

    // @ts-ignore
    canvas._centerObject(object, center);
  };

  const addToCanvas = (object: fabric.Object) => {
    center(object);
    canvas.add(object);
    canvas.setActiveObject(object);
  };

  const zoomToPage = (pageNumber: number) => {
    const workspaces = getWorkspaces();

    // Find the workspace for this page
    // @ts-ignore
    const targetWorkspace = workspaces.find((ws) => ws.pageNumber === pageNumber);

    if (!targetWorkspace) return;

    // Get workspace dimensions and center in object coordinates
    const workspaceCenter = targetWorkspace.getCenterPoint();
    const workspaceWidth = targetWorkspace.width || 1;
    const workspaceHeight = targetWorkspace.height || 1;

    // Calculate zoom to fit the page nicely (85% of viewport)
    const containerWidth = canvas.getWidth() || 1;
    const containerHeight = canvas.getHeight() || 1;

    const scaleX = containerWidth / workspaceWidth;
    const scaleY = containerHeight / workspaceHeight;
    const scale = Math.min(scaleX, scaleY) * 0.85;

    // Reset viewport transform
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);

    // Set zoom level
    canvas.setZoom(scale);

    // Center the workspace in the viewport
    const vpt = canvas.viewportTransform;
    if (vpt) {
      vpt[4] = containerWidth / 2 - workspaceCenter.x * scale;
      vpt[5] = containerHeight / 2 - workspaceCenter.y * scale;
      canvas.setViewportTransform(vpt);
    }

    canvas.requestRenderAll();
  };

  return {
    savePng,
    saveJpg,
    saveSvg,
    saveJson,
    loadJson,
    canUndo,
    canRedo,
    autoZoom,
    getWorkspace,
    zoomIn: (point?: fabric.Point) => {
      let zoomRatio = canvas.getZoom();
      zoomRatio += 0.05;
      const zoomPoint = point || new fabric.Point(canvas.getCenter().left, canvas.getCenter().top);
      canvas.zoomToPoint(
        zoomPoint,
        zoomRatio > 1 ? 1 : zoomRatio
      );
    },
    zoomOut: (point?: fabric.Point) => {
      let zoomRatio = canvas.getZoom();
      zoomRatio -= 0.05;
      const zoomPoint = point || new fabric.Point(canvas.getCenter().left, canvas.getCenter().top);
      canvas.zoomToPoint(
        zoomPoint,
        zoomRatio < 0.01 ? 0.01 : zoomRatio,
      );
    },
    zoomToPage,
    changeSize: (value: { width: number; height: number }) => {
      const workspace = getWorkspace();

      workspace?.set(value);
      autoZoom();
      save();
    },
    changeBackground: (value: string) => {
      const workspace = getWorkspace();
      workspace?.set({ fill: value });
      canvas.renderAll();
      save();
    },
    enableDrawingMode: () => {
      canvas.discardActiveObject();
      canvas.renderAll();
      canvas.isDrawingMode = true;
      canvas.freeDrawingBrush.width = strokeWidth;
      canvas.freeDrawingBrush.color = strokeColor;
    },
    disableDrawingMode: () => {
      canvas.isDrawingMode = false;
    },
    onUndo: () => undo(),
    onRedo: () => redo(),
    onCopy: () => copy(),
    onPaste: () => paste(),
    changeImageFilter: (value: string) => {
      const objects = canvas.getActiveObjects();
      objects.forEach((object) => {
        if (object.type === "image") {
          const imageObject = object as fabric.Image;

          const effect = createFilter(value);

          imageObject.filters = effect ? [effect] : [];
          imageObject.applyFilters();
          canvas.renderAll();
        }
      });
    },
    addImage: (value: string) => {
      console.log("[AddImage Debug] addImage called with URL:", value);
      fabric.Image.fromURL(
        value,
        (loadedImage) => {
          console.log("[AddImage Debug] Image loaded from URL, creating frame+image pair...");
          const workspace = getWorkspace();

          // Determine default frame size
          const defaultFrameSize = 400;
          const frameWidth = Math.min(workspace?.width || defaultFrameSize, defaultFrameSize);
          const frameHeight = Math.min(workspace?.height || defaultFrameSize, defaultFrameSize);

          // Generate unique IDs for linking
          const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const frameId = `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          // Get workspace center for positioning
          const workspaceCenter = workspace ? {
            x: (workspace.left || 0) + (workspace.width || 0) / 2,
            y: (workspace.top || 0) + (workspace.height || 0) / 2,
          } : { x: 300, y: 300 };

          // Create the frame (visible, selectable)
          const frame = new ImageFrame({
            id: frameId,
            linkedImageId: imageId,
            width: frameWidth,
            height: frameHeight,
            left: workspaceCenter.x,
            top: workspaceCenter.y,
            originX: "center",
            originY: "center",
            fill: "transparent",
          });

          // Create the framed image (clipped, non-selectable initially)
          const element = (loadedImage as any).getElement();
          const framedImage = new FramedImage(element, {
            id: imageId,
            linkedFrameId: frameId,
            imageUrl: value,
            left: workspaceCenter.x,
            top: workspaceCenter.y,
          });

          // Scale image to cover the frame
          const imgWidth = loadedImage.width || 1;
          const imgHeight = loadedImage.height || 1;
          const scale = Math.max(frameWidth / imgWidth, frameHeight / imgHeight);
          framedImage.scale(scale);

          // Initialize the custom scale to match the cover scale
          framedImage.customScaleX = scale;
          framedImage.customScaleY = scale;

          // Apply initial clipping
          framedImage.applyFrameClip(frame);

          console.log("[AddImage Debug] Created frame+image pair:", {
            frameId,
            imageId,
            frameWidth,
            frameHeight,
            imageScale: scale,
          });

          // Add both to canvas - image first (behind), then frame (on top for selection)
          canvas.add(framedImage);
          canvas.add(frame);

          // Center on workspace
          canvas.centerObject(frame);
          framedImage.set({
            left: frame.left,
            top: frame.top,
          });
          framedImage.applyFrameClip(frame);

          // Select the frame
          canvas.setActiveObject(frame);
          canvas.requestRenderAll();
          save();
        },
        {
          crossOrigin: "anonymous",
        },
      );
    },
    delete: () => {
      const objectsToRemove: fabric.Object[] = [];

      canvas.getActiveObjects().forEach((object) => {
        objectsToRemove.push(object);

        // If deleting a frame, also delete its linked image
        if (object.type === "imageFrame") {
          const frame = object as ImageFrame;
          const linkedImage = frame.getLinkedImage(canvas);
          if (linkedImage && !objectsToRemove.includes(linkedImage)) {
            objectsToRemove.push(linkedImage);
          }
        }

        // If deleting an image, also delete its linked frame
        if (object.type === "framedImage") {
          const image = object as FramedImage;
          const linkedFrame = image.getLinkedFrame(canvas);
          if (linkedFrame && !objectsToRemove.includes(linkedFrame)) {
            objectsToRemove.push(linkedFrame);
          }
        }
      });

      objectsToRemove.forEach((obj) => canvas.remove(obj));
      canvas.discardActiveObject();
      canvas.renderAll();
    },
    addText: (value, options) => {
      const object = new fabric.Textbox(value, {
        ...TEXT_OPTIONS,
        fill: fillColor,
        ...options,
      });

      addToCanvas(object);
    },
    getActiveOpacity: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return 1;
      }

      const value = selectedObject.get("opacity") || 1;

      return value;
    },
    changeFontSize: (value: number) => {
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, fontSize exists.
          object.set({ fontSize: value });
        }
      });
      canvas.renderAll();
    },
    getActiveFontSize: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return FONT_SIZE;
      }

      // @ts-ignore
      // Faulty TS library, fontSize exists.
      const value = selectedObject.get("fontSize") || FONT_SIZE;

      return value;
    },
    changeTextAlign: (value: string) => {
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, textAlign exists.
          object.set({ textAlign: value });
        }
      });
      canvas.renderAll();
    },
    getActiveTextAlign: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return "left";
      }

      // @ts-ignore
      // Faulty TS library, textAlign exists.
      const value = selectedObject.get("textAlign") || "left";

      return value;
    },
    changeFontUnderline: (value: boolean) => {
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, underline exists.
          object.set({ underline: value });
        }
      });
      canvas.renderAll();
    },
    getActiveFontUnderline: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return false;
      }

      // @ts-ignore
      // Faulty TS library, underline exists.
      const value = selectedObject.get("underline") || false;

      return value;
    },
    changeFontLinethrough: (value: boolean) => {
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, linethrough exists.
          object.set({ linethrough: value });
        }
      });
      canvas.renderAll();
    },
    getActiveFontLinethrough: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return false;
      }

      // @ts-ignore
      // Faulty TS library, linethrough exists.
      const value = selectedObject.get("linethrough") || false;

      return value;
    },
    changeFontStyle: (value: string) => {
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, fontStyle exists.
          object.set({ fontStyle: value });
        }
      });
      canvas.renderAll();
    },
    getActiveFontStyle: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return "normal";
      }

      // @ts-ignore
      // Faulty TS library, fontStyle exists.
      const value = selectedObject.get("fontStyle") || "normal";

      return value;
    },
    changeFontWeight: (value: number) => {
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, fontWeight exists.
          object.set({ fontWeight: value });
        }
      });
      canvas.renderAll();
    },
    changeOpacity: (value: number) => {
      canvas.getActiveObjects().forEach((object) => {
        object.set({ opacity: value });
      });
      canvas.renderAll();
    },
    bringForward: () => {
      canvas.getActiveObjects().forEach((object) => {
        canvas.bringForward(object);
      });

      canvas.renderAll();
      
      const workspace = getWorkspace();
      workspace?.sendToBack();
    },
    sendBackwards: () => {
      canvas.getActiveObjects().forEach((object) => {
        canvas.sendBackwards(object);
      });

      canvas.renderAll();
      const workspace = getWorkspace();
      workspace?.sendToBack();
    },
    changeFontFamily: (value: string) => {
      setFontFamily(value);
      canvas.getActiveObjects().forEach((object) => {
        if (isTextType(object.type)) {
          // @ts-ignore
          // Faulty TS library, fontFamily exists.
          object.set({ fontFamily: value });
        }
      });
      canvas.renderAll();
    },
    changeFillColor: (value: string) => {
      setFillColor(value);
      canvas.getActiveObjects().forEach((object) => {
        object.set({ fill: value });
      });
      canvas.renderAll();
    },
    changeStrokeColor: (value: string) => {
      setStrokeColor(value);
      canvas.getActiveObjects().forEach((object) => {
        // Text types don't have stroke
        if (isTextType(object.type)) {
          object.set({ fill: value });
          return;
        }

        object.set({ stroke: value });
      });
      canvas.freeDrawingBrush.color = value;
      canvas.renderAll();
    },
    changeStrokeWidth: (value: number) => {
      setStrokeWidth(value);
      canvas.getActiveObjects().forEach((object) => {
        object.set({ strokeWidth: value });
      });
      canvas.freeDrawingBrush.width = value;
      canvas.renderAll();
    },
    changeStrokeDashArray: (value: number[]) => {
      setStrokeDashArray(value);
      canvas.getActiveObjects().forEach((object) => {
        object.set({ strokeDashArray: value });
      });
      canvas.renderAll();
    },
    addCircle: () => {
      const object = new fabric.Circle({
        ...CIRCLE_OPTIONS,
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        strokeDashArray: strokeDashArray,
      });

      addToCanvas(object);
    },
    addSoftRectangle: () => {
      const object = new fabric.Rect({
        ...RECTANGLE_OPTIONS,
        rx: 50,
        ry: 50,
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        strokeDashArray: strokeDashArray,
      });

      addToCanvas(object);
    },
    addRectangle: () => {
      const object = new fabric.Rect({
        ...RECTANGLE_OPTIONS,
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        strokeDashArray: strokeDashArray,
      });

      addToCanvas(object);
    },
    addTriangle: () => {
      const object = new fabric.Triangle({
        ...TRIANGLE_OPTIONS,
        fill: fillColor,
        stroke: strokeColor,
        strokeWidth: strokeWidth,
        strokeDashArray: strokeDashArray,
      });

      addToCanvas(object);
    },
    addInverseTriangle: () => {
      const HEIGHT = TRIANGLE_OPTIONS.height;
      const WIDTH = TRIANGLE_OPTIONS.width;

      const object = new fabric.Polygon(
        [
          { x: 0, y: 0 },
          { x: WIDTH, y: 0 },
          { x: WIDTH / 2, y: HEIGHT },
        ],
        {
          ...TRIANGLE_OPTIONS,
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          strokeDashArray: strokeDashArray,
        }
      );

      addToCanvas(object);
    },
    addDiamond: () => {
      const HEIGHT = DIAMOND_OPTIONS.height;
      const WIDTH = DIAMOND_OPTIONS.width;

      const object = new fabric.Polygon(
        [
          { x: WIDTH / 2, y: 0 },
          { x: WIDTH, y: HEIGHT / 2 },
          { x: WIDTH / 2, y: HEIGHT },
          { x: 0, y: HEIGHT / 2 },
        ],
        {
          ...DIAMOND_OPTIONS,
          fill: fillColor,
          stroke: strokeColor,
          strokeWidth: strokeWidth,
          strokeDashArray: strokeDashArray,
        }
      );
      addToCanvas(object);
    },
    canvas,
    getActiveFontWeight: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return FONT_WEIGHT;
      }

      // @ts-ignore
      // Faulty TS library, fontWeight exists.
      const value = selectedObject.get("fontWeight") || FONT_WEIGHT;

      return value;
    },
    getActiveFontFamily: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return fontFamily;
      }

      // @ts-ignore
      // Faulty TS library, fontFamily exists.
      const value = selectedObject.get("fontFamily") || fontFamily;

      return value;
    },
    getActiveFillColor: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return fillColor;
      }

      const value = selectedObject.get("fill") || fillColor;

      // Currently, gradients & patterns are not supported
      return value as string;
    },
    getActiveStrokeColor: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return strokeColor;
      }

      const value = selectedObject.get("stroke") || strokeColor;

      return value;
    },
    getActiveStrokeWidth: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return strokeWidth;
      }

      const value = selectedObject.get("strokeWidth") || strokeWidth;

      return value;
    },
    getActiveStrokeDashArray: () => {
      const selectedObject = selectedObjects[0];

      if (!selectedObject) {
        return strokeDashArray;
      }

      const value = selectedObject.get("strokeDashArray") || strokeDashArray;

      return value;
    },
    selectedObjects,
    toggleSnapToGrid: () => {
      setSnappingOptions({
        ...snappingOptions,
        snapToGrid: !snappingOptions.snapToGrid,
      });
    },
    toggleSnapToObjects: () => {
      setSnappingOptions({
        ...snappingOptions,
        snapToObjects: !snappingOptions.snapToObjects,
      });
    },
    toggleSnapToCanvas: () => {
      setSnappingOptions({
        ...snappingOptions,
        snapToCanvas: !snappingOptions.snapToCanvas,
      });
    },
    toggleSnapRotation: () => {
      setSnappingOptions({
        ...snappingOptions,
        snapRotation: !snappingOptions.snapRotation,
      });
    },
    toggleGrid: () => {
      setSnappingOptions({
        ...snappingOptions,
        showGrid: !snappingOptions.showGrid,
      });
    },
    setSnapGridSize: (size: number) => {
      setSnappingOptions({
        ...snappingOptions,
        snapGridSize: size,
      });
    },
    setVisualGridSize: (size: number) => {
      setSnappingOptions({
        ...snappingOptions,
        visualGridSize: size,
      });
    },
    getSnappingOptions: () => snappingOptions,

    // Helper to sync frame with its image after alignment
    _syncFrameImage: (frame: ImageFrame) => {
      const image = frame.getLinkedImage(canvas) as FramedImage | null;
      if (image && !image.isInEditMode) {
        image.set({
          left: (frame.left || 0) + image.offsetX,
          top: (frame.top || 0) + image.offsetY,
        });
        image.applyFrameClip(frame);
        image.setCoords();
      }
    },

    alignLeft: (alignToPage = false) => {
      const activeObj = canvas.getActiveObject();
      if (!activeObj) return;

      const syncLinkedImage = (obj: fabric.Object) => {
        if (obj.type === "imageFrame") {
          const frame = obj as ImageFrame;
          const image = frame.getLinkedImage(canvas) as FramedImage | null;
          if (image && !image.isInEditMode) {
            image.set({
              left: (frame.left || 0) + image.offsetX,
              top: (frame.top || 0) + image.offsetY,
            });
            image.applyFrameClip(frame);
            image.setCoords();
          }
        }
      };

      // Sync all ImageFrames inside a group with their linked images
      const syncGroupImages = (group: fabric.Group) => {
        const groupCenter = group.getCenterPoint();
        group.forEachObject((obj) => {
          if (obj.type === "imageFrame") {
            const frame = obj as ImageFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;
            if (image && !image.isInEditMode) {
              const absoluteLeft = groupCenter.x + (obj.left || 0);
              const absoluteTop = groupCenter.y + (obj.top || 0);
              image.set({
                left: absoluteLeft + image.offsetX,
                top: absoluteTop + image.offsetY,
              });
              const tempFrame = {
                left: absoluteLeft,
                top: absoluteTop,
                width: frame.width,
                height: frame.height,
                scaleX: frame.scaleX,
                scaleY: frame.scaleY,
              } as ImageFrame;
              image.applyFrameClip(tempFrame);
              image.setCoords();
            }
          }
        });
      };

      // Align to page - works with single or multiple objects
      if (alignToPage) {
        const workspace = getFocusedWorkspace();
        if (!workspace) return;

        // Workspace uses default origin (top-left), so workspace.left IS the left edge
        // Use getCenterPoint() and calculate edges from center for consistency
        const workspaceCenter = workspace.getCenterPoint();
        const workspaceWidth = (workspace.width || 0) * (workspace.scaleX || 1);
        const targetLeft = workspaceCenter.x - workspaceWidth / 2;

        if (activeObj.type === "activeSelection") {
          const selection = activeObj as fabric.ActiveSelection;
          const selectionCenter = selection.getCenterPoint();
          const objects = selection.getObjects().filter(
            (obj) => obj.name !== "clip" && obj.type !== "framedImage"
          );

          // Find the leftmost edge of the entire selection
          let selectionLeftEdge = Infinity;
          objects.forEach((obj) => {
            const width = (obj.width || 0) * (obj.scaleX || 1);
            const absoluteLeft = selectionCenter.x + (obj.left || 0);
            const objLeftEdge = absoluteLeft - width / 2;
            if (objLeftEdge < selectionLeftEdge) {
              selectionLeftEdge = objLeftEdge;
            }
          });

          // Calculate how much to move the entire selection
          const deltaX = targetLeft - selectionLeftEdge;

          // Move the selection as a group (preserving relative positions)
          selection.set({ left: (selection.left || 0) + deltaX });
          selection.setCoords();

          // Move linked images by the same delta and update their clipPaths
          const newSelectionCenter = selection.getCenterPoint();
          objects.forEach((obj) => {
            if ((obj as any).getLinkedImage) {
              const frame = obj as ImageFrame;
              const image = frame.getLinkedImage(canvas) as FramedImage | null;
              if (image) {
                image.set({
                  left: (image.left || 0) + deltaX,
                });
                // Update clipPath to match new frame position
                const frameAbsoluteLeft = newSelectionCenter.x + (frame.left || 0);
                const frameAbsoluteTop = newSelectionCenter.y + (frame.top || 0);
                const frameWidth = (frame.width || 0) * (frame.scaleX || 1);
                const frameHeight = (frame.height || 0) * (frame.scaleY || 1);
                image.clipPath = new fabric.Rect({
                  left: frameAbsoluteLeft,
                  top: frameAbsoluteTop,
                  width: frameWidth,
                  height: frameHeight,
                  originX: "center",
                  originY: "center",
                  absolutePositioned: true,
                });
                image.setCoords();
              }
            }
          });

          canvas.requestRenderAll();
        } else if (activeObj.name !== "clip" && activeObj.type !== "framedImage") {
          // Use bounding rect with absolute coordinates (ignores viewport transform)
          const bounds = activeObj.getBoundingRect(true, true);
          const deltaX = targetLeft - bounds.left;
          activeObj.set({ left: (activeObj.left || 0) + deltaX });
          activeObj.setCoords();
          syncLinkedImage(activeObj);
          // If it's a group, sync all ImageFrames inside
          if (activeObj.type === "group") {
            syncGroupImages(activeObj as fabric.Group);
          }
        }

        canvas.requestRenderAll();
        save();
        return;
      }

      // Align objects to each other (requires multiple selection)
      if (activeObj.type === "activeSelection") {
        const selection = activeObj as fabric.ActiveSelection;
        const selectionCenter = selection.getCenterPoint();
        const objects = selection.getObjects().filter(
          (obj) => obj.name !== "clip" && obj.type !== "framedImage"
        );

        if (objects.length < 2) return;

        const objectsWithBounds = objects.map((obj) => {
          const absoluteLeft = selectionCenter.x + (obj.left || 0);
          const absoluteTop = selectionCenter.y + (obj.top || 0);
          const width = (obj.width || 0) * (obj.scaleX || 1);

          return {
            obj,
            absoluteTop,
            width,
            boundsLeft: absoluteLeft - width / 2,
          };
        });

        const leftmost = Math.min(...objectsWithBounds.map((o) => o.boundsLeft));

        canvas.discardActiveObject();

        // Align all objects' left edges to the leftmost edge, keep vertical position
        objectsWithBounds.forEach(({ obj, width, absoluteTop }) => {
          const newLeft = leftmost + width / 2;
          obj.set({ left: newLeft, top: absoluteTop });
          obj.setCoords();
          syncLinkedImage(obj);
        });

        canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas }));
      }

      canvas.requestRenderAll();
      save();
    },
    alignCenterHorizontal: (alignToPage = false) => {
      const activeObj = canvas.getActiveObject();
      if (!activeObj) return;

      const syncLinkedImage = (obj: fabric.Object) => {
        if (obj.type === "imageFrame") {
          const frame = obj as ImageFrame;
          const image = frame.getLinkedImage(canvas) as FramedImage | null;
          if (image && !image.isInEditMode) {
            image.set({
              left: (frame.left || 0) + image.offsetX,
              top: (frame.top || 0) + image.offsetY,
            });
            image.applyFrameClip(frame);
            image.setCoords();
          }
        }
      };

      // Sync all ImageFrames inside a group with their linked images
      const syncGroupImages = (group: fabric.Group) => {
        const groupCenter = group.getCenterPoint();
        group.forEachObject((obj) => {
          if (obj.type === "imageFrame") {
            const frame = obj as ImageFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;
            if (image && !image.isInEditMode) {
              const absoluteLeft = groupCenter.x + (obj.left || 0);
              const absoluteTop = groupCenter.y + (obj.top || 0);
              image.set({
                left: absoluteLeft + image.offsetX,
                top: absoluteTop + image.offsetY,
              });
              const tempFrame = {
                left: absoluteLeft,
                top: absoluteTop,
                width: frame.width,
                height: frame.height,
                scaleX: frame.scaleX,
                scaleY: frame.scaleY,
              } as ImageFrame;
              image.applyFrameClip(tempFrame);
              image.setCoords();
            }
          }
        });
      };

      // Align to page center
      if (alignToPage) {
        const workspace = getFocusedWorkspace();
        if (!workspace) return;

        const workspaceCenter = workspace.getCenterPoint();

        if (activeObj.type === "activeSelection") {
          const selection = activeObj as fabric.ActiveSelection;
          const selectionCenter = selection.getCenterPoint();
          const objects = selection.getObjects().filter(
            (obj) => obj.name !== "clip" && obj.type !== "framedImage"
          );

          // Find the horizontal center of the entire selection bounds
          let selectionLeftEdge = Infinity;
          let selectionRightEdge = -Infinity;
          objects.forEach((obj) => {
            const width = (obj.width || 0) * (obj.scaleX || 1);
            const absoluteLeft = selectionCenter.x + (obj.left || 0);
            const objLeftEdge = absoluteLeft - width / 2;
            const objRightEdge = absoluteLeft + width / 2;
            if (objLeftEdge < selectionLeftEdge) selectionLeftEdge = objLeftEdge;
            if (objRightEdge > selectionRightEdge) selectionRightEdge = objRightEdge;
          });

          const selectionCenterX = (selectionLeftEdge + selectionRightEdge) / 2;
          const deltaX = workspaceCenter.x - selectionCenterX;

          // Move the selection as a group
          selection.set({ left: (selection.left || 0) + deltaX });
          selection.setCoords();

          // Move linked images by the same delta and update their clipPaths
          const newSelectionCenter = selection.getCenterPoint();
          objects.forEach((obj) => {
            if ((obj as any).getLinkedImage) {
              const frame = obj as ImageFrame;
              const image = frame.getLinkedImage(canvas) as FramedImage | null;
              if (image) {
                image.set({
                  left: (image.left || 0) + deltaX,
                });
                // Update clipPath to match new frame position
                const frameAbsoluteLeft = newSelectionCenter.x + (frame.left || 0);
                const frameAbsoluteTop = newSelectionCenter.y + (frame.top || 0);
                const frameWidth = (frame.width || 0) * (frame.scaleX || 1);
                const frameHeight = (frame.height || 0) * (frame.scaleY || 1);
                image.clipPath = new fabric.Rect({
                  left: frameAbsoluteLeft,
                  top: frameAbsoluteTop,
                  width: frameWidth,
                  height: frameHeight,
                  originX: "center",
                  originY: "center",
                  absolutePositioned: true,
                });
                image.setCoords();
              }
            }
          });

          canvas.requestRenderAll();
        } else if (activeObj.name !== "clip" && activeObj.type !== "framedImage") {
          // Use bounding rect with absolute coordinates (ignores viewport transform)
          const bounds = activeObj.getBoundingRect(true, true);
          const boundsCenterX = bounds.left + bounds.width / 2;
          const deltaX = workspaceCenter.x - boundsCenterX;
          activeObj.set({ left: (activeObj.left || 0) + deltaX });
          activeObj.setCoords();
          syncLinkedImage(activeObj);
          // If it's a group, sync all ImageFrames inside
          if (activeObj.type === "group") {
            syncGroupImages(activeObj as fabric.Group);
          }
        }

        canvas.requestRenderAll();
        save();
        return;
      }

      // Align objects to each other
      if (activeObj.type === "activeSelection") {
        const selection = activeObj as fabric.ActiveSelection;
        const selectionCenter = selection.getCenterPoint();
        const objects = selection.getObjects().filter(
          (obj) => obj.name !== "clip" && obj.type !== "framedImage"
        );

        if (objects.length < 2) return;

        const objectsWithBounds = objects.map((obj) => {
          const absoluteLeft = selectionCenter.x + (obj.left || 0);
          const absoluteTop = selectionCenter.y + (obj.top || 0);
          const width = (obj.width || 0) * (obj.scaleX || 1);

          return {
            obj,
            absoluteTop,
            centerX: absoluteLeft,
            boundsLeft: absoluteLeft - width / 2,
            boundsRight: absoluteLeft + width / 2,
          };
        });

        const leftmost = Math.min(...objectsWithBounds.map((o) => o.boundsLeft));
        const rightmost = Math.max(...objectsWithBounds.map((o) => o.boundsRight));
        const targetCenterX = (leftmost + rightmost) / 2;

        canvas.discardActiveObject();

        // Align all objects' centers to the group's center, keep vertical position
        objectsWithBounds.forEach(({ obj, absoluteTop }) => {
          obj.set({ left: targetCenterX, top: absoluteTop });
          obj.setCoords();
          syncLinkedImage(obj);
        });

        canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas }));
      }

      canvas.requestRenderAll();
      save();
    },
    alignRight: (alignToPage = false) => {
      const activeObj = canvas.getActiveObject();
      if (!activeObj) return;

      const syncLinkedImage = (obj: fabric.Object) => {
        if (obj.type === "imageFrame") {
          const frame = obj as ImageFrame;
          const image = frame.getLinkedImage(canvas) as FramedImage | null;
          if (image && !image.isInEditMode) {
            image.set({
              left: (frame.left || 0) + image.offsetX,
              top: (frame.top || 0) + image.offsetY,
            });
            image.applyFrameClip(frame);
            image.setCoords();
          }
        }
      };

      // Sync all ImageFrames inside a group with their linked images
      const syncGroupImages = (group: fabric.Group) => {
        const groupCenter = group.getCenterPoint();
        group.forEachObject((obj) => {
          if (obj.type === "imageFrame") {
            const frame = obj as ImageFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;
            if (image && !image.isInEditMode) {
              const absoluteLeft = groupCenter.x + (obj.left || 0);
              const absoluteTop = groupCenter.y + (obj.top || 0);
              image.set({
                left: absoluteLeft + image.offsetX,
                top: absoluteTop + image.offsetY,
              });
              const tempFrame = {
                left: absoluteLeft,
                top: absoluteTop,
                width: frame.width,
                height: frame.height,
                scaleX: frame.scaleX,
                scaleY: frame.scaleY,
              } as ImageFrame;
              image.applyFrameClip(tempFrame);
              image.setCoords();
            }
          }
        });
      };

      // Align to page
      if (alignToPage) {
        const workspace = getFocusedWorkspace();
        if (!workspace) return;

        // Use getCenterPoint() and calculate edges from center for consistency
        const workspaceCenter = workspace.getCenterPoint();
        const workspaceWidth = (workspace.width || 0) * (workspace.scaleX || 1);
        const targetRight = workspaceCenter.x + workspaceWidth / 2;

        if (activeObj.type === "activeSelection") {
          const selection = activeObj as fabric.ActiveSelection;
          const selectionCenter = selection.getCenterPoint();
          const objects = selection.getObjects().filter(
            (obj) => obj.name !== "clip" && obj.type !== "framedImage"
          );

          // Find the rightmost edge of the entire selection
          let selectionRightEdge = -Infinity;
          objects.forEach((obj) => {
            const width = (obj.width || 0) * (obj.scaleX || 1);
            const absoluteLeft = selectionCenter.x + (obj.left || 0);
            const objRightEdge = absoluteLeft + width / 2;
            if (objRightEdge > selectionRightEdge) {
              selectionRightEdge = objRightEdge;
            }
          });

          // Calculate how much to move the entire selection
          const deltaX = targetRight - selectionRightEdge;

          // Move the selection as a group (preserving relative positions)
          selection.set({ left: (selection.left || 0) + deltaX });
          selection.setCoords();

          // Move linked images by the same delta and update their clipPaths
          const newSelectionCenter = selection.getCenterPoint();
          objects.forEach((obj) => {
            if ((obj as any).getLinkedImage) {
              const frame = obj as ImageFrame;
              const image = frame.getLinkedImage(canvas) as FramedImage | null;
              if (image) {
                image.set({
                  left: (image.left || 0) + deltaX,
                });
                // Update clipPath to match new frame position
                const frameAbsoluteLeft = newSelectionCenter.x + (frame.left || 0);
                const frameAbsoluteTop = newSelectionCenter.y + (frame.top || 0);
                const frameWidth = (frame.width || 0) * (frame.scaleX || 1);
                const frameHeight = (frame.height || 0) * (frame.scaleY || 1);
                image.clipPath = new fabric.Rect({
                  left: frameAbsoluteLeft,
                  top: frameAbsoluteTop,
                  width: frameWidth,
                  height: frameHeight,
                  originX: "center",
                  originY: "center",
                  absolutePositioned: true,
                });
                image.setCoords();
              }
            }
          });

          canvas.requestRenderAll();
        } else if (activeObj.name !== "clip" && activeObj.type !== "framedImage") {
          // Use bounding rect with absolute coordinates (ignores viewport transform)
          const bounds = activeObj.getBoundingRect(true, true);
          const rightEdge = bounds.left + bounds.width;
          const deltaX = targetRight - rightEdge;
          activeObj.set({ left: (activeObj.left || 0) + deltaX });
          activeObj.setCoords();
          syncLinkedImage(activeObj);
          // If it's a group, sync all ImageFrames inside
          if (activeObj.type === "group") {
            syncGroupImages(activeObj as fabric.Group);
          }
        }

        canvas.requestRenderAll();
        save();
        return;
      }

      // Align objects to each other
      if (activeObj.type === "activeSelection") {
        const selection = activeObj as fabric.ActiveSelection;
        const selectionCenter = selection.getCenterPoint();
        const objects = selection.getObjects().filter(
          (obj) => obj.name !== "clip" && obj.type !== "framedImage"
        );

        if (objects.length < 2) return;

        const objectsWithBounds = objects.map((obj) => {
          const absoluteLeft = selectionCenter.x + (obj.left || 0);
          const absoluteTop = selectionCenter.y + (obj.top || 0);
          const width = (obj.width || 0) * (obj.scaleX || 1);

          return {
            obj,
            width,
            absoluteTop,
            boundsRight: absoluteLeft + width / 2,
          };
        });

        const rightmost = Math.max(...objectsWithBounds.map((o) => o.boundsRight));

        canvas.discardActiveObject();

        // Align all objects' right edges to the rightmost edge, keep vertical position
        objectsWithBounds.forEach(({ obj, width, absoluteTop }) => {
          const newLeft = rightmost - width / 2;
          obj.set({ left: newLeft, top: absoluteTop });
          obj.setCoords();
          syncLinkedImage(obj);
        });

        canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas }));
      }

      canvas.requestRenderAll();
      save();
    },
    alignTop: (alignToPage = false) => {
      const activeObj = canvas.getActiveObject();
      if (!activeObj) return;

      const syncLinkedImage = (obj: fabric.Object) => {
        if (obj.type === "imageFrame") {
          const frame = obj as ImageFrame;
          const image = frame.getLinkedImage(canvas) as FramedImage | null;
          if (image && !image.isInEditMode) {
            image.set({
              left: (frame.left || 0) + image.offsetX,
              top: (frame.top || 0) + image.offsetY,
            });
            image.applyFrameClip(frame);
            image.setCoords();
          }
        }
      };

      // Sync all ImageFrames inside a group with their linked images
      const syncGroupImages = (group: fabric.Group) => {
        const groupCenter = group.getCenterPoint();
        group.forEachObject((obj) => {
          if (obj.type === "imageFrame") {
            const frame = obj as ImageFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;
            if (image && !image.isInEditMode) {
              const absoluteLeft = groupCenter.x + (obj.left || 0);
              const absoluteTop = groupCenter.y + (obj.top || 0);
              image.set({
                left: absoluteLeft + image.offsetX,
                top: absoluteTop + image.offsetY,
              });
              const tempFrame = {
                left: absoluteLeft,
                top: absoluteTop,
                width: frame.width,
                height: frame.height,
                scaleX: frame.scaleX,
                scaleY: frame.scaleY,
              } as ImageFrame;
              image.applyFrameClip(tempFrame);
              image.setCoords();
            }
          }
        });
      };

      // Align to page
      if (alignToPage) {
        const workspace = getFocusedWorkspace();
        if (!workspace) return;

        // Use getCenterPoint() and calculate edges from center for consistency
        const workspaceCenter = workspace.getCenterPoint();
        const workspaceHeight = (workspace.height || 0) * (workspace.scaleY || 1);
        const targetTop = workspaceCenter.y - workspaceHeight / 2;

        if (activeObj.type === "activeSelection") {
          const selection = activeObj as fabric.ActiveSelection;
          const selectionCenter = selection.getCenterPoint();
          const objects = selection.getObjects().filter(
            (obj) => obj.name !== "clip" && obj.type !== "framedImage"
          );

          // Find the topmost edge of the entire selection
          let selectionTopEdge = Infinity;
          objects.forEach((obj) => {
            const height = (obj.height || 0) * (obj.scaleY || 1);
            const absoluteTop = selectionCenter.y + (obj.top || 0);
            const objTopEdge = absoluteTop - height / 2;
            if (objTopEdge < selectionTopEdge) {
              selectionTopEdge = objTopEdge;
            }
          });

          // Calculate how much to move the entire selection
          const deltaY = targetTop - selectionTopEdge;

          // Move the selection as a group (preserving relative positions)
          selection.set({ top: (selection.top || 0) + deltaY });
          selection.setCoords();

          // Move linked images by the same delta and update their clipPaths
          const newSelectionCenter = selection.getCenterPoint();
          objects.forEach((obj) => {
            if ((obj as any).getLinkedImage) {
              const frame = obj as ImageFrame;
              const image = frame.getLinkedImage(canvas) as FramedImage | null;
              if (image) {
                image.set({
                  top: (image.top || 0) + deltaY,
                });
                // Update clipPath to match new frame position
                const frameAbsoluteLeft = newSelectionCenter.x + (frame.left || 0);
                const frameAbsoluteTop = newSelectionCenter.y + (frame.top || 0);
                const frameWidth = (frame.width || 0) * (frame.scaleX || 1);
                const frameHeight = (frame.height || 0) * (frame.scaleY || 1);
                image.clipPath = new fabric.Rect({
                  left: frameAbsoluteLeft,
                  top: frameAbsoluteTop,
                  width: frameWidth,
                  height: frameHeight,
                  originX: "center",
                  originY: "center",
                  absolutePositioned: true,
                });
                image.setCoords();
              }
            }
          });

          canvas.requestRenderAll();
        } else if (activeObj.name !== "clip" && activeObj.type !== "framedImage") {
          // Use bounding rect with absolute coordinates (ignores viewport transform)
          const bounds = activeObj.getBoundingRect(true, true);
          const deltaY = targetTop - bounds.top;
          activeObj.set({ top: (activeObj.top || 0) + deltaY });
          activeObj.setCoords();
          syncLinkedImage(activeObj);
          // If it's a group, sync all ImageFrames inside
          if (activeObj.type === "group") {
            syncGroupImages(activeObj as fabric.Group);
          }
        }

        canvas.requestRenderAll();
        save();
        return;
      }

      // Align objects to each other
      if (activeObj.type === "activeSelection") {
        const selection = activeObj as fabric.ActiveSelection;
        const selectionCenter = selection.getCenterPoint();
        const objects = selection.getObjects().filter(
          (obj) => obj.name !== "clip" && obj.type !== "framedImage"
        );

        if (objects.length < 2) return;

        const objectsWithBounds = objects.map((obj) => {
          const absoluteLeft = selectionCenter.x + (obj.left || 0);
          const absoluteTop = selectionCenter.y + (obj.top || 0);
          const height = (obj.height || 0) * (obj.scaleY || 1);

          return {
            obj,
            height,
            absoluteLeft,
            boundsTop: absoluteTop - height / 2,
          };
        });

        const topmost = Math.min(...objectsWithBounds.map((o) => o.boundsTop));

        canvas.discardActiveObject();

        // Align all objects' top edges to the topmost edge, keep horizontal position
        objectsWithBounds.forEach(({ obj, height, absoluteLeft }) => {
          const newTop = topmost + height / 2;
          obj.set({ left: absoluteLeft, top: newTop });
          obj.setCoords();
          syncLinkedImage(obj);
        });

        canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas }));
      }

      canvas.requestRenderAll();
      save();
    },
    alignCenterVertical: (alignToPage = false) => {
      const activeObj = canvas.getActiveObject();
      if (!activeObj) return;

      const syncLinkedImage = (obj: fabric.Object) => {
        if (obj.type === "imageFrame") {
          const frame = obj as ImageFrame;
          const image = frame.getLinkedImage(canvas) as FramedImage | null;
          if (image && !image.isInEditMode) {
            image.set({
              left: (frame.left || 0) + image.offsetX,
              top: (frame.top || 0) + image.offsetY,
            });
            image.applyFrameClip(frame);
            image.setCoords();
          }
        }
      };

      // Sync all ImageFrames inside a group with their linked images
      const syncGroupImages = (group: fabric.Group) => {
        const groupCenter = group.getCenterPoint();
        group.forEachObject((obj) => {
          if (obj.type === "imageFrame") {
            const frame = obj as ImageFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;
            if (image && !image.isInEditMode) {
              const absoluteLeft = groupCenter.x + (obj.left || 0);
              const absoluteTop = groupCenter.y + (obj.top || 0);
              image.set({
                left: absoluteLeft + image.offsetX,
                top: absoluteTop + image.offsetY,
              });
              const tempFrame = {
                left: absoluteLeft,
                top: absoluteTop,
                width: frame.width,
                height: frame.height,
                scaleX: frame.scaleX,
                scaleY: frame.scaleY,
              } as ImageFrame;
              image.applyFrameClip(tempFrame);
              image.setCoords();
            }
          }
        });
      };

      // Align to page center
      if (alignToPage) {
        const workspace = getFocusedWorkspace();
        if (!workspace) return;

        const workspaceCenter = workspace.getCenterPoint();

        if (activeObj.type === "activeSelection") {
          const selection = activeObj as fabric.ActiveSelection;
          const selectionCenter = selection.getCenterPoint();
          const objects = selection.getObjects().filter(
            (obj) => obj.name !== "clip" && obj.type !== "framedImage"
          );

          // Find the vertical center of the entire selection bounds
          let selectionTopEdge = Infinity;
          let selectionBottomEdge = -Infinity;
          objects.forEach((obj) => {
            const height = (obj.height || 0) * (obj.scaleY || 1);
            const absoluteTop = selectionCenter.y + (obj.top || 0);
            const objTopEdge = absoluteTop - height / 2;
            const objBottomEdge = absoluteTop + height / 2;
            if (objTopEdge < selectionTopEdge) selectionTopEdge = objTopEdge;
            if (objBottomEdge > selectionBottomEdge) selectionBottomEdge = objBottomEdge;
          });

          const selectionCenterY = (selectionTopEdge + selectionBottomEdge) / 2;
          const deltaY = workspaceCenter.y - selectionCenterY;

          // Move the selection as a group
          selection.set({ top: (selection.top || 0) + deltaY });
          selection.setCoords();

          // Move linked images by the same delta and update their clipPaths
          const newSelectionCenter = selection.getCenterPoint();
          objects.forEach((obj) => {
            if ((obj as any).getLinkedImage) {
              const frame = obj as ImageFrame;
              const image = frame.getLinkedImage(canvas) as FramedImage | null;
              if (image) {
                image.set({
                  top: (image.top || 0) + deltaY,
                });
                // Update clipPath to match new frame position
                const frameAbsoluteLeft = newSelectionCenter.x + (frame.left || 0);
                const frameAbsoluteTop = newSelectionCenter.y + (frame.top || 0);
                const frameWidth = (frame.width || 0) * (frame.scaleX || 1);
                const frameHeight = (frame.height || 0) * (frame.scaleY || 1);
                image.clipPath = new fabric.Rect({
                  left: frameAbsoluteLeft,
                  top: frameAbsoluteTop,
                  width: frameWidth,
                  height: frameHeight,
                  originX: "center",
                  originY: "center",
                  absolutePositioned: true,
                });
                image.setCoords();
              }
            }
          });

          canvas.requestRenderAll();
        } else if (activeObj.name !== "clip" && activeObj.type !== "framedImage") {
          // Use bounding rect with absolute coordinates (ignores viewport transform)
          const bounds = activeObj.getBoundingRect(true, true);
          const boundsCenterY = bounds.top + bounds.height / 2;
          const deltaY = workspaceCenter.y - boundsCenterY;
          activeObj.set({ top: (activeObj.top || 0) + deltaY });
          activeObj.setCoords();
          syncLinkedImage(activeObj);
          // If it's a group, sync all ImageFrames inside
          if (activeObj.type === "group") {
            syncGroupImages(activeObj as fabric.Group);
          }
        }

        canvas.requestRenderAll();
        save();
        return;
      }

      // Align objects to each other
      if (activeObj.type === "activeSelection") {
        const selection = activeObj as fabric.ActiveSelection;
        const selectionCenter = selection.getCenterPoint();
        const objects = selection.getObjects().filter(
          (obj) => obj.name !== "clip" && obj.type !== "framedImage"
        );

        if (objects.length < 2) return;

        const objectsWithBounds = objects.map((obj) => {
          const absoluteLeft = selectionCenter.x + (obj.left || 0);
          const absoluteTop = selectionCenter.y + (obj.top || 0);
          const height = (obj.height || 0) * (obj.scaleY || 1);

          return {
            obj,
            absoluteLeft,
            centerY: absoluteTop,
            boundsTop: absoluteTop - height / 2,
            boundsBottom: absoluteTop + height / 2,
          };
        });

        const topmost = Math.min(...objectsWithBounds.map((o) => o.boundsTop));
        const bottommost = Math.max(...objectsWithBounds.map((o) => o.boundsBottom));
        const targetCenterY = (topmost + bottommost) / 2;

        canvas.discardActiveObject();

        // Align all objects' centers to the group's center, keep horizontal position
        objectsWithBounds.forEach(({ obj, absoluteLeft }) => {
          obj.set({ left: absoluteLeft, top: targetCenterY });
          obj.setCoords();
          syncLinkedImage(obj);
        });

        canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas }));
      }

      canvas.requestRenderAll();
      save();
    },
    alignBottom: (alignToPage = false) => {
      const activeObj = canvas.getActiveObject();
      if (!activeObj) return;

      const syncLinkedImage = (obj: fabric.Object) => {
        if (obj.type === "imageFrame") {
          const frame = obj as ImageFrame;
          const image = frame.getLinkedImage(canvas) as FramedImage | null;
          if (image && !image.isInEditMode) {
            image.set({
              left: (frame.left || 0) + image.offsetX,
              top: (frame.top || 0) + image.offsetY,
            });
            image.applyFrameClip(frame);
            image.setCoords();
          }
        }
      };

      // Sync all ImageFrames inside a group with their linked images
      const syncGroupImages = (group: fabric.Group) => {
        const groupCenter = group.getCenterPoint();
        group.forEachObject((obj) => {
          if (obj.type === "imageFrame") {
            const frame = obj as ImageFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;
            if (image && !image.isInEditMode) {
              const absoluteLeft = groupCenter.x + (obj.left || 0);
              const absoluteTop = groupCenter.y + (obj.top || 0);
              image.set({
                left: absoluteLeft + image.offsetX,
                top: absoluteTop + image.offsetY,
              });
              const tempFrame = {
                left: absoluteLeft,
                top: absoluteTop,
                width: frame.width,
                height: frame.height,
                scaleX: frame.scaleX,
                scaleY: frame.scaleY,
              } as ImageFrame;
              image.applyFrameClip(tempFrame);
              image.setCoords();
            }
          }
        });
      };

      // Align to page
      if (alignToPage) {
        const workspace = getFocusedWorkspace();
        if (!workspace) return;

        // Use getCenterPoint() and calculate edges from center for consistency
        const workspaceCenter = workspace.getCenterPoint();
        const workspaceHeight = (workspace.height || 0) * (workspace.scaleY || 1);
        const targetBottom = workspaceCenter.y + workspaceHeight / 2;

        if (activeObj.type === "activeSelection") {
          const selection = activeObj as fabric.ActiveSelection;
          const selectionCenter = selection.getCenterPoint();
          const objects = selection.getObjects().filter(
            (obj) => obj.name !== "clip" && obj.type !== "framedImage"
          );

          // Find the bottommost edge of the entire selection
          let selectionBottomEdge = -Infinity;
          objects.forEach((obj) => {
            const height = (obj.height || 0) * (obj.scaleY || 1);
            const absoluteTop = selectionCenter.y + (obj.top || 0);
            const objBottomEdge = absoluteTop + height / 2;
            if (objBottomEdge > selectionBottomEdge) {
              selectionBottomEdge = objBottomEdge;
            }
          });

          // Calculate how much to move the entire selection
          const deltaY = targetBottom - selectionBottomEdge;

          // Move the selection as a group (preserving relative positions)
          selection.set({ top: (selection.top || 0) + deltaY });
          selection.setCoords();

          // Move linked images by the same delta and update their clipPaths
          const newSelectionCenter = selection.getCenterPoint();
          objects.forEach((obj) => {
            if ((obj as any).getLinkedImage) {
              const frame = obj as ImageFrame;
              const image = frame.getLinkedImage(canvas) as FramedImage | null;
              if (image) {
                image.set({
                  top: (image.top || 0) + deltaY,
                });
                // Update clipPath to match new frame position
                const frameAbsoluteLeft = newSelectionCenter.x + (frame.left || 0);
                const frameAbsoluteTop = newSelectionCenter.y + (frame.top || 0);
                const frameWidth = (frame.width || 0) * (frame.scaleX || 1);
                const frameHeight = (frame.height || 0) * (frame.scaleY || 1);
                image.clipPath = new fabric.Rect({
                  left: frameAbsoluteLeft,
                  top: frameAbsoluteTop,
                  width: frameWidth,
                  height: frameHeight,
                  originX: "center",
                  originY: "center",
                  absolutePositioned: true,
                });
                image.setCoords();
              }
            }
          });

          canvas.requestRenderAll();
        } else if (activeObj.name !== "clip" && activeObj.type !== "framedImage") {
          // Use bounding rect with absolute coordinates (ignores viewport transform)
          const bounds = activeObj.getBoundingRect(true, true);
          const bottomEdge = bounds.top + bounds.height;
          const deltaY = targetBottom - bottomEdge;
          activeObj.set({ top: (activeObj.top || 0) + deltaY });
          activeObj.setCoords();
          syncLinkedImage(activeObj);
          // If it's a group, sync all ImageFrames inside
          if (activeObj.type === "group") {
            syncGroupImages(activeObj as fabric.Group);
          }
        }

        canvas.requestRenderAll();
        save();
        return;
      }

      // Align objects to each other
      if (activeObj.type === "activeSelection") {
        const selection = activeObj as fabric.ActiveSelection;
        const selectionCenter = selection.getCenterPoint();
        const objects = selection.getObjects().filter(
          (obj) => obj.name !== "clip" && obj.type !== "framedImage"
        );

        if (objects.length < 2) return;

        const objectsWithBounds = objects.map((obj) => {
          const absoluteLeft = selectionCenter.x + (obj.left || 0);
          const absoluteTop = selectionCenter.y + (obj.top || 0);
          const height = (obj.height || 0) * (obj.scaleY || 1);

          return {
            obj,
            height,
            absoluteLeft,
            boundsBottom: absoluteTop + height / 2,
          };
        });

        const bottommost = Math.max(...objectsWithBounds.map((o) => o.boundsBottom));

        canvas.discardActiveObject();

        // Align all objects' bottom edges to the bottommost edge, keep horizontal position
        objectsWithBounds.forEach(({ obj, height, absoluteLeft }) => {
          const newTop = bottommost - height / 2;
          obj.set({ left: absoluteLeft, top: newTop });
          obj.setCoords();
          syncLinkedImage(obj);
        });

        canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas }));
      }

      canvas.requestRenderAll();
      save();
    },
    distributeHorizontal: () => {
      const activeObj = canvas.getActiveObject();
      if (!activeObj) return;

      if (activeObj.type === "activeSelection") {
        const selection = activeObj as fabric.ActiveSelection;
        const objects = selection.getObjects().filter(
          (obj) => obj.name !== "clip" && obj.type !== "framedImage"
        );

        if (objects.length < 3) return;

        // Get absolute positions while still in selection
        const objectsWithBounds = objects.map((obj) => {
          const selectionCenter = selection.getCenterPoint();
          const absoluteLeft = selectionCenter.x + (obj.left || 0);
          const absoluteTop = selectionCenter.y + (obj.top || 0);
          const width = (obj.width || 0) * (obj.scaleX || 1);

          return {
            obj,
            absoluteLeft,
            absoluteTop,
            boundsLeft: absoluteLeft - width / 2,
            width,
          };
        });

        // Sort by left position
        objectsWithBounds.sort((a, b) => a.boundsLeft - b.boundsLeft);

        // Calculate total width and spacing
        const totalObjectsWidth = objectsWithBounds.reduce((sum, o) => sum + o.width, 0);
        const first = objectsWithBounds[0];
        const last = objectsWithBounds[objectsWithBounds.length - 1];
        const selectionWidth = (last.boundsLeft + last.width) - first.boundsLeft;
        const totalSpace = selectionWidth - totalObjectsWidth;
        const spacing = totalSpace / (objectsWithBounds.length - 1);

        canvas.discardActiveObject();

        let currentLeft = first.boundsLeft;
        objectsWithBounds.forEach((item, index) => {
          if (index === 0 || index === objectsWithBounds.length - 1) {
            currentLeft += item.width + spacing;
            return;
          }

          // Move center of object to currentLeft + width/2
          const targetCenter = currentLeft + item.width / 2;
          const offset = targetCenter - item.absoluteLeft;
          item.obj.set({ left: (item.obj.left || 0) + offset });
          item.obj.setCoords();

          if (item.obj.type === "imageFrame") {
            const frame = item.obj as ImageFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;
            if (image && !image.isInEditMode) {
              image.set({
                left: (frame.left || 0) + image.offsetX,
                top: (frame.top || 0) + image.offsetY,
              });
              image.applyFrameClip(frame);
              image.setCoords();
            }
          }

          currentLeft += item.width + spacing;
        });

        canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas }));
      }

      canvas.requestRenderAll();
      save();
    },
    distributeVertical: () => {
      const activeObj = canvas.getActiveObject();
      if (!activeObj) return;

      if (activeObj.type === "activeSelection") {
        const selection = activeObj as fabric.ActiveSelection;
        const objects = selection.getObjects().filter(
          (obj) => obj.name !== "clip" && obj.type !== "framedImage"
        );

        if (objects.length < 3) return;

        // Get absolute positions while still in selection
        const objectsWithBounds = objects.map((obj) => {
          const selectionCenter = selection.getCenterPoint();
          const absoluteLeft = selectionCenter.x + (obj.left || 0);
          const absoluteTop = selectionCenter.y + (obj.top || 0);
          const height = (obj.height || 0) * (obj.scaleY || 1);

          return {
            obj,
            absoluteLeft,
            absoluteTop,
            boundsTop: absoluteTop - height / 2,
            height,
          };
        });

        // Sort by top position
        objectsWithBounds.sort((a, b) => a.boundsTop - b.boundsTop);

        // Calculate total height and spacing
        const totalObjectsHeight = objectsWithBounds.reduce((sum, o) => sum + o.height, 0);
        const first = objectsWithBounds[0];
        const last = objectsWithBounds[objectsWithBounds.length - 1];
        const selectionHeight = (last.boundsTop + last.height) - first.boundsTop;
        const totalSpace = selectionHeight - totalObjectsHeight;
        const spacing = totalSpace / (objectsWithBounds.length - 1);

        canvas.discardActiveObject();

        let currentTop = first.boundsTop;
        objectsWithBounds.forEach((item, index) => {
          if (index === 0 || index === objectsWithBounds.length - 1) {
            currentTop += item.height + spacing;
            return;
          }

          // Move center of object to currentTop + height/2
          const targetCenter = currentTop + item.height / 2;
          const offset = targetCenter - item.absoluteTop;
          item.obj.set({ top: (item.obj.top || 0) + offset });
          item.obj.setCoords();

          if (item.obj.type === "imageFrame") {
            const frame = item.obj as ImageFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;
            if (image && !image.isInEditMode) {
              image.set({
                left: (frame.left || 0) + image.offsetX,
                top: (frame.top || 0) + image.offsetY,
              });
              image.applyFrameClip(frame);
              image.setCoords();
            }
          }

          currentTop += item.height + spacing;
        });

        canvas.setActiveObject(new fabric.ActiveSelection(objects, { canvas }));
      }

      canvas.requestRenderAll();
      save();
    },
    setFocusedPage: (newPageNumber: number) => {
      // Validate page number
      if (newPageNumber < 1 || newPageNumber > pageCount) {
        return;
      }

      setFocusedPageNumber(newPageNumber);
      updatePageFocusVisuals();
      zoomToPage(newPageNumber);
    },
    getFocusedPageNumber: () => {
      return focusedPageNumber;
    },
    getPageCount: () => {
      return pageCount;
    },

    // Grouping - Native fabric.Group
    groupSelected: () => {
      const activeObj = canvas.getActiveObject();
      if (!activeObj || activeObj.type !== "activeSelection") return;

      const selection = activeObj as fabric.ActiveSelection;
      // Filter out workspace clips and FramedImages (they will stay outside group, synced via frame movement)
      let objects = selection.getObjects().filter(
        (obj) => obj.name !== "clip" && !obj.name?.startsWith("clip-page-") && obj.type !== "framedImage"
      );
      if (objects.length < 2) return;

      // Recreate selection with only the filtered objects (no FramedImages)
      canvas.discardActiveObject();
      const newSelection = new fabric.ActiveSelection(objects, { canvas });
      canvas.setActiveObject(newSelection);

      // Convert ActiveSelection to Group
      const group = (canvas.getActiveObject() as fabric.ActiveSelection).toGroup();
      canvas.setActiveObject(group);
      canvas.requestRenderAll();
      save();
    },

    ungroupSelected: () => {
      const activeObj = canvas.getActiveObject();
      if (!activeObj || activeObj.type !== "group") return;

      const group = activeObj as fabric.Group;

      // Convert Group back to ActiveSelection
      const selection = group.toActiveSelection();
      canvas.setActiveObject(selection);
      canvas.requestRenderAll();
      save();
    },

    isGrouped: () => {
      const activeObj = canvas.getActiveObject();
      return activeObj?.type === "group";
    },

    // Lock/Unlock
    lockSelected: () => {
      canvas.getActiveObjects().forEach((obj) => {
        obj.set({
          lockMovementX: true,
          lockMovementY: true,
          lockScalingX: true,
          lockScalingY: true,
          lockRotation: true,
        });
        (obj as any).locked = true;

        // If it's an ImageFrame, also lock linked image
        if (obj.type === "imageFrame") {
          const frame = obj as ImageFrame;
          const linkedImage = frame.getLinkedImage(canvas);
          if (linkedImage) {
            linkedImage.set({
              lockMovementX: true,
              lockMovementY: true,
              lockScalingX: true,
              lockScalingY: true,
              lockRotation: true,
            });
            (linkedImage as any).locked = true;
          }
        }
      });
      canvas.discardActiveObject();
      canvas.requestRenderAll();
      save();
    },

    unlockSelected: () => {
      canvas.getActiveObjects().forEach((obj) => {
        obj.set({
          lockMovementX: false,
          lockMovementY: false,
          lockScalingX: false,
          lockScalingY: false,
          lockRotation: false,
        });
        (obj as any).locked = false;

        // If it's an ImageFrame, also unlock linked image
        if (obj.type === "imageFrame") {
          const frame = obj as ImageFrame;
          const linkedImage = frame.getLinkedImage(canvas);
          if (linkedImage) {
            linkedImage.set({
              lockMovementX: false,
              lockMovementY: false,
              lockScalingX: false,
              lockScalingY: false,
              lockRotation: false,
            });
            (linkedImage as any).locked = false;
          }
        }
      });
      canvas.requestRenderAll();
      save();
    },

    isLocked: () => {
      const objects = canvas.getActiveObjects();
      if (objects.length === 0) return false;
      return objects.some((obj) => (obj as any).locked);
    },

    // Ordering
    bringToFront: () => {
      canvas.getActiveObjects().forEach((obj) => {
        canvas.bringToFront(obj);

        // If it's an ImageFrame, also bring linked image to front (but behind frame)
        if (obj.type === "imageFrame") {
          const frame = obj as ImageFrame;
          const linkedImage = frame.getLinkedImage(canvas);
          if (linkedImage) {
            canvas.bringToFront(linkedImage);
            canvas.bringToFront(obj); // Ensure frame stays on top of image
          }
        }
      });
      canvas.requestRenderAll();

      // Keep workspace at the back
      const workspaces = getWorkspaces();
      workspaces.forEach((ws) => ws.sendToBack());
      save();
    },

    sendToBack: () => {
      const workspaces = getWorkspaces();

      canvas.getActiveObjects().forEach((obj) => {
        canvas.sendToBack(obj);

        // If it's an ImageFrame, also send linked image to back (but in front of frame)
        if (obj.type === "imageFrame") {
          const frame = obj as ImageFrame;
          const linkedImage = frame.getLinkedImage(canvas);
          if (linkedImage) {
            canvas.sendToBack(linkedImage);
          }
        }
      });

      // Keep workspace at the very back
      workspaces.forEach((ws) => ws.sendToBack());
      canvas.requestRenderAll();
      save();
    },

    // Duplicate
    duplicate: () => {
      copy();
      paste();
    },
  };
};

export const useEditor = ({
  defaultState,
  defaultHeight,
  defaultWidth,
  defaultPageCount,
  clearSelectionCallback,
  saveCallback,
}: EditorHookProps) => {
  const initialState = useRef(defaultState);
  const initialWidth = useRef(defaultWidth);
  const initialHeight = useRef(defaultHeight);
  const initialPageCount = useRef(defaultPageCount || 1);

  const [canvas, setCanvas] = useState<fabric.Canvas | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [selectedObjects, setSelectedObjects] = useState<fabric.Object[]>([]);
  const [focusedPageNumber, setFocusedPageNumber] = useState<number>(1);
  const [imageEditMode, setImageEditMode] = useState(false);

  const [fontFamily, setFontFamily] = useState(FONT_FAMILY);
  const [fillColor, setFillColor] = useState(FILL_COLOR);
  const [strokeColor, setStrokeColor] = useState(STROKE_COLOR);
  const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTH);
  const [strokeDashArray, setStrokeDashArray] = useState<number[]>(STROKE_DASH_ARRAY);
  const activeFramedImageRef = useRef<FramedImage | null>(null);

  const [snappingOptions, setSnappingOptions] = useState<SnappingOptions>({
    snapToGrid: true,
    snapToObjects: true,
    snapToCanvas: true,
    snapRotation: true,
    snapGridSize: 10,
    visualGridSize: 20,
    snapThreshold: 10,
    showGrid: false,
  });

  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);

  useWindowEvents();

  const { 
    save, 
    canRedo, 
    canUndo, 
    undo, 
    redo,
    canvasHistory,
    setHistoryIndex,
  } = useHistory({ 
    canvas,
    saveCallback
  });

  const { copy, paste, hasClipboard } = useClipboard({ canvas });

  const { autoZoom } = useAutoResize({
    canvas,
    container,
  });

  useCanvasEvents({
    save,
    canvas,
    setSelectedObjects,
    clearSelectionCallback,
  });

  const toggleGrid = useCallback(() => {
    setSnappingOptions((prev) => ({
      ...prev,
      showGrid: !prev.showGrid,
    }));
  }, []);

  const toggleSnapping = useCallback(() => {
    setSnappingOptions((prev) => {
      const allEnabled = prev.snapToGrid && prev.snapToObjects && prev.snapToCanvas && prev.snapRotation;
      return {
        ...prev,
        snapToGrid: !allEnabled,
        snapToObjects: !allEnabled,
        snapToCanvas: !allEnabled,
        snapRotation: !allEnabled,
      };
    });
  }, []);

  const zoomIn = useCallback(() => {
    if (!canvas) return;
    let zoomRatio = canvas.getZoom();
    zoomRatio += 0.05;
    const center = canvas.getCenter();
    canvas.zoomToPoint(
      new fabric.Point(center.left, center.top),
      zoomRatio > 1 ? 1 : zoomRatio
    );
  }, [canvas]);

  const zoomOut = useCallback(() => {
    if (!canvas) return;
    let zoomRatio = canvas.getZoom();
    zoomRatio -= 0.05;
    const center = canvas.getCenter();
    canvas.zoomToPoint(
      new fabric.Point(center.left, center.top),
      zoomRatio < 0.2 ? 0.2 : zoomRatio
    );
  }, [canvas]);

  // Grouping callbacks for hotkeys (use canvas directly since editor not yet available)
  const groupSelectedCallback = useCallback(() => {
    if (!canvas) return;

    const activeObj = canvas.getActiveObject();
    if (!activeObj || activeObj.type !== "activeSelection") return;

    const selection = activeObj as fabric.ActiveSelection;
    // Filter out workspace clips and FramedImages (they will stay outside group, synced via frame movement)
    let objects = selection.getObjects().filter(
      (obj) => obj.name !== "clip" && !obj.name?.startsWith("clip-page-") && obj.type !== "framedImage"
    );
    if (objects.length < 2) return;

    // Recreate selection with only the filtered objects (no FramedImages)
    canvas.discardActiveObject();
    const newSelection = new fabric.ActiveSelection(objects, { canvas });
    canvas.setActiveObject(newSelection);

    // Convert ActiveSelection to Group
    const group = (canvas.getActiveObject() as fabric.ActiveSelection).toGroup();
    canvas.setActiveObject(group);
    canvas.requestRenderAll();
    save();
  }, [canvas, save]);

  const ungroupSelectedCallback = useCallback(() => {
    if (!canvas) return;

    const activeObj = canvas.getActiveObject();
    if (!activeObj || activeObj.type !== "group") return;

    const group = activeObj as fabric.Group;

    // Convert Group back to ActiveSelection
    const selection = group.toActiveSelection();
    canvas.setActiveObject(selection);
    canvas.requestRenderAll();
    save();
  }, [canvas, save]);

  useHotkeys({
    undo,
    redo,
    copy,
    paste,
    save,
    canvas,
    toggleGrid,
    toggleSnapping,
    zoomIn,
    zoomOut,
    autoZoom,
    gridSize: snappingOptions.snapGridSize,
    groupSelected: groupSelectedCallback,
    ungroupSelected: ungroupSelectedCallback,
  });

  useLoadState({
    canvas,
    autoZoom,
    initialState,
    canvasHistory,
    setHistoryIndex,
  });

  useSnapping({
    canvas,
    snappingOptions,
    onSnapLinesChange: setSnapLines,
    save,
    imageEditMode,
  });

  useMouseEvents({
    canvas,
  });

  // Handle FramedImage selection state to show/hide border
  useEffect(() => {
    if (!canvas) return;

    const handleSelectionCreated = (e: fabric.IEvent) => {
      const selected = e.selected;
      if (!selected || selected.length === 0) return;

      // Handle FramedImage border display
      selected.forEach((obj: any) => {
        if ((obj.type === "framedImage" || (obj.type === "group" && obj.imageUrl)) && obj.setSelected) {
          obj.setSelected(true);
        }
      });
      canvas.requestRenderAll();
    };

    const handleSelectionUpdated = (e: fabric.IEvent) => {
      // Hide border on deselected objects
      const deselected = (e as any).deselected;
      if (deselected) {
        deselected.forEach((obj: any) => {
          if ((obj.type === "framedImage" || (obj.type === "group" && obj.imageUrl)) && obj.setSelected) {
            obj.setSelected(false);
          }
        });
      }
      // Show border on newly selected objects
      const selected = e.selected;
      if (selected) {
        selected.forEach((obj: any) => {
          if ((obj.type === "framedImage" || (obj.type === "group" && obj.imageUrl)) && obj.setSelected) {
            obj.setSelected(true);
          }
        });
      }
      canvas.requestRenderAll();
    };

    const handleSelectionCleared = () => {
      // Hide border on all FramedImages
      canvas.getObjects().forEach((obj: any) => {
        if ((obj.type === "framedImage" || (obj.type === "group" && obj.imageUrl)) && obj.setSelected) {
          obj.setSelected(false);
        }
      });
      canvas.requestRenderAll();
    };

    canvas.on("selection:created", handleSelectionCreated);
    canvas.on("selection:updated", handleSelectionUpdated);
    canvas.on("selection:cleared", handleSelectionCleared);

    return () => {
      canvas.off("selection:created", handleSelectionCreated);
      canvas.off("selection:updated", handleSelectionUpdated);
      canvas.off("selection:cleared", handleSelectionCleared);
    };
  }, [canvas]);

  // Update page focus visuals when canvas is ready or focused page changes
  useEffect(() => {
    if (!canvas) return;

    const workspaces = canvas
      .getObjects()
      .filter((object) => object.name === "clip" || object.name?.startsWith("clip-page-"));

    if (workspaces.length <= 1) return;

    workspaces.forEach((workspace) => {
      // @ts-ignore
      const isFocused = workspace.pageNumber === focusedPageNumber;

      workspace.set({
        stroke: isFocused ? "#3b82f6" : undefined,
        strokeWidth: isFocused ? 4 : 0,
      });
      workspace.setCoords();
    });

    canvas.requestRenderAll();
  }, [canvas, focusedPageNumber]);

  // Auto-select page when clicking on workspace or objects
  useEffect(() => {
    if (!canvas) return;

    const handleMouseDown = (e: fabric.IEvent) => {
      const workspaces = canvas
        .getObjects()
        .filter((object) => object.name === "clip" || object.name?.startsWith("clip-page-"));

      if (workspaces.length <= 1) return;

      // Check if an object was clicked
      if (e.target) {
        // If the target is a workspace, select that page
        if (e.target.name === "clip" || e.target.name?.startsWith("clip-page-")) {
          // @ts-ignore
          const pageNum = e.target.pageNumber;
          if (pageNum && pageNum !== focusedPageNumber) {
            setFocusedPageNumber(pageNum);
          }
          return;
        }

        // If an object was clicked, find which workspace it's on
        const objCenter = e.target.getCenterPoint();

        for (const workspace of workspaces) {
          const bounds = workspace.getBoundingRect();

          // Check if object center is within this workspace bounds
          if (
            objCenter.x >= bounds.left &&
            objCenter.x <= bounds.left + bounds.width &&
            objCenter.y >= bounds.top &&
            objCenter.y <= bounds.top + bounds.height
          ) {
            // @ts-ignore
            const pageNum = workspace.pageNumber;
            if (pageNum && pageNum !== focusedPageNumber) {
              setFocusedPageNumber(pageNum);
            }
            break;
          }
        }
      } else {
        // Empty space was clicked - find which workspace was clicked
        const pointer = canvas.getPointer(e.e as MouseEvent);

        for (const workspace of workspaces) {
          const bounds = workspace.getBoundingRect();

          if (
            pointer.x >= bounds.left &&
            pointer.x <= bounds.left + bounds.width &&
            pointer.y >= bounds.top &&
            pointer.y <= bounds.top + bounds.height
          ) {
            // @ts-ignore
            const pageNum = workspace.pageNumber;
            if (pageNum && pageNum !== focusedPageNumber) {
              setFocusedPageNumber(pageNum);
            }
            break;
          }
        }
      }
    };

    canvas.on("mouse:down", handleMouseDown);

    return () => {
      canvas.off("mouse:down", handleMouseDown);
    };
  }, [canvas, focusedPageNumber, setFocusedPageNumber]);

  // Handle double-click to enter edit mode on ImageFrame
  useEffect(() => {
    if (!canvas) return;

    const handleDoubleClick = (e: fabric.IEvent) => {
      const target = e.target;

      // Double-click on frame enters image edit mode
      if (target?.type === "imageFrame") {
        const frame = target as ImageFrame;
        const image = frame.getLinkedImage(canvas);

        if (image) {
          console.log("[FramedImage] Entering edit mode");
          (image as FramedImage).enterEditMode(canvas);
          canvas.setActiveObject(image);
          canvas.requestRenderAll();
        }
      }
    };

    canvas.on("mouse:dblclick", handleDoubleClick);

    return () => {
      canvas.off("mouse:dblclick", handleDoubleClick);
    };
  }, [canvas]);

  // Handle frame moving - keep image synced
  useEffect(() => {
    if (!canvas) return;

    // Helper to sync a frame with its linked image
    const syncFrameImage = (frame: ImageFrame) => {
      const image = frame.getLinkedImage(canvas) as FramedImage | null;
      if (image && !image.isInEditMode) {
        // Get the frame's absolute position (accounting for group transforms)
        const frameCenter = frame.getCenterPoint();

        image.set({
          left: frameCenter.x + image.offsetX,
          top: frameCenter.y + image.offsetY,
        });
        image.applyFrameClip(frame);
        image.setCoords();
      }
    };

    const handleObjectMoving = (e: fabric.IEvent) => {
      const target = e.target;

      // Handle ActiveSelection (multi-select)
      if (target?.type === "activeSelection") {
        const selection = target as fabric.ActiveSelection;
        selection.forEachObject((obj) => {
          if (obj.type === "imageFrame") {
            // For objects in a group, we need to calculate their absolute position
            const frame = obj as ImageFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;

            if (image && !image.isInEditMode) {
              // Get absolute position by combining group and object transforms
              const groupCenter = selection.getCenterPoint();
              const objLeft = (obj.left || 0);
              const objTop = (obj.top || 0);

              const absoluteLeft = groupCenter.x + objLeft;
              const absoluteTop = groupCenter.y + objTop;

              image.set({
                left: absoluteLeft + image.offsetX,
                top: absoluteTop + image.offsetY,
              });

              // Create a temporary frame position for clipping
              const tempFrame = {
                left: absoluteLeft,
                top: absoluteTop,
                width: frame.width,
                height: frame.height,
                scaleX: frame.scaleX,
                scaleY: frame.scaleY,
              } as ImageFrame;

              image.applyFrameClip(tempFrame);
              image.setCoords();
            }
          }
        });
        return;
      }

      // Handle native fabric.Group (grouped objects)
      if (target?.type === "group") {
        const group = target as fabric.Group;
        group.forEachObject((obj) => {
          if (obj.type === "imageFrame") {
            const frame = obj as ImageFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;

            if (image && !image.isInEditMode) {
              // Get absolute position by combining group and object transforms
              const groupCenter = group.getCenterPoint();
              const objLeft = (obj.left || 0);
              const objTop = (obj.top || 0);

              const absoluteLeft = groupCenter.x + objLeft;
              const absoluteTop = groupCenter.y + objTop;

              image.set({
                left: absoluteLeft + image.offsetX,
                top: absoluteTop + image.offsetY,
              });

              // Create a temporary frame position for clipping
              const tempFrame = {
                left: absoluteLeft,
                top: absoluteTop,
                width: frame.width,
                height: frame.height,
                scaleX: frame.scaleX,
                scaleY: frame.scaleY,
              } as ImageFrame;

              image.applyFrameClip(tempFrame);
              image.setCoords();
            }
          }
        });
        return;
      }

      // Handle single frame selection
      if (target?.type === "imageFrame") {
        syncFrameImage(target as ImageFrame);
      }
    };

    const handleObjectScaling = (e: fabric.IEvent) => {
      const target = e.target;

      if (target?.type === "imageFrame") {
        const frame = target as ImageFrame;
        const image = frame.getLinkedImage(canvas) as FramedImage | null;

        if (image && !image.isInEditMode) {
          // Calculate the scale DELTA (change from previous scale)
          const scaleRatioX = (frame.scaleX || 1) / frame._previousScaleX;
          const scaleRatioY = (frame.scaleY || 1) / frame._previousScaleY;

          // Use the MAX ratio to maintain cover behavior (no stretching)
          const uniformScaleRatio = Math.max(scaleRatioX, scaleRatioY);

          // Apply uniform scale to maintain aspect ratio
          const newOffsetX = image.offsetX * scaleRatioX;
          const newOffsetY = image.offsetY * scaleRatioY;
          const newScale = image.customScaleX * uniformScaleRatio;

          // Apply the scaled position and uniform scale
          image.set({
            left: (frame.left || 0) + newOffsetX,
            top: (frame.top || 0) + newOffsetY,
            scaleX: newScale,
            scaleY: newScale,
          });

          // Update clipPath to match new frame size
          image.applyFrameClip(frame);
        }
      }
    };

    const handleObjectModified = (e: fabric.IEvent) => {
      const target = e.target;

      // Handle ActiveSelection (multi-select) - sync all frames after move
      if (target?.type === "activeSelection") {
        const selection = target as fabric.ActiveSelection;
        selection.forEachObject((obj) => {
          if (obj.type === "imageFrame") {
            const frame = obj as ImageFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;

            if (image && !image.isInEditMode) {
              // Get absolute position
              const groupCenter = selection.getCenterPoint();
              const absoluteLeft = groupCenter.x + (obj.left || 0);
              const absoluteTop = groupCenter.y + (obj.top || 0);

              image.set({
                left: absoluteLeft + image.offsetX,
                top: absoluteTop + image.offsetY,
              });

              // Create temp frame for clipping
              const tempFrame = {
                left: absoluteLeft,
                top: absoluteTop,
                width: frame.width,
                height: frame.height,
                scaleX: frame.scaleX,
                scaleY: frame.scaleY,
              } as ImageFrame;

              image.applyFrameClip(tempFrame);
              image.setCoords();
            }
          }
        });
        canvas.requestRenderAll();
        return;
      }

      // Handle native fabric.Group - sync all frames after move
      if (target?.type === "group") {
        const group = target as fabric.Group;
        group.forEachObject((obj) => {
          if (obj.type === "imageFrame") {
            const frame = obj as ImageFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;

            if (image && !image.isInEditMode) {
              // Get absolute position
              const groupCenter = group.getCenterPoint();
              const absoluteLeft = groupCenter.x + (obj.left || 0);
              const absoluteTop = groupCenter.y + (obj.top || 0);

              image.set({
                left: absoluteLeft + image.offsetX,
                top: absoluteTop + image.offsetY,
              });

              // Create temp frame for clipping
              const tempFrame = {
                left: absoluteLeft,
                top: absoluteTop,
                width: frame.width,
                height: frame.height,
                scaleX: frame.scaleX,
                scaleY: frame.scaleY,
              } as ImageFrame;

              image.applyFrameClip(tempFrame);
              image.setCoords();
            }
          }
        });
        canvas.requestRenderAll();
        return;
      }

      // Handle single frame
      if (target?.type === "imageFrame") {
        const frame = target as ImageFrame;

        const image = frame.getLinkedImage(canvas) as FramedImage | null;
        if (image && !image.isInEditMode) {
          // Calculate the scale DELTA from the modification
          const scaleRatioX = (frame.scaleX || 1) / frame._previousScaleX;
          const scaleRatioY = (frame.scaleY || 1) / frame._previousScaleY;

          // Use the MAX ratio to maintain cover behavior (no stretching)
          const uniformScaleRatio = Math.max(scaleRatioX, scaleRatioY);

          // Update stored offset (scaled by respective axis for position)
          image.offsetX = image.offsetX * scaleRatioX;
          image.offsetY = image.offsetY * scaleRatioY;

          // Update stored scale uniformly (no stretching)
          image.customScaleX = image.customScaleX * uniformScaleRatio;
          image.customScaleY = image.customScaleX; // Keep uniform

          // Final position
          image.set({
            left: (frame.left || 0) + image.offsetX,
            top: (frame.top || 0) + image.offsetY,
            scaleX: image.customScaleX,
            scaleY: image.customScaleY,
          });

          image.applyFrameClip(frame);
          image.setCoords();
        }

        // Update the frame's previous transform for next operation
        frame.updatePreviousTransform();
      }
    };

    canvas.on("object:moving", handleObjectMoving);
    canvas.on("object:scaling", handleObjectScaling);
    canvas.on("object:modified", handleObjectModified);

    return () => {
      canvas.off("object:moving", handleObjectMoving);
      canvas.off("object:scaling", handleObjectScaling);
      canvas.off("object:modified", handleObjectModified);
    };
  }, [canvas]);

  // Handle selection cleared - exit edit mode
  useEffect(() => {
    if (!canvas) return;

    const handleSelectionCleared = () => {
      // Find any images in edit mode and exit
      canvas.getObjects().forEach((obj) => {
        if (obj.type === "framedImage" && (obj as FramedImage).isInEditMode) {
          console.log("[FramedImage] Exiting edit mode (selection cleared)");
          (obj as FramedImage).exitEditMode(canvas);
        }
      });
      canvas.requestRenderAll();
    };

    canvas.on("selection:cleared", handleSelectionCleared);

    return () => {
      canvas.off("selection:cleared", handleSelectionCleared);
    };
  }, [canvas]);

  // Handle Escape key to exit edit mode
  useEffect(() => {
    if (!canvas) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        canvas.getObjects().forEach((obj) => {
          if (obj.type === "framedImage" && (obj as FramedImage).isInEditMode) {
            const image = obj as FramedImage;
            const frame = image.getLinkedFrame(canvas);
            console.log("[FramedImage] Exiting edit mode (Escape pressed)");
            image.exitEditMode(canvas);
            if (frame) {
              canvas.setActiveObject(frame);
            }
          }
        });
        canvas.requestRenderAll();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [canvas]);

  // Handle click outside image/frame to exit edit mode
  useEffect(() => {
    if (!canvas) return;

    const handleMouseDown = (e: fabric.IEvent) => {
      // Find any image in edit mode
      const editingImage = canvas.getObjects().find(
        (obj) => obj.type === "framedImage" && (obj as FramedImage).isInEditMode
      ) as FramedImage | undefined;

      if (!editingImage) return;

      const clickedTarget = e.target;
      const linkedFrame = editingImage.getLinkedFrame(canvas);

      // If clicked on the editing image or its linked frame, don't exit
      if (clickedTarget === editingImage || clickedTarget === linkedFrame) {
        return;
      }

      // Clicked outside - exit edit mode
      console.log("[FramedImage] Exiting edit mode (clicked outside)");
      editingImage.exitEditMode(canvas);

      // If clicked on another object, let fabric handle that selection
      // If clicked on empty space, select the frame
      if (!clickedTarget && linkedFrame) {
        canvas.setActiveObject(linkedFrame);
      }

      canvas.requestRenderAll();
    };

    canvas.on("mouse:down", handleMouseDown);

    return () => {
      canvas.off("mouse:down", handleMouseDown);
    };
  }, [canvas]);

  const editor = useMemo(() => {
    if (canvas) {
      return buildEditor({
        save,
        undo,
        redo,
        canUndo,
        canRedo,
        autoZoom,
        copy,
        paste,
        canvas,
        fillColor,
        strokeWidth,
        strokeColor,
        setFillColor,
        setStrokeColor,
        setStrokeWidth,
        strokeDashArray,
        selectedObjects,
        setStrokeDashArray,
        fontFamily,
        setFontFamily,
        snappingOptions,
        setSnappingOptions,
        pageCount: initialPageCount.current,
        focusedPageNumber,
        setFocusedPageNumber,
      });
    }

    return undefined;
  },
  [
    canRedo,
    canUndo,
    undo,
    redo,
    save,
    autoZoom,
    copy,
    paste,
    canvas,
    fillColor,
    strokeWidth,
    strokeColor,
    selectedObjects,
    strokeDashArray,
    fontFamily,
    snappingOptions,
    focusedPageNumber,
    setFocusedPageNumber,
  ]);

  const init = useCallback(
    ({
      initialCanvas,
      initialContainer,
    }: {
      initialCanvas: fabric.Canvas;
      initialContainer: HTMLDivElement;
    }) => {
      fabric.Object.prototype.set({
        cornerColor: "#FFF",
        cornerStyle: "circle",
        borderColor: "#3b82f6",
        borderScaleFactor: 1.5,
        transparentCorners: false,
        borderOpacityWhenMoving: 1,
        cornerStrokeColor: "#3b82f6",
      });

      initialCanvas.setWidth(initialContainer.offsetWidth);
      initialCanvas.setHeight(initialContainer.offsetHeight);

      const pageCount = initialPageCount.current;
      const pageWidth = initialWidth.current || 2970;
      const pageHeight = initialHeight.current || 2100;
      const pageSpacing = 20; // Space between pages in a spread
      const spreadSpacing = 100; // Space between spreads

      if (pageCount === 1) {
        // Single page - use existing logic
        const initialWorkspace = new fabric.Rect({
          width: pageWidth,
          height: pageHeight,
          name: "clip",
          fill: "white",
          selectable: false,
          hasControls: false,
          shadow: new fabric.Shadow({
            color: "rgba(0,0,0,0.8)",
            blur: 5,
          }),
        });

        initialCanvas.add(initialWorkspace);
        initialCanvas.centerObject(initialWorkspace);
        initialCanvas.clipPath = initialWorkspace;
      } else {
        // Multi-page - create workspaces in book spreads
        const workspaces: fabric.Rect[] = [];

        for (let i = 0; i < pageCount; i++) {
          const pageNumber = i + 1;
          const spreadIndex = Math.floor(i / 2);
          const isLeftPage = i % 2 === 0;

          // Calculate x position for book spread layout
          const spreadStartX = spreadIndex * (2 * pageWidth + pageSpacing + spreadSpacing);
          const xPosition = isLeftPage
            ? spreadStartX
            : spreadStartX + pageWidth + pageSpacing;

          const workspace = new fabric.Rect({
            width: pageWidth,
            height: pageHeight,
            name: `clip-page-${pageNumber}`,
            fill: "white",
            selectable: false,
            hasControls: false,
            left: xPosition,
            top: 0,
            shadow: new fabric.Shadow({
              color: "rgba(0,0,0,0.8)",
              blur: 5,
            }),
          });

          // @ts-ignore - Add custom property to identify page workspaces
          workspace.pageNumber = pageNumber;
          // @ts-ignore
          workspace.isPageWorkspace = true;

          workspaces.push(workspace);
          initialCanvas.add(workspace);
        }

        // Center all workspaces as a group
        if (workspaces.length > 0) {
          const firstWorkspace = workspaces[0];
          const lastWorkspace = workspaces[workspaces.length - 1];

          const totalWidth = (lastWorkspace.left || 0) + pageWidth - (firstWorkspace.left || 0);
          const offsetX = (initialContainer.offsetWidth - totalWidth) / 2;
          const offsetY = (initialContainer.offsetHeight - pageHeight) / 2;

          workspaces.forEach((workspace) => {
            workspace.set({
              left: (workspace.left || 0) + offsetX,
              top: offsetY,
            });
            workspace.setCoords();
          });
        }

        // For multi-page, don't set a global clipPath - each workspace clips itself
        initialCanvas.clipPath = undefined;
      }

      setCanvas(initialCanvas);
      setContainer(initialContainer);

      const currentState = JSON.stringify(
        initialCanvas.toJSON(JSON_KEYS)
      );
      canvasHistory.current = [currentState];
      setHistoryIndex(0);
    },
    [
      canvasHistory, // No need, this is from useRef
      setHistoryIndex, // No need, this is from useState
    ]
  );

  return { init, editor, snapLines, snappingOptions, container, hasClipboard };
};
