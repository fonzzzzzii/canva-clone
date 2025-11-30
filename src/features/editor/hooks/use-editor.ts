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
  PageInfo,
  PageTemplate,
} from "@/features/editor/types";
import { useHistory } from "@/features/editor/hooks/use-history";
import {
  createFilter,
  downloadFile,
  isTextType,
  transformText
} from "@/features/editor/utils";
import { ImageFrame, IFrame, isFrameType } from "@/features/editor/objects/image-frame";
import { CircleFrame } from "@/features/editor/objects/circle-frame";
import { TriangleFrame } from "@/features/editor/objects/triangle-frame";
import { PolygonFrame } from "@/features/editor/objects/polygon-frame";
import { FramedImage } from "@/features/editor/objects/framed-image";
import { useHotkeys } from "@/features/editor/hooks/use-hotkeys";
import { useClipboard } from "@/features/editor/hooks//use-clipboard";
import { useAutoResize } from "@/features/editor/hooks/use-auto-resize";
import { useCanvasEvents } from "@/features/editor/hooks/use-canvas-events";
import { useWindowEvents } from "@/features/editor/hooks/use-window-events";
import { useLoadState } from "@/features/editor/hooks/use-load-state";
import { useSnapping } from "@/features/editor/hooks/use-snapping";
import { useMouseEvents } from "@/features/editor/hooks/use-mouse-events";
import {
  AlbumStyle,
  ImageWithOrientation,
  ImageOrientation,
  calculateMinimumPages,
  generateAutoLayout,
} from "@/features/editor/utils/auto-layout";
import { generateCanvasJsonWithAutoLayout } from "@/features/editor/utils/generate-canvas-json";
import type { ImageMetadata } from "@/features/editor/components/image-sidebar";
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
  panModeRef,
  justExitedPanModeRef,
  setIsPanModeState,
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
    enablePanMode: () => {
      // Blur any focused element to prevent spacebar from triggering button clicks
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      canvas.discardActiveObject();
      canvas.renderAll();
      panModeRef.current = true;
      setIsPanModeState(true);
      canvas.defaultCursor = 'grab';
      canvas.hoverCursor = 'grab';
      // Disable selection
      canvas.selection = false;
      canvas.forEachObject((obj) => {
        obj.selectable = false;
        obj.evented = false;
      });
    },
    disablePanMode: () => {
      panModeRef.current = false;
      setIsPanModeState(false);
      // Temporarily mark that we just exited pan mode to prevent accidental page selection
      justExitedPanModeRef.current = true;
      setTimeout(() => {
        justExitedPanModeRef.current = false;
      }, 100);
      canvas.defaultCursor = 'default';
      canvas.hoverCursor = 'move';
      // Re-enable selection
      canvas.selection = true;
      canvas.forEachObject((obj) => {
        // Don't make workspace/clip objects selectable
        if (obj.name === 'clip' || obj.name?.startsWith('clip-page-')) {
          return;
        }
        obj.selectable = true;
        obj.evented = true;
      });
    },
    isPanMode: () => panModeRef.current,
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
    addImage: (value: string, options?: { left?: number; top?: number }) => {
      console.log("[AddImage Debug] addImage called with URL:", value, "options:", options);
      fabric.Image.fromURL(
        value,
        (loadedImage) => {
          console.log("[AddImage Debug] Image loaded from URL, creating frame+image pair...");
          const workspace = getWorkspace();

          // Use original image aspect ratio
          const imgWidth = loadedImage.width || 1;
          const imgHeight = loadedImage.height || 1;

          // Determine frame size based on image aspect ratio
          // Max dimension is 400px or workspace size, whichever is smaller
          const maxSize = 400;
          const maxWidth = Math.min(workspace?.width || maxSize, maxSize);
          const maxHeight = Math.min(workspace?.height || maxSize, maxSize);

          // Scale to fit within max bounds while preserving aspect ratio
          const scaleToFit = Math.min(maxWidth / imgWidth, maxHeight / imgHeight);
          const frameWidth = imgWidth * scaleToFit;
          const frameHeight = imgHeight * scaleToFit;

          // Generate unique IDs for linking
          const imageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const frameId = `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          // Determine position - use provided coordinates or center on workspace
          let posX: number;
          let posY: number;

          if (options?.left !== undefined && options?.top !== undefined) {
            // Use provided position (already in canvas coordinates)
            posX = options.left;
            posY = options.top;
          } else {
            // Center on workspace
            posX = workspace
              ? (workspace.left || 0) + (workspace.width || 0) / 2
              : 300;
            posY = workspace
              ? (workspace.top || 0) + (workspace.height || 0) / 2
              : 300;
          }

          // Create the frame (visible, selectable)
          const frame = new ImageFrame({
            id: frameId,
            linkedImageId: imageId,
            width: frameWidth,
            height: frameHeight,
            left: posX,
            top: posY,
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
            left: posX,
            top: posY,
          });

          // Scale image to cover the frame (since frame matches aspect ratio, scale is 1:1)
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
            position: { x: posX, y: posY },
          });

          // Add both to canvas - image first (behind), then frame (on top for selection)
          canvas.add(framedImage);
          canvas.add(frame);

          // If no position was provided, center on workspace
          if (options?.left === undefined || options?.top === undefined) {
            canvas.centerObject(frame);
            framedImage.set({
              left: frame.left,
              top: frame.top,
            });
            framedImage.applyFrameClip(frame);
          }

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
    replaceFrameImage: (frame: IFrame, newImageUrl: string) => {
      const linkedImage = frame.getLinkedImage(canvas) as FramedImage | null;

      fabric.Image.fromURL(
        newImageUrl,
        (loadedImage) => {
          const imgWidth = loadedImage.width || 1;
          const imgHeight = loadedImage.height || 1;

          // Get frame dimensions - handle circles separately (use radius with respective scales for ellipse support)
          let frameWidth: number;
          let frameHeight: number;
          if (frame.type === "circleFrame") {
            const radiusX = ((frame as any).radius || 100) * (frame.scaleX || 1);
            const radiusY = ((frame as any).radius || 100) * (frame.scaleY || 1);
            frameWidth = radiusX * 2;
            frameHeight = radiusY * 2;
          } else {
            frameWidth = ((frame as any).width || 100) * (frame.scaleX || 1);
            frameHeight = ((frame as any).height || 100) * (frame.scaleY || 1);
          }

          // Calculate scale to cover the frame
          const scale = Math.max(frameWidth / imgWidth, frameHeight / imgHeight);

          if (linkedImage) {
            // Remove the old image
            canvas.remove(linkedImage);
          }

          // Generate new image ID
          const newImageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

          // Calculate frame center - use getCenterPoint for non-circle frames to match getClipPath
          let frameCenterX: number;
          let frameCenterY: number;
          if (frame.type === "circleFrame") {
            // Circle frames need manual calculation (radius-based positioning)
            const radiusX = ((frame as any).radius || 200) * (frame.scaleX || 1);
            const radiusY = ((frame as any).radius || 200) * (frame.scaleY || 1);
            frameCenterX = (frame.left || 0) + radiusX;
            frameCenterY = (frame.top || 0) + radiusY;
          } else {
            // For other frame types, use getCenterPoint to match getClipPath
            const center = (frame as any).getCenterPoint();
            frameCenterX = center.x;
            frameCenterY = center.y;
          }

          // Create new framed image
          const element = (loadedImage as any).getElement();
          const newFramedImage = new FramedImage(element, {
            id: newImageId,
            linkedFrameId: frame.id,
            imageUrl: newImageUrl,
            left: frameCenterX,
            top: frameCenterY,
            originX: "center",
            originY: "center",
          });

          // Scale image to cover the frame
          newFramedImage.scale(scale);
          newFramedImage.customScaleX = scale;
          newFramedImage.customScaleY = scale;

          // Update frame's linked image ID
          frame.linkedImageId = newImageId;

          // Apply clipping
          newFramedImage.applyFrameClip(frame);

          // Add image behind the frame
          const frameIndex = canvas.getObjects().indexOf(frame);
          canvas.insertAt(newFramedImage, frameIndex, false);

          // Update frame styling (remove placeholder now that it has an image)
          frame.updatePlaceholderStyle(canvas);

          canvas.requestRenderAll();
          save();
        },
        {
          crossOrigin: "anonymous",
        }
      );
    },
    delete: () => {
      const objectsToRemove: fabric.Object[] = [];

      canvas.getActiveObjects().forEach((object) => {
        objectsToRemove.push(object);

        // If deleting a frame, also delete its linked image
        if (isFrameType(object.type)) {
          const frame = object as unknown as IFrame;
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

        // If deleting a group, also delete linked images for any frames inside
        if (object.type === "group") {
          const group = object as fabric.Group;
          group.forEachObject((obj) => {
            if (isFrameType(obj.type)) {
              const frame = obj as unknown as IFrame;
              const linkedImage = frame.getLinkedImage(canvas);
              if (linkedImage && !objectsToRemove.includes(linkedImage)) {
                objectsToRemove.push(linkedImage);
              }
            }
          });
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
      // Create a CircleFrame (can accept images via drag-drop)
      const object = new CircleFrame({
        radius: CIRCLE_OPTIONS.radius,
      });

      addToCanvas(object);
    },
    addSoftRectangle: () => {
      // Create an ImageFrame (can accept images via drag-drop)
      const object = new ImageFrame({
        width: RECTANGLE_OPTIONS.width,
        height: RECTANGLE_OPTIONS.height,
        rx: 50,
        ry: 50,
      });

      addToCanvas(object);
    },
    addRectangle: () => {
      // Create an ImageFrame (can accept images via drag-drop)
      const object = new ImageFrame({
        width: RECTANGLE_OPTIONS.width,
        height: RECTANGLE_OPTIONS.height,
      });

      addToCanvas(object);
    },
    addTriangle: () => {
      const object = new TriangleFrame({
        ...TRIANGLE_OPTIONS,
      });

      addToCanvas(object);
    },
    addInverseTriangle: () => {
      const HEIGHT = TRIANGLE_OPTIONS.height;
      const WIDTH = TRIANGLE_OPTIONS.width;

      const object = new PolygonFrame(
        [
          { x: 0, y: 0 },
          { x: WIDTH, y: 0 },
          { x: WIDTH / 2, y: HEIGHT },
        ],
        {
          ...TRIANGLE_OPTIONS,
        }
      );

      addToCanvas(object);
    },
    addDiamond: () => {
      const HEIGHT = DIAMOND_OPTIONS.height;
      const WIDTH = DIAMOND_OPTIONS.width;

      const object = new PolygonFrame(
        [
          { x: WIDTH / 2, y: 0 },
          { x: WIDTH, y: HEIGHT / 2 },
          { x: WIDTH / 2, y: HEIGHT },
          { x: 0, y: HEIGHT / 2 },
        ],
        {
          ...DIAMOND_OPTIONS,
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
        if (isFrameType(obj.type)) {
          const frame = obj as unknown as IFrame;
          const image = frame.getLinkedImage(canvas) as FramedImage | null;
          if (image && !image.isInEditMode) {
            // Use frame's center point since offsetX/offsetY are offsets from center
            const frameCenter = (frame as any).getCenterPoint();
            image.set({
              left: frameCenter.x + image.offsetX,
              top: frameCenter.y + image.offsetY,
            });
            image.applyFrameClip(frame);
            image.setCoords();
          }
        }
      };

      // Sync all frames inside a group with their linked images
      const syncGroupImages = (group: fabric.Group, deltaX: number = 0, deltaY: number = 0) => {
        const groupCenter = group.getCenterPoint();
        console.log("[SYNC_GROUP_ALIGN] Group center:", groupCenter.x, groupCenter.y, "delta:", deltaX, deltaY);
        group.forEachObject((obj) => {
          if (isFrameType(obj.type)) {
            const frame = obj as unknown as IFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;
            console.log("[SYNC_GROUP_ALIGN] Frame found, linkedImage:", image ? "yes" : "no");
            if (image && !image.isInEditMode) {
              // First move the image by the same delta as the group
              image.set({
                left: (image.left || 0) + deltaX,
                top: (image.top || 0) + deltaY,
              });

              // Account for group scale when calculating absolute position
              const relativeLeft = (obj.left || 0) * (group.scaleX || 1);
              const relativeTop = (obj.top || 0) * (group.scaleY || 1);
              const absoluteLeft = groupCenter.x + relativeLeft;
              const absoluteTop = groupCenter.y + relativeTop;

              // Effective scale = frame scale * group scale
              const effectiveScaleX = (frame.scaleX || 1) * (group.scaleX || 1);
              const effectiveScaleY = (frame.scaleY || 1) * (group.scaleY || 1);

              console.log("[SYNC_GROUP_ALIGN] Frame absolute pos:", absoluteLeft, absoluteTop);
              console.log("[SYNC_GROUP_ALIGN] Image new pos:", image.left, image.top);

              // Temporarily modify frame position/scale to get correct clip path
              const savedLeft = frame.left;
              const savedTop = frame.top;
              const savedScaleX = frame.scaleX;
              const savedScaleY = frame.scaleY;

              (frame as any).set({
                left: absoluteLeft,
                top: absoluteTop,
                scaleX: effectiveScaleX,
                scaleY: effectiveScaleY,
              });

              image.applyFrameClip(frame);

              // Restore original position/scale
              (frame as any).set({
                left: savedLeft,
                top: savedTop,
                scaleX: savedScaleX,
                scaleY: savedScaleY,
              });

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
            if (isFrameType(obj.type)) {
              const frame = obj as unknown as IFrame;
              const image = frame.getLinkedImage(canvas) as FramedImage | null;
              if (image) {
                image.set({
                  left: (image.left || 0) + deltaX,
                });
                // Temporarily set frame to absolute position for correct clipPath
                const frameAbsoluteLeft = newSelectionCenter.x + (frame.left || 0);
                const frameAbsoluteTop = newSelectionCenter.y + (frame.top || 0);
                const savedLeft = frame.left;
                const savedTop = frame.top;

                (frame as any).set({
                  left: frameAbsoluteLeft,
                  top: frameAbsoluteTop,
                });

                image.applyFrameClip(frame);

                // Restore original relative position
                (frame as any).set({
                  left: savedLeft,
                  top: savedTop,
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
            syncGroupImages(activeObj as fabric.Group, deltaX, 0);
          }
        }

        canvas.requestRenderAll();
        save();
        return;
      }

      // Align objects to each other (requires multiple selection)
      if (activeObj.type === "activeSelection") {
        const selection = activeObj as fabric.ActiveSelection;
        const objects = selection.getObjects().filter(
          (obj) => obj.name !== "clip" && obj.type !== "framedImage"
        );

        if (objects.length < 2) return;

        // Discard selection first so objects have absolute positions
        canvas.discardActiveObject();

        // Get proper bounding rects that account for rotation
        const objectsWithBounds = objects.map((obj) => {
          const bounds = obj.getBoundingRect(true, true);
          return {
            obj,
            bounds,
          };
        });

        const leftmost = Math.min(...objectsWithBounds.map((o) => o.bounds.left));

        // Align all objects' left edges to the leftmost edge
        objectsWithBounds.forEach(({ obj, bounds }) => {
          const deltaX = leftmost - bounds.left;
          obj.set({ left: (obj.left || 0) + deltaX });
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
        if (isFrameType(obj.type)) {
          const frame = obj as unknown as IFrame;
          const image = frame.getLinkedImage(canvas) as FramedImage | null;
          if (image && !image.isInEditMode) {
            // Use frame's center point since offsetX/offsetY are offsets from center
            const frameCenter = (frame as any).getCenterPoint();
            image.set({
              left: frameCenter.x + image.offsetX,
              top: frameCenter.y + image.offsetY,
            });
            image.applyFrameClip(frame);
            image.setCoords();
          }
        }
      };

      // Sync all frames inside a group with their linked images
      const syncGroupImages = (group: fabric.Group, deltaX: number = 0, deltaY: number = 0) => {
        const groupCenter = group.getCenterPoint();
        group.forEachObject((obj) => {
          if (isFrameType(obj.type)) {
            const frame = obj as unknown as IFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;
            if (image && !image.isInEditMode) {
              // First move the image by the same delta as the group
              image.set({
                left: (image.left || 0) + deltaX,
                top: (image.top || 0) + deltaY,
              });

              // Account for group scale when calculating absolute position
              const relativeLeft = (obj.left || 0) * (group.scaleX || 1);
              const relativeTop = (obj.top || 0) * (group.scaleY || 1);
              const absoluteLeft = groupCenter.x + relativeLeft;
              const absoluteTop = groupCenter.y + relativeTop;

              // Effective scale = frame scale * group scale
              const effectiveScaleX = (frame.scaleX || 1) * (group.scaleX || 1);
              const effectiveScaleY = (frame.scaleY || 1) * (group.scaleY || 1);

              // Temporarily modify frame position/scale to get correct clip path
              const savedLeft = frame.left;
              const savedTop = frame.top;
              const savedScaleX = frame.scaleX;
              const savedScaleY = frame.scaleY;

              (frame as any).set({
                left: absoluteLeft,
                top: absoluteTop,
                scaleX: effectiveScaleX,
                scaleY: effectiveScaleY,
              });

              image.applyFrameClip(frame);

              // Restore original position/scale
              (frame as any).set({
                left: savedLeft,
                top: savedTop,
                scaleX: savedScaleX,
                scaleY: savedScaleY,
              });

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
            if (isFrameType(obj.type)) {
              const frame = obj as unknown as IFrame;
              const image = frame.getLinkedImage(canvas) as FramedImage | null;
              if (image) {
                image.set({
                  left: (image.left || 0) + deltaX,
                });
                // Temporarily set frame to absolute position for correct clipPath
                const frameAbsoluteLeft = newSelectionCenter.x + (frame.left || 0);
                const frameAbsoluteTop = newSelectionCenter.y + (frame.top || 0);
                const savedLeft = frame.left;
                const savedTop = frame.top;

                (frame as any).set({
                  left: frameAbsoluteLeft,
                  top: frameAbsoluteTop,
                });

                image.applyFrameClip(frame);

                // Restore original relative position
                (frame as any).set({
                  left: savedLeft,
                  top: savedTop,
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
            syncGroupImages(activeObj as fabric.Group, deltaX, 0);
          }
        }

        canvas.requestRenderAll();
        save();
        return;
      }

      // Align objects to each other
      if (activeObj.type === "activeSelection") {
        const selection = activeObj as fabric.ActiveSelection;
        const objects = selection.getObjects().filter(
          (obj) => obj.name !== "clip" && obj.type !== "framedImage"
        );

        if (objects.length < 2) return;

        // Discard selection first so objects have absolute positions
        canvas.discardActiveObject();

        // Get proper bounding rects that account for rotation
        const objectsWithBounds = objects.map((obj) => {
          const bounds = obj.getBoundingRect(true, true);
          return {
            obj,
            bounds,
            boundsCenterX: bounds.left + bounds.width / 2,
          };
        });

        const leftmost = Math.min(...objectsWithBounds.map((o) => o.bounds.left));
        const rightmost = Math.max(...objectsWithBounds.map((o) => o.bounds.left + o.bounds.width));
        const targetCenterX = (leftmost + rightmost) / 2;

        // Align all objects' centers to the group's center
        objectsWithBounds.forEach(({ obj, boundsCenterX }) => {
          const deltaX = targetCenterX - boundsCenterX;
          obj.set({ left: (obj.left || 0) + deltaX });
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
        if (isFrameType(obj.type)) {
          const frame = obj as unknown as IFrame;
          const image = frame.getLinkedImage(canvas) as FramedImage | null;
          if (image && !image.isInEditMode) {
            // Use frame's center point since offsetX/offsetY are offsets from center
            const frameCenter = (frame as any).getCenterPoint();
            image.set({
              left: frameCenter.x + image.offsetX,
              top: frameCenter.y + image.offsetY,
            });
            image.applyFrameClip(frame);
            image.setCoords();
          }
        }
      };

      // Sync all frames inside a group with their linked images
      const syncGroupImages = (group: fabric.Group, deltaX: number = 0, deltaY: number = 0) => {
        const groupCenter = group.getCenterPoint();
        group.forEachObject((obj) => {
          if (isFrameType(obj.type)) {
            const frame = obj as unknown as IFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;
            if (image && !image.isInEditMode) {
              // First move the image by the same delta as the group
              image.set({
                left: (image.left || 0) + deltaX,
                top: (image.top || 0) + deltaY,
              });

              // Account for group scale when calculating absolute position
              const relativeLeft = (obj.left || 0) * (group.scaleX || 1);
              const relativeTop = (obj.top || 0) * (group.scaleY || 1);
              const absoluteLeft = groupCenter.x + relativeLeft;
              const absoluteTop = groupCenter.y + relativeTop;

              // Effective scale = frame scale * group scale
              const effectiveScaleX = (frame.scaleX || 1) * (group.scaleX || 1);
              const effectiveScaleY = (frame.scaleY || 1) * (group.scaleY || 1);

              // Temporarily modify frame position/scale to get correct clip path
              const savedLeft = frame.left;
              const savedTop = frame.top;
              const savedScaleX = frame.scaleX;
              const savedScaleY = frame.scaleY;

              (frame as any).set({
                left: absoluteLeft,
                top: absoluteTop,
                scaleX: effectiveScaleX,
                scaleY: effectiveScaleY,
              });

              image.applyFrameClip(frame);

              // Restore original position/scale
              (frame as any).set({
                left: savedLeft,
                top: savedTop,
                scaleX: savedScaleX,
                scaleY: savedScaleY,
              });

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
            if (isFrameType(obj.type)) {
              const frame = obj as unknown as IFrame;
              const image = frame.getLinkedImage(canvas) as FramedImage | null;
              if (image) {
                image.set({
                  left: (image.left || 0) + deltaX,
                });
                // Temporarily set frame to absolute position for correct clipPath
                const frameAbsoluteLeft = newSelectionCenter.x + (frame.left || 0);
                const frameAbsoluteTop = newSelectionCenter.y + (frame.top || 0);
                const savedLeft = frame.left;
                const savedTop = frame.top;

                (frame as any).set({
                  left: frameAbsoluteLeft,
                  top: frameAbsoluteTop,
                });

                image.applyFrameClip(frame);

                // Restore original relative position
                (frame as any).set({
                  left: savedLeft,
                  top: savedTop,
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
            syncGroupImages(activeObj as fabric.Group, deltaX, 0);
          }
        }

        canvas.requestRenderAll();
        save();
        return;
      }

      // Align objects to each other
      if (activeObj.type === "activeSelection") {
        const selection = activeObj as fabric.ActiveSelection;
        const objects = selection.getObjects().filter(
          (obj) => obj.name !== "clip" && obj.type !== "framedImage"
        );

        if (objects.length < 2) return;

        // Discard selection first so objects have absolute positions
        canvas.discardActiveObject();

        // Get proper bounding rects that account for rotation
        const objectsWithBounds = objects.map((obj) => {
          const bounds = obj.getBoundingRect(true, true);
          return {
            obj,
            bounds,
            boundsRight: bounds.left + bounds.width,
          };
        });

        const rightmost = Math.max(...objectsWithBounds.map((o) => o.boundsRight));

        // Align all objects' right edges to the rightmost edge
        objectsWithBounds.forEach(({ obj, boundsRight }) => {
          const deltaX = rightmost - boundsRight;
          obj.set({ left: (obj.left || 0) + deltaX });
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
        if (isFrameType(obj.type)) {
          const frame = obj as unknown as IFrame;
          const image = frame.getLinkedImage(canvas) as FramedImage | null;
          if (image && !image.isInEditMode) {
            // Use frame's center point since offsetX/offsetY are offsets from center
            const frameCenter = (frame as any).getCenterPoint();
            image.set({
              left: frameCenter.x + image.offsetX,
              top: frameCenter.y + image.offsetY,
            });
            image.applyFrameClip(frame);
            image.setCoords();
          }
        }
      };

      // Sync all frames inside a group with their linked images
      const syncGroupImages = (group: fabric.Group, deltaX: number = 0, deltaY: number = 0) => {
        const groupCenter = group.getCenterPoint();
        group.forEachObject((obj) => {
          if (isFrameType(obj.type)) {
            const frame = obj as unknown as IFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;
            if (image && !image.isInEditMode) {
              // First move the image by the same delta as the group
              image.set({
                left: (image.left || 0) + deltaX,
                top: (image.top || 0) + deltaY,
              });

              // Account for group scale when calculating absolute position
              const relativeLeft = (obj.left || 0) * (group.scaleX || 1);
              const relativeTop = (obj.top || 0) * (group.scaleY || 1);
              const absoluteLeft = groupCenter.x + relativeLeft;
              const absoluteTop = groupCenter.y + relativeTop;

              // Effective scale = frame scale * group scale
              const effectiveScaleX = (frame.scaleX || 1) * (group.scaleX || 1);
              const effectiveScaleY = (frame.scaleY || 1) * (group.scaleY || 1);

              // Temporarily modify frame position/scale to get correct clip path
              const savedLeft = frame.left;
              const savedTop = frame.top;
              const savedScaleX = frame.scaleX;
              const savedScaleY = frame.scaleY;

              (frame as any).set({
                left: absoluteLeft,
                top: absoluteTop,
                scaleX: effectiveScaleX,
                scaleY: effectiveScaleY,
              });

              image.applyFrameClip(frame);

              // Restore original position/scale
              (frame as any).set({
                left: savedLeft,
                top: savedTop,
                scaleX: savedScaleX,
                scaleY: savedScaleY,
              });

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
            if (isFrameType(obj.type)) {
              const frame = obj as unknown as IFrame;
              const image = frame.getLinkedImage(canvas) as FramedImage | null;
              if (image) {
                image.set({
                  top: (image.top || 0) + deltaY,
                });
                // Temporarily set frame to absolute position for correct clipPath
                const frameAbsoluteLeft = newSelectionCenter.x + (frame.left || 0);
                const frameAbsoluteTop = newSelectionCenter.y + (frame.top || 0);
                const savedLeft = frame.left;
                const savedTop = frame.top;

                (frame as any).set({
                  left: frameAbsoluteLeft,
                  top: frameAbsoluteTop,
                });

                image.applyFrameClip(frame);

                // Restore original relative position
                (frame as any).set({
                  left: savedLeft,
                  top: savedTop,
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
            syncGroupImages(activeObj as fabric.Group, 0, deltaY);
          }
        }

        canvas.requestRenderAll();
        save();
        return;
      }

      // Align objects to each other
      if (activeObj.type === "activeSelection") {
        const selection = activeObj as fabric.ActiveSelection;
        const objects = selection.getObjects().filter(
          (obj) => obj.name !== "clip" && obj.type !== "framedImage"
        );

        if (objects.length < 2) return;

        // Discard selection first so objects have absolute positions
        canvas.discardActiveObject();

        // Get proper bounding rects that account for rotation
        const objectsWithBounds = objects.map((obj) => {
          const bounds = obj.getBoundingRect(true, true);
          return {
            obj,
            bounds,
          };
        });

        const topmost = Math.min(...objectsWithBounds.map((o) => o.bounds.top));

        // Align all objects' top edges to the topmost edge
        objectsWithBounds.forEach(({ obj, bounds }) => {
          const deltaY = topmost - bounds.top;
          obj.set({ top: (obj.top || 0) + deltaY });
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
        if (isFrameType(obj.type)) {
          const frame = obj as unknown as IFrame;
          const image = frame.getLinkedImage(canvas) as FramedImage | null;
          if (image && !image.isInEditMode) {
            // Use frame's center point since offsetX/offsetY are offsets from center
            const frameCenter = (frame as any).getCenterPoint();
            image.set({
              left: frameCenter.x + image.offsetX,
              top: frameCenter.y + image.offsetY,
            });
            image.applyFrameClip(frame);
            image.setCoords();
          }
        }
      };

      // Sync all frames inside a group with their linked images
      const syncGroupImages = (group: fabric.Group, deltaX: number = 0, deltaY: number = 0) => {
        const groupCenter = group.getCenterPoint();
        group.forEachObject((obj) => {
          if (isFrameType(obj.type)) {
            const frame = obj as unknown as IFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;
            if (image && !image.isInEditMode) {
              // First move the image by the same delta as the group
              image.set({
                left: (image.left || 0) + deltaX,
                top: (image.top || 0) + deltaY,
              });

              // Account for group scale when calculating absolute position
              const relativeLeft = (obj.left || 0) * (group.scaleX || 1);
              const relativeTop = (obj.top || 0) * (group.scaleY || 1);
              const absoluteLeft = groupCenter.x + relativeLeft;
              const absoluteTop = groupCenter.y + relativeTop;

              // Effective scale = frame scale * group scale
              const effectiveScaleX = (frame.scaleX || 1) * (group.scaleX || 1);
              const effectiveScaleY = (frame.scaleY || 1) * (group.scaleY || 1);

              // Temporarily modify frame position/scale to get correct clip path
              const savedLeft = frame.left;
              const savedTop = frame.top;
              const savedScaleX = frame.scaleX;
              const savedScaleY = frame.scaleY;

              (frame as any).set({
                left: absoluteLeft,
                top: absoluteTop,
                scaleX: effectiveScaleX,
                scaleY: effectiveScaleY,
              });

              image.applyFrameClip(frame);

              // Restore original position/scale
              (frame as any).set({
                left: savedLeft,
                top: savedTop,
                scaleX: savedScaleX,
                scaleY: savedScaleY,
              });

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
            if (isFrameType(obj.type)) {
              const frame = obj as unknown as IFrame;
              const image = frame.getLinkedImage(canvas) as FramedImage | null;
              if (image) {
                image.set({
                  top: (image.top || 0) + deltaY,
                });
                // Temporarily set frame to absolute position for correct clipPath
                const frameAbsoluteLeft = newSelectionCenter.x + (frame.left || 0);
                const frameAbsoluteTop = newSelectionCenter.y + (frame.top || 0);
                const savedLeft = frame.left;
                const savedTop = frame.top;

                (frame as any).set({
                  left: frameAbsoluteLeft,
                  top: frameAbsoluteTop,
                });

                image.applyFrameClip(frame);

                // Restore original relative position
                (frame as any).set({
                  left: savedLeft,
                  top: savedTop,
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
            syncGroupImages(activeObj as fabric.Group, 0, deltaY);
          }
        }

        canvas.requestRenderAll();
        save();
        return;
      }

      // Align objects to each other
      if (activeObj.type === "activeSelection") {
        const selection = activeObj as fabric.ActiveSelection;
        const objects = selection.getObjects().filter(
          (obj) => obj.name !== "clip" && obj.type !== "framedImage"
        );

        if (objects.length < 2) return;

        // Discard selection first so objects have absolute positions
        canvas.discardActiveObject();

        // Get proper bounding rects that account for rotation
        const objectsWithBounds = objects.map((obj) => {
          const bounds = obj.getBoundingRect(true, true);
          return {
            obj,
            bounds,
            boundsCenterY: bounds.top + bounds.height / 2,
          };
        });

        const topmost = Math.min(...objectsWithBounds.map((o) => o.bounds.top));
        const bottommost = Math.max(...objectsWithBounds.map((o) => o.bounds.top + o.bounds.height));
        const targetCenterY = (topmost + bottommost) / 2;

        // Align all objects' centers to the group's center
        objectsWithBounds.forEach(({ obj, boundsCenterY }) => {
          const deltaY = targetCenterY - boundsCenterY;
          obj.set({ top: (obj.top || 0) + deltaY });
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
        if (isFrameType(obj.type)) {
          const frame = obj as unknown as IFrame;
          const image = frame.getLinkedImage(canvas) as FramedImage | null;
          if (image && !image.isInEditMode) {
            // Use frame's center point since offsetX/offsetY are offsets from center
            const frameCenter = (frame as any).getCenterPoint();
            image.set({
              left: frameCenter.x + image.offsetX,
              top: frameCenter.y + image.offsetY,
            });
            image.applyFrameClip(frame);
            image.setCoords();
          }
        }
      };

      // Sync all frames inside a group with their linked images
      const syncGroupImages = (group: fabric.Group, deltaX: number = 0, deltaY: number = 0) => {
        const groupCenter = group.getCenterPoint();
        group.forEachObject((obj) => {
          if (isFrameType(obj.type)) {
            const frame = obj as unknown as IFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;
            if (image && !image.isInEditMode) {
              // First move the image by the same delta as the group
              image.set({
                left: (image.left || 0) + deltaX,
                top: (image.top || 0) + deltaY,
              });

              // Account for group scale when calculating absolute position
              const relativeLeft = (obj.left || 0) * (group.scaleX || 1);
              const relativeTop = (obj.top || 0) * (group.scaleY || 1);
              const absoluteLeft = groupCenter.x + relativeLeft;
              const absoluteTop = groupCenter.y + relativeTop;

              // Effective scale = frame scale * group scale
              const effectiveScaleX = (frame.scaleX || 1) * (group.scaleX || 1);
              const effectiveScaleY = (frame.scaleY || 1) * (group.scaleY || 1);

              // Temporarily modify frame position/scale to get correct clip path
              const savedLeft = frame.left;
              const savedTop = frame.top;
              const savedScaleX = frame.scaleX;
              const savedScaleY = frame.scaleY;

              (frame as any).set({
                left: absoluteLeft,
                top: absoluteTop,
                scaleX: effectiveScaleX,
                scaleY: effectiveScaleY,
              });

              image.applyFrameClip(frame);

              // Restore original position/scale
              (frame as any).set({
                left: savedLeft,
                top: savedTop,
                scaleX: savedScaleX,
                scaleY: savedScaleY,
              });

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
            if (isFrameType(obj.type)) {
              const frame = obj as unknown as IFrame;
              const image = frame.getLinkedImage(canvas) as FramedImage | null;
              if (image) {
                image.set({
                  top: (image.top || 0) + deltaY,
                });
                // Temporarily set frame to absolute position for correct clipPath
                const frameAbsoluteLeft = newSelectionCenter.x + (frame.left || 0);
                const frameAbsoluteTop = newSelectionCenter.y + (frame.top || 0);
                const savedLeft = frame.left;
                const savedTop = frame.top;

                (frame as any).set({
                  left: frameAbsoluteLeft,
                  top: frameAbsoluteTop,
                });

                image.applyFrameClip(frame);

                // Restore original relative position
                (frame as any).set({
                  left: savedLeft,
                  top: savedTop,
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
            syncGroupImages(activeObj as fabric.Group, 0, deltaY);
          }
        }

        canvas.requestRenderAll();
        save();
        return;
      }

      // Align objects to each other
      if (activeObj.type === "activeSelection") {
        const selection = activeObj as fabric.ActiveSelection;
        const objects = selection.getObjects().filter(
          (obj) => obj.name !== "clip" && obj.type !== "framedImage"
        );

        if (objects.length < 2) return;

        // Discard selection first so objects have absolute positions
        canvas.discardActiveObject();

        // Get proper bounding rects that account for rotation
        const objectsWithBounds = objects.map((obj) => {
          const bounds = obj.getBoundingRect(true, true);
          return {
            obj,
            bounds,
            boundsBottom: bounds.top + bounds.height,
          };
        });

        const bottommost = Math.max(...objectsWithBounds.map((o) => o.boundsBottom));

        // Align all objects' bottom edges to the bottommost edge
        objectsWithBounds.forEach(({ obj, boundsBottom }) => {
          const deltaY = bottommost - boundsBottom;
          obj.set({ top: (obj.top || 0) + deltaY });
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

          if (isFrameType(item.obj.type)) {
            const frame = item.obj as unknown as IFrame;
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

          if (isFrameType(item.obj.type)) {
            const frame = item.obj as unknown as IFrame;
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
      // Note: Does NOT zoom - use goToPage for navigation with zoom
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

        // If it's a frame, also lock linked image
        if (isFrameType(obj.type)) {
          const frame = obj as unknown as IFrame;
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

        // If it's a frame, also unlock linked image
        if (isFrameType(obj.type)) {
          const frame = obj as unknown as IFrame;
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

        // If it's a frame, also bring linked image to front (but behind frame)
        if (isFrameType(obj.type)) {
          const frame = obj as unknown as IFrame;
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

        // If it's a frame, also send linked image to back (but in front of frame)
        if (isFrameType(obj.type)) {
          const frame = obj as unknown as IFrame;
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

    // Duplicate - directly clone the selected objects without using clipboard
    duplicate: () => {
      const activeObject = canvas.getActiveObject();
      console.log("[DUPLICATE] Called. activeObject:", activeObject);
      console.log("[DUPLICATE] activeObject type:", activeObject?.type);
      console.log("[DUPLICATE] activeObject id:", (activeObject as any)?.id);

      if (!activeObject) {
        console.log("[DUPLICATE] No active object, returning early");
        return;
      }

      const offsetX = 20;
      const offsetY = 20;

      // Handle frame types - need to also clone linked image
      console.log("[DUPLICATE] isFrameType check:", isFrameType(activeObject.type));
      if (isFrameType(activeObject.type)) {
        const frame = activeObject as unknown as IFrame;
        const linkedImage = frame.getLinkedImage(canvas) as FramedImage | null;
        console.log("[DUPLICATE] Frame type detected. Frame id:", frame.id);
        console.log("[DUPLICATE] Linked image:", linkedImage);

        if (linkedImage) {
          console.log("[DUPLICATE] Cloning frame with linked image");
          frame.clone((clonedFrame: any) => {
            console.log("[DUPLICATE] Frame cloned:", clonedFrame);
            linkedImage.clone((clonedImage: any) => {
              console.log("[DUPLICATE] Image cloned:", clonedImage);
              // Generate new IDs
              const newFrameId = `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              const newImageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

              clonedFrame.id = newFrameId;
              clonedFrame.linkedImageId = newImageId;
              clonedImage.id = newImageId;
              clonedImage.linkedFrameId = newFrameId;

              clonedFrame.set({
                left: (clonedFrame.left || 0) + offsetX,
                top: (clonedFrame.top || 0) + offsetY,
                evented: true,
                selectable: true,
              });

              clonedImage.set({
                left: (clonedImage.left || 0) + offsetX,
                top: (clonedImage.top || 0) + offsetY,
                evented: false,
                selectable: false,
              });

              clonedImage.applyFrameClip(clonedFrame);

              canvas.add(clonedImage);
              canvas.add(clonedFrame);
              canvas.setActiveObject(clonedFrame);
              canvas.requestRenderAll();
              save();
            });
          });
          return;
        }
      }

      // Handle FramedImage - need to also clone linked frame
      console.log("[DUPLICATE] Checking if framedImage. type:", activeObject.type);
      if (activeObject.type === "framedImage") {
        const image = activeObject as FramedImage;
        const linkedFrame = image.getLinkedFrame(canvas);
        console.log("[DUPLICATE] FramedImage detected. Image id:", image.id);
        console.log("[DUPLICATE] Linked frame:", linkedFrame);

        if (linkedFrame) {
          console.log("[DUPLICATE] Cloning framedImage with linked frame");
          linkedFrame.clone((clonedFrame: any) => {
            console.log("[DUPLICATE] Frame cloned for framedImage:", clonedFrame);
            image.clone((clonedImage: any) => {
              console.log("[DUPLICATE] Image cloned for framedImage:", clonedImage);
              // Generate new IDs
              const newFrameId = `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
              const newImageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

              clonedFrame.id = newFrameId;
              clonedFrame.linkedImageId = newImageId;
              clonedImage.id = newImageId;
              clonedImage.linkedFrameId = newFrameId;

              clonedFrame.set({
                left: (clonedFrame.left || 0) + offsetX,
                top: (clonedFrame.top || 0) + offsetY,
                evented: true,
                selectable: true,
              });

              clonedImage.set({
                left: (clonedImage.left || 0) + offsetX,
                top: (clonedImage.top || 0) + offsetY,
                evented: false,
                selectable: false,
              });

              clonedImage.applyFrameClip(clonedFrame);

              canvas.add(clonedImage);
              canvas.add(clonedFrame);
              canvas.setActiveObject(clonedFrame);
              canvas.requestRenderAll();
              save();
            });
          });
          return;
        }
      }

      // Default behavior for other objects
      console.log("[DUPLICATE] Default behavior - cloning object type:", activeObject.type);
      activeObject.clone((cloned: any) => {
        console.log("[DUPLICATE] Default clone complete:", cloned);
        console.log("[DUPLICATE] Cloned type:", cloned?.type);
        cloned.set({
          left: (cloned.left || 0) + offsetX,
          top: (cloned.top || 0) + offsetY,
          evented: true,
        });

        if (cloned.type === "activeSelection") {
          console.log("[DUPLICATE] Handling activeSelection");
          cloned.canvas = canvas;
          cloned.forEachObject((obj: any) => {
            console.log("[DUPLICATE] Adding object from selection:", obj.type);
            canvas.add(obj);
          });
          cloned.setCoords();
        } else {
          console.log("[DUPLICATE] Adding single object to canvas");
          canvas.add(cloned);
        }

        canvas.setActiveObject(cloned);
        console.log("[DUPLICATE] Set active object and rendering");
        canvas.requestRenderAll();
        save();
      });
    },

    // Page Management
    getPages: (): PageInfo[] => {
      const workspaces = getWorkspaces();
      return workspaces
        .filter((ws: any) => ws.pageNumber !== undefined)
        .map((ws: any) => ({
          pageNumber: ws.pageNumber,
          spreadIndex: Math.floor((ws.pageNumber - 1) / 2),
          isLeftPage: ws.pageNumber % 2 === 1,
        }))
        .sort((a, b) => a.pageNumber - b.pageNumber);
    },

    getCurrentSpreadIndex: (): number => {
      return Math.floor((focusedPageNumber - 1) / 2);
    },

    goToPage: (pageNumber: number) => {
      setFocusedPageNumber(pageNumber);
      updatePageFocusVisuals();
      zoomToPage(pageNumber);
    },

    // Page reordering helpers
    getPageByNumber: (pageNumber: number): fabric.Rect | null => {
      const workspaces = getWorkspaces();
      const page = workspaces.find((ws: any) => ws.pageNumber === pageNumber);
      return page ? (page as fabric.Rect) : null;
    },

    getPagePosition: (pageNumber: number): { left: number; top: number } | null => {
      const workspaces = getWorkspaces();
      const page = workspaces.find((ws: any) => ws.pageNumber === pageNumber);
      if (!page) return null;
      return { left: page.left || 0, top: page.top || 0 };
    },

    canMovePage: (pageNumber: number, direction: 'left' | 'right'): boolean => {
      const workspaces = getWorkspaces();
      const totalPages = workspaces.filter((ws: any) => ws.pageNumber !== undefined).length;
      if (direction === 'left') {
        return pageNumber > 1;
      }
      return pageNumber < totalPages;
    },

    movePage: (fromPageNumber: number, toPageNumber: number) => {
      if (fromPageNumber === toPageNumber) return;

      const workspaces = getWorkspaces();
      const totalPages = workspaces.filter((ws: any) => ws.pageNumber !== undefined).length;

      // Validate page numbers
      if (fromPageNumber < 1 || fromPageNumber > totalPages) return;
      if (toPageNumber < 1 || toPageNumber > totalPages) return;

      // Get page dimensions
      const firstWorkspace = workspaces[0] as fabric.Rect;
      const pageWidth = firstWorkspace.width || 2970;
      const pageHeight = firstWorkspace.height || 2100;
      const pageTop = firstWorkspace.top || 0;
      const pageSpacing = 20;
      const spreadSpacing = 100;
      const spreadWidth = 2 * pageWidth + pageSpacing + spreadSpacing;

      // Store current state: page positions and their objects
      const pageData = new Map<number, {
        workspace: any;
        oldLeft: number;
        objects: fabric.Object[];
      }>();

      // Collect all objects on each page
      const allObjects = canvas.getObjects();
      workspaces.forEach((ws: any) => {
        if (ws.pageNumber === undefined) return;
        const pageLeft = ws.left || 0;
        const pageW = ws.width || 0;
        const pageH = ws.height || 0;
        const pageT = ws.top || 0;

        const objectsOnPage: fabric.Object[] = [];
        allObjects.forEach((obj: any) => {
          // Skip workspaces and snap lines
          if (obj.name?.startsWith("clip-page-") || obj.name === "clip") return;
          if (obj.type === "line" && obj.name?.startsWith("snap-line")) return;
          // Skip framedImages - they will be moved with their linked frames
          if (obj.type === "framedImage") return;

          const objCenter = obj.getCenterPoint();
          if (
            objCenter.x >= pageLeft &&
            objCenter.x <= pageLeft + pageW &&
            objCenter.y >= pageT &&
            objCenter.y <= pageT + pageH
          ) {
            objectsOnPage.push(obj);
          }
        });

        pageData.set(ws.pageNumber, {
          workspace: ws,
          oldLeft: pageLeft,
          objects: objectsOnPage,
        });
      });

      // Calculate new page number assignments
      const newPageNumbers = new Map<number, number>(); // oldPageNumber -> newPageNumber

      if (fromPageNumber < toPageNumber) {
        // Moving right: pages from (from+1) to (to) shift left by 1
        for (let p = 1; p <= totalPages; p++) {
          if (p === fromPageNumber) {
            newPageNumbers.set(p, toPageNumber);
          } else if (p > fromPageNumber && p <= toPageNumber) {
            newPageNumbers.set(p, p - 1);
          } else {
            newPageNumbers.set(p, p);
          }
        }
      } else {
        // Moving left: pages from (to) to (from-1) shift right by 1
        for (let p = 1; p <= totalPages; p++) {
          if (p === fromPageNumber) {
            newPageNumbers.set(p, toPageNumber);
          } else if (p >= toPageNumber && p < fromPageNumber) {
            newPageNumbers.set(p, p + 1);
          } else {
            newPageNumbers.set(p, p);
          }
        }
      }

      // Calculate new positions for each page based on new page numbers
      const calculatePageLeft = (pageNum: number): number => {
        const spreadIndex = Math.floor((pageNum - 1) / 2);
        const isLeftPage = pageNum % 2 === 1;
        const spreadStartX = spreadIndex * spreadWidth;
        return isLeftPage ? spreadStartX : spreadStartX + pageWidth + pageSpacing;
      };

      // Update each page and its objects
      pageData.forEach((data, oldPageNum) => {
        const newPageNum = newPageNumbers.get(oldPageNum);
        if (newPageNum === undefined) return;

        const newLeft = calculatePageLeft(newPageNum);
        const deltaX = newLeft - data.oldLeft;

        // Update workspace
        data.workspace.pageNumber = newPageNum;
        data.workspace.name = `clip-page-${newPageNum}`;
        data.workspace.set({ left: newLeft });
        data.workspace.setCoords();

        // Move objects on this page
        data.objects.forEach((obj: any) => {
          obj.set({ left: (obj.left || 0) + deltaX });
          obj.setCoords();

          // Handle linked images for frames
          if (isFrameType(obj.type)) {
            const frame = obj as unknown as IFrame;
            const linkedImage = frame.getLinkedImage(canvas) as FramedImage | null;
            if (linkedImage) {
              linkedImage.set({ left: (linkedImage.left || 0) + deltaX });
              linkedImage.setCoords();
              // Update clip path to match new frame position
              linkedImage.applyFrameClip(frame);
            }
          }

          // Handle groups containing frames
          if (obj.type === "group") {
            const group = obj as fabric.Group;
            const groupCenter = group.getCenterPoint();
            group.forEachObject((groupObj: any) => {
              if (isFrameType(groupObj.type)) {
                const frame = groupObj as unknown as IFrame;
                const linkedImage = frame.getLinkedImage(canvas) as FramedImage | null;
                if (linkedImage) {
                  linkedImage.set({ left: (linkedImage.left || 0) + deltaX });
                  linkedImage.setCoords();

                  // For frames in groups, need to calculate absolute position for clip path
                  const relativeLeft = (frame.left || 0) * (group.scaleX || 1);
                  const relativeTop = (frame.top || 0) * (group.scaleY || 1);
                  const absoluteLeft = groupCenter.x + relativeLeft;
                  const absoluteTop = groupCenter.y + relativeTop;
                  const effectiveScaleX = (frame.scaleX || 1) * (group.scaleX || 1);
                  const effectiveScaleY = (frame.scaleY || 1) * (group.scaleY || 1);

                  // Temporarily set frame to absolute position for correct clipPath
                  const savedLeft = frame.left;
                  const savedTop = frame.top;
                  const savedScaleX = frame.scaleX;
                  const savedScaleY = frame.scaleY;

                  (frame as any).set({
                    left: absoluteLeft,
                    top: absoluteTop,
                    scaleX: effectiveScaleX,
                    scaleY: effectiveScaleY,
                  });

                  linkedImage.applyFrameClip(frame);

                  // Restore original relative position
                  (frame as any).set({
                    left: savedLeft,
                    top: savedTop,
                    scaleX: savedScaleX,
                    scaleY: savedScaleY,
                  });
                }
              }
            });
          }
        });
      });

      canvas.requestRenderAll();
      save();
    },

    moveSpread: (fromSpreadIndex: number, toSpreadIndex: number) => {
      if (fromSpreadIndex === toSpreadIndex) return;

      const workspaces = getWorkspaces();
      const totalSpreads = Math.ceil(workspaces.filter((ws: any) => ws.pageNumber !== undefined).length / 2);

      // Validate spread indices
      if (fromSpreadIndex < 0 || fromSpreadIndex >= totalSpreads) return;
      if (toSpreadIndex < 0 || toSpreadIndex >= totalSpreads) return;

      // Get page dimensions
      const firstWorkspace = workspaces[0] as fabric.Rect;
      const pageWidth = firstWorkspace.width || 2970;
      const pageHeight = firstWorkspace.height || 2100;
      const pageTop = firstWorkspace.top || 0;
      const pageSpacing = 20;
      const spreadSpacing = 100;
      const spreadWidth = 2 * pageWidth + pageSpacing + spreadSpacing;

      // Store current state: spread positions and their objects
      const spreadData = new Map<number, {
        leftPage: any;
        rightPage: any;
        leftPageOldLeft: number;
        rightPageOldLeft: number;
        objects: fabric.Object[];
      }>();

      // Collect all objects for each spread
      const allObjects = canvas.getObjects();
      for (let s = 0; s < totalSpreads; s++) {
        const leftPageNum = s * 2 + 1;
        const rightPageNum = s * 2 + 2;

        const leftPage = workspaces.find((ws: any) => ws.pageNumber === leftPageNum);
        const rightPage = workspaces.find((ws: any) => ws.pageNumber === rightPageNum);

        if (!leftPage || !rightPage) continue;

        const objectsOnSpread: fabric.Object[] = [];

        // Find objects on left page
        const leftPageLeft = leftPage.left || 0;
        const leftPageW = leftPage.width || 0;
        const leftPageH = leftPage.height || 0;
        const leftPageT = leftPage.top || 0;

        // Find objects on right page
        const rightPageLeft = rightPage.left || 0;
        const rightPageW = rightPage.width || 0;
        const rightPageH = rightPage.height || 0;
        const rightPageT = rightPage.top || 0;

        allObjects.forEach((obj: any) => {
          if (obj.name?.startsWith("clip-page-") || obj.name === "clip") return;
          if (obj.type === "line" && obj.name?.startsWith("snap-line")) return;
          // Skip framedImages - they will be moved with their linked frames
          if (obj.type === "framedImage") return;

          const objCenter = obj.getCenterPoint();

          // Check if on left page
          if (
            objCenter.x >= leftPageLeft &&
            objCenter.x <= leftPageLeft + leftPageW &&
            objCenter.y >= leftPageT &&
            objCenter.y <= leftPageT + leftPageH
          ) {
            objectsOnSpread.push(obj);
            return;
          }

          // Check if on right page
          if (
            objCenter.x >= rightPageLeft &&
            objCenter.x <= rightPageLeft + rightPageW &&
            objCenter.y >= rightPageT &&
            objCenter.y <= rightPageT + rightPageH
          ) {
            objectsOnSpread.push(obj);
          }
        });

        spreadData.set(s, {
          leftPage,
          rightPage,
          leftPageOldLeft: leftPageLeft,
          rightPageOldLeft: rightPageLeft,
          objects: objectsOnSpread,
        });
      }

      // Calculate new spread index assignments
      const newSpreadIndices = new Map<number, number>(); // oldSpreadIndex -> newSpreadIndex

      if (fromSpreadIndex < toSpreadIndex) {
        // Moving right
        for (let s = 0; s < totalSpreads; s++) {
          if (s === fromSpreadIndex) {
            newSpreadIndices.set(s, toSpreadIndex);
          } else if (s > fromSpreadIndex && s <= toSpreadIndex) {
            newSpreadIndices.set(s, s - 1);
          } else {
            newSpreadIndices.set(s, s);
          }
        }
      } else {
        // Moving left
        for (let s = 0; s < totalSpreads; s++) {
          if (s === fromSpreadIndex) {
            newSpreadIndices.set(s, toSpreadIndex);
          } else if (s >= toSpreadIndex && s < fromSpreadIndex) {
            newSpreadIndices.set(s, s + 1);
          } else {
            newSpreadIndices.set(s, s);
          }
        }
      }

      // Calculate position for a spread
      const calculateSpreadStartX = (spreadIndex: number): number => {
        return spreadIndex * spreadWidth;
      };

      // Update each spread and its objects
      spreadData.forEach((data, oldSpreadIndex) => {
        const newSpreadIndex = newSpreadIndices.get(oldSpreadIndex);
        if (newSpreadIndex === undefined) return;

        const newSpreadStartX = calculateSpreadStartX(newSpreadIndex);
        const newLeftPageNum = newSpreadIndex * 2 + 1;
        const newRightPageNum = newSpreadIndex * 2 + 2;
        const newLeftPageLeft = newSpreadStartX;
        const newRightPageLeft = newSpreadStartX + pageWidth + pageSpacing;

        const deltaXLeft = newLeftPageLeft - data.leftPageOldLeft;
        const deltaXRight = newRightPageLeft - data.rightPageOldLeft;

        // Update left page
        data.leftPage.pageNumber = newLeftPageNum;
        data.leftPage.name = `clip-page-${newLeftPageNum}`;
        data.leftPage.set({ left: newLeftPageLeft });
        data.leftPage.setCoords();

        // Update right page
        data.rightPage.pageNumber = newRightPageNum;
        data.rightPage.name = `clip-page-${newRightPageNum}`;
        data.rightPage.set({ left: newRightPageLeft });
        data.rightPage.setCoords();

        // Move objects - need to determine which page each object was on
        data.objects.forEach((obj: any) => {
          const objCenter = obj.getCenterPoint();
          const leftPageW = data.leftPage.width || 0;
          const wasOnLeftPage = objCenter.x <= data.leftPageOldLeft + leftPageW;
          const deltaX = wasOnLeftPage ? deltaXLeft : deltaXRight;

          obj.set({ left: (obj.left || 0) + deltaX });
          obj.setCoords();

          // Handle linked images for frames
          if (isFrameType(obj.type)) {
            const frame = obj as unknown as IFrame;
            const linkedImage = frame.getLinkedImage(canvas) as FramedImage | null;
            if (linkedImage) {
              linkedImage.set({ left: (linkedImage.left || 0) + deltaX });
              linkedImage.setCoords();
              // Update clip path to match new frame position
              linkedImage.applyFrameClip(frame);
            }
          }

          // Handle groups containing frames
          if (obj.type === "group") {
            const group = obj as fabric.Group;
            const groupCenter = group.getCenterPoint();
            group.forEachObject((groupObj: any) => {
              if (isFrameType(groupObj.type)) {
                const frame = groupObj as unknown as IFrame;
                const linkedImage = frame.getLinkedImage(canvas) as FramedImage | null;
                if (linkedImage) {
                  linkedImage.set({ left: (linkedImage.left || 0) + deltaX });
                  linkedImage.setCoords();

                  // For frames in groups, need to calculate absolute position for clip path
                  const relativeLeft = (frame.left || 0) * (group.scaleX || 1);
                  const relativeTop = (frame.top || 0) * (group.scaleY || 1);
                  const absoluteLeft = groupCenter.x + relativeLeft;
                  const absoluteTop = groupCenter.y + relativeTop;
                  const effectiveScaleX = (frame.scaleX || 1) * (group.scaleX || 1);
                  const effectiveScaleY = (frame.scaleY || 1) * (group.scaleY || 1);

                  // Temporarily set frame to absolute position for correct clipPath
                  const savedLeft = frame.left;
                  const savedTop = frame.top;
                  const savedScaleX = frame.scaleX;
                  const savedScaleY = frame.scaleY;

                  (frame as any).set({
                    left: absoluteLeft,
                    top: absoluteTop,
                    scaleX: effectiveScaleX,
                    scaleY: effectiveScaleY,
                  });

                  linkedImage.applyFrameClip(frame);

                  // Restore original relative position
                  (frame as any).set({
                    left: savedLeft,
                    top: savedTop,
                    scaleX: savedScaleX,
                    scaleY: savedScaleY,
                  });
                }
              }
            });
          }
        });
      });

      canvas.requestRenderAll();
      save();
    },

    swapPagePositionsVisually: (pageA: number, pageB: number) => {
      console.log("[SWAP_PAGES] Called with pageA:", pageA, "pageB:", pageB);
      if (pageA === pageB) return;

      const workspaces = getWorkspaces();
      const pageAWorkspace = workspaces.find((ws: any) => ws.pageNumber === pageA);
      const pageBWorkspace = workspaces.find((ws: any) => ws.pageNumber === pageB);

      if (!pageAWorkspace || !pageBWorkspace) {
        console.log("[SWAP_PAGES] Workspace not found!");
        return;
      }

      const pageALeft = pageAWorkspace.left || 0;
      const pageBLeft = pageBWorkspace.left || 0;
      const pageWidth = (pageAWorkspace as any).width || 2970;
      const pageHeight = (pageAWorkspace as any).height || 2100;
      const pageATop = (pageAWorkspace as any).top || 0;
      const pageBTop = (pageBWorkspace as any).top || 0;

      // Calculate delta for each page
      const deltaA = pageBLeft - pageALeft;
      const deltaB = pageALeft - pageBLeft;
      console.log("[SWAP_PAGES] deltaA:", deltaA, "deltaB:", deltaB);

      // Collect objects on each page
      const allObjects = canvas.getObjects();
      const objectsOnPageA: fabric.Object[] = [];
      const objectsOnPageB: fabric.Object[] = [];

      allObjects.forEach((obj: any) => {
        if (obj.name?.startsWith("clip-page-") || obj.name === "clip") return;
        if (obj.type === "line" && obj.name?.startsWith("snap-line")) return;
        // Skip framedImages - they will be moved with their linked frames
        if (obj.type === "framedImage") return;

        const objCenter = obj.getCenterPoint();

        // Check page A
        if (
          objCenter.x >= pageALeft &&
          objCenter.x <= pageALeft + pageWidth &&
          objCenter.y >= pageATop &&
          objCenter.y <= pageATop + pageHeight
        ) {
          objectsOnPageA.push(obj);
          console.log("[SWAP_PAGES] Object on page A:", obj.type, "id:", obj.id);
        }
        // Check page B
        else if (
          objCenter.x >= pageBLeft &&
          objCenter.x <= pageBLeft + pageWidth &&
          objCenter.y >= pageBTop &&
          objCenter.y <= pageBTop + pageHeight
        ) {
          objectsOnPageB.push(obj);
          console.log("[SWAP_PAGES] Object on page B:", obj.type, "id:", obj.id);
        }
      });

      console.log("[SWAP_PAGES] Total objects on page A:", objectsOnPageA.length);
      console.log("[SWAP_PAGES] Total objects on page B:", objectsOnPageB.length);

      // Swap workspace positions
      (pageAWorkspace as any).set({ left: pageBLeft });
      (pageBWorkspace as any).set({ left: pageALeft });

      // Swap page numbers
      const tempPageNum = (pageAWorkspace as any).pageNumber;
      (pageAWorkspace as any).pageNumber = (pageBWorkspace as any).pageNumber;
      (pageBWorkspace as any).pageNumber = tempPageNum;

      // Swap names
      (pageAWorkspace as any).name = `clip-page-${(pageAWorkspace as any).pageNumber}`;
      (pageBWorkspace as any).name = `clip-page-${(pageBWorkspace as any).pageNumber}`;

      pageAWorkspace.setCoords();
      pageBWorkspace.setCoords();

      // Move objects on page A
      objectsOnPageA.forEach((obj: any) => {
        console.log("[SWAP_PAGES] Moving object on page A:", obj.type, "by deltaA:", deltaA);
        obj.set({ left: (obj.left || 0) + deltaA });
        obj.setCoords();

        // Handle linked images for frames
        if (isFrameType(obj.type)) {
          const frame = obj as unknown as IFrame;
          const linkedImage = frame.getLinkedImage(canvas) as FramedImage | null;
          console.log("[SWAP_PAGES] Frame found, linkedImage:", linkedImage ? "yes" : "no");
          if (linkedImage) {
            console.log("[SWAP_PAGES] Moving linked image and applying clip");
            linkedImage.set({ left: (linkedImage.left || 0) + deltaA });
            linkedImage.setCoords();
            // Update clip path to match new frame position
            linkedImage.applyFrameClip(frame);
            console.log("[SWAP_PAGES] Clip applied, clipPath:", linkedImage.clipPath);
          }
        }

        // Handle groups containing frames
        if (obj.type === "group") {
          const group = obj as fabric.Group;
          const groupCenter = group.getCenterPoint();
          console.log("[SWAP_PAGES] Group found, checking for frames inside");
          group.forEachObject((groupObj: any) => {
            if (isFrameType(groupObj.type)) {
              const frame = groupObj as unknown as IFrame;
              const linkedImage = frame.getLinkedImage(canvas) as FramedImage | null;
              if (linkedImage) {
                linkedImage.set({ left: (linkedImage.left || 0) + deltaA });
                linkedImage.setCoords();

                // For frames in groups, need to calculate absolute position for clip path
                const relativeLeft = (frame.left || 0) * (group.scaleX || 1);
                const relativeTop = (frame.top || 0) * (group.scaleY || 1);
                const absoluteLeft = groupCenter.x + relativeLeft;
                const absoluteTop = groupCenter.y + relativeTop;
                const effectiveScaleX = (frame.scaleX || 1) * (group.scaleX || 1);
                const effectiveScaleY = (frame.scaleY || 1) * (group.scaleY || 1);

                // Temporarily set frame to absolute position for correct clipPath
                const savedLeft = frame.left;
                const savedTop = frame.top;
                const savedScaleX = frame.scaleX;
                const savedScaleY = frame.scaleY;

                (frame as any).set({
                  left: absoluteLeft,
                  top: absoluteTop,
                  scaleX: effectiveScaleX,
                  scaleY: effectiveScaleY,
                });

                linkedImage.applyFrameClip(frame);

                // Restore original relative position
                (frame as any).set({
                  left: savedLeft,
                  top: savedTop,
                  scaleX: savedScaleX,
                  scaleY: savedScaleY,
                });
              }
            }
          });
        }
      });

      // Move objects on page B
      objectsOnPageB.forEach((obj: any) => {
        obj.set({ left: (obj.left || 0) + deltaB });
        obj.setCoords();

        // Handle linked images for frames
        if (isFrameType(obj.type)) {
          const frame = obj as unknown as IFrame;
          const linkedImage = frame.getLinkedImage(canvas) as FramedImage | null;
          if (linkedImage) {
            linkedImage.set({ left: (linkedImage.left || 0) + deltaB });
            linkedImage.setCoords();
            // Update clip path to match new frame position
            linkedImage.applyFrameClip(frame);
          }
        }

        // Handle groups containing frames
        if (obj.type === "group") {
          const group = obj as fabric.Group;
          const groupCenter = group.getCenterPoint();
          group.forEachObject((groupObj: any) => {
            if (isFrameType(groupObj.type)) {
              const frame = groupObj as unknown as IFrame;
              const linkedImage = frame.getLinkedImage(canvas) as FramedImage | null;
              if (linkedImage) {
                linkedImage.set({ left: (linkedImage.left || 0) + deltaB });
                linkedImage.setCoords();

                // For frames in groups, need to calculate absolute position for clip path
                const relativeLeft = (frame.left || 0) * (group.scaleX || 1);
                const relativeTop = (frame.top || 0) * (group.scaleY || 1);
                const absoluteLeft = groupCenter.x + relativeLeft;
                const absoluteTop = groupCenter.y + relativeTop;
                const effectiveScaleX = (frame.scaleX || 1) * (group.scaleX || 1);
                const effectiveScaleY = (frame.scaleY || 1) * (group.scaleY || 1);

                // Temporarily set frame to absolute position for correct clipPath
                const savedLeft = frame.left;
                const savedTop = frame.top;
                const savedScaleX = frame.scaleX;
                const savedScaleY = frame.scaleY;

                (frame as any).set({
                  left: absoluteLeft,
                  top: absoluteTop,
                  scaleX: effectiveScaleX,
                  scaleY: effectiveScaleY,
                });

                linkedImage.applyFrameClip(frame);

                // Restore original relative position
                (frame as any).set({
                  left: savedLeft,
                  top: savedTop,
                  scaleX: savedScaleX,
                  scaleY: savedScaleY,
                });
              }
            }
          });
        }
      });

      canvas.requestRenderAll();
      // Note: No save() - this is just for visual preview during drag
    },

    save: () => {
      save();
    },

    addSpreadAfter: (spreadIndex: number, leftTemplate: PageTemplate, rightTemplate: PageTemplate) => {
      const workspaces = getWorkspaces();
      if (workspaces.length === 0) return;

      // Get page dimensions and position from existing workspace
      const firstWorkspace = workspaces[0] as fabric.Rect;
      const pageWidth = firstWorkspace.width || 2970;
      const pageHeight = firstWorkspace.height || 2100;
      const pageTop = firstWorkspace.top || 0;
      const pageSpacing = 20;
      const spreadSpacing = 100;

      // Calculate insertion point (after spreadIndex)
      const insertAfterPageNumber = (spreadIndex + 1) * 2;
      const newLeftPageNumber = insertAfterPageNumber + 1;
      const newRightPageNumber = insertAfterPageNumber + 2;

      // 1. Store OLD workspace positions BEFORE any changes
      const oldWorkspacePositions = new Map<any, { left: number; pageNumber: number }>();
      workspaces.forEach((ws: any) => {
        oldWorkspacePositions.set(ws, {
          left: ws.left || 0,
          pageNumber: ws.pageNumber || 0,
        });
      });

      // 2. Renumber existing pages that come after the insertion point
      const allObjects = canvas.getObjects();
      allObjects.forEach((obj: any) => {
        if (obj.pageNumber && obj.pageNumber > insertAfterPageNumber) {
          obj.pageNumber += 2;
          if (obj.name?.startsWith("clip-page-")) {
            obj.name = `clip-page-${obj.pageNumber}`;
          }
        }
      });

      // 3. Update positions of pages that were renumbered (shift them right by one spread width)
      // Only pages AFTER the insertion point need to move - pages before stay in their original positions
      const spreadWidth = 2 * pageWidth + pageSpacing + spreadSpacing;
      workspaces.forEach((workspace: any) => {
        const oldPos = oldWorkspacePositions.get(workspace);
        if (!oldPos) return;

        // Only move workspaces that were renumbered (their old page number was > insertAfterPageNumber)
        if (oldPos.pageNumber > insertAfterPageNumber) {
          // Shift right by one spread width
          workspace.set({ left: (oldPos.left || 0) + spreadWidth });
          workspace.setCoords();
        }
      });

      // 4. Move all non-workspace objects to their new positions (if they're on pages that moved)
      allObjects.forEach((obj: any) => {
        if (obj.name?.startsWith("clip-page-") || obj.name === "clip") return;
        if (obj.type === "line" && obj.name?.startsWith("snap-line")) return;
        // Skip framedImages - they will be moved with their linked frames
        if (obj.type === "framedImage") return;

        // Find which page this object is on based on its position using OLD workspace positions
        const objCenter = obj.getCenterPoint();
        let foundWorkspace: any = null;
        let oldPosition: { left: number; pageNumber: number } | undefined;

        workspaces.forEach((ws: any) => {
          const oldPos = oldWorkspacePositions.get(ws);
          if (!oldPos) return;

          const wsLeft = oldPos.left;
          const wsTop = ws.top || 0;
          const wsWidth = ws.width || 0;
          const wsHeight = ws.height || 0;

          if (
            objCenter.x >= wsLeft &&
            objCenter.x <= wsLeft + wsWidth &&
            objCenter.y >= wsTop &&
            objCenter.y <= wsTop + wsHeight
          ) {
            foundWorkspace = ws;
            oldPosition = oldPos;
          }
        });

        // Only move if the object was on a page that was renumbered (old page number > insertAfterPageNumber)
        if (foundWorkspace && oldPosition && oldPosition.pageNumber > insertAfterPageNumber) {
          // Calculate the delta: new workspace position - old workspace position
          const deltaX = (foundWorkspace.left || 0) - oldPosition.left;
          obj.set({ left: (obj.left || 0) + deltaX });
          obj.setCoords();

          // Handle linked images for frames
          if (isFrameType(obj.type)) {
            const frame = obj as unknown as IFrame;
            const linkedImage = frame.getLinkedImage(canvas) as FramedImage | null;
            if (linkedImage) {
              linkedImage.set({ left: (linkedImage.left || 0) + deltaX });
              linkedImage.setCoords();
              // Update clip path to match new frame position
              linkedImage.applyFrameClip(frame);
            }
          }

          // Handle groups containing frames
          if (obj.type === "group") {
            const group = obj as fabric.Group;
            const groupCenter = group.getCenterPoint();
            group.forEachObject((groupObj: any) => {
              if (isFrameType(groupObj.type)) {
                const frame = groupObj as unknown as IFrame;
                const linkedImage = frame.getLinkedImage(canvas) as FramedImage | null;
                if (linkedImage) {
                  linkedImage.set({ left: (linkedImage.left || 0) + deltaX });
                  linkedImage.setCoords();

                  // For frames in groups, need to calculate absolute position for clip path
                  const relativeLeft = (frame.left || 0) * (group.scaleX || 1);
                  const relativeTop = (frame.top || 0) * (group.scaleY || 1);
                  const absoluteLeft = groupCenter.x + relativeLeft;
                  const absoluteTop = groupCenter.y + relativeTop;
                  const effectiveScaleX = (frame.scaleX || 1) * (group.scaleX || 1);
                  const effectiveScaleY = (frame.scaleY || 1) * (group.scaleY || 1);

                  // Temporarily set frame to absolute position for correct clipPath
                  const savedLeft = frame.left;
                  const savedTop = frame.top;
                  const savedScaleX = frame.scaleX;
                  const savedScaleY = frame.scaleY;

                  (frame as any).set({
                    left: absoluteLeft,
                    top: absoluteTop,
                    scaleX: effectiveScaleX,
                    scaleY: effectiveScaleY,
                  });

                  linkedImage.applyFrameClip(frame);

                  // Restore original relative position
                  (frame as any).set({
                    left: savedLeft,
                    top: savedTop,
                    scaleX: savedScaleX,
                    scaleY: savedScaleY,
                  });
                }
              }
            });
          }
        }
      });

      // 5. Create new pages
      // Calculate position based on the spread we're inserting after
      // Find the right page of the current spread (page number = insertAfterPageNumber)
      const insertAfterRightPage = workspaces.find(
        (ws: any) => oldWorkspacePositions.get(ws)?.pageNumber === insertAfterPageNumber
      );
      // New spread starts after the right page of the current spread
      const spreadStartX = insertAfterRightPage
        ? (insertAfterRightPage.left || 0) + pageWidth + spreadSpacing
        : 0;

      // Left page
      const leftPage = new fabric.Rect({
        width: pageWidth,
        height: pageHeight,
        name: `clip-page-${newLeftPageNumber}`,
        fill: "white",
        selectable: false,
        hasControls: false,
        left: spreadStartX,
        top: pageTop,
        shadow: new fabric.Shadow({
          color: "rgba(0,0,0,0.8)",
          blur: 5,
        }),
      });
      // @ts-ignore
      leftPage.pageNumber = newLeftPageNumber;
      // @ts-ignore
      leftPage.isPageWorkspace = true;

      // Right page
      const rightPage = new fabric.Rect({
        width: pageWidth,
        height: pageHeight,
        name: `clip-page-${newRightPageNumber}`,
        fill: "white",
        selectable: false,
        hasControls: false,
        left: spreadStartX + pageWidth + pageSpacing,
        top: pageTop,
        shadow: new fabric.Shadow({
          color: "rgba(0,0,0,0.8)",
          blur: 5,
        }),
      });
      // @ts-ignore
      rightPage.pageNumber = newRightPageNumber;
      // @ts-ignore
      rightPage.isPageWorkspace = true;

      canvas.add(leftPage);
      canvas.add(rightPage);

      // Send pages to back
      leftPage.sendToBack();
      rightPage.sendToBack();

      // 5. Apply templates to new pages
      const applyTemplateFrames = (pageNum: number, template: PageTemplate, pageLeft: number, top: number) => {
        template.frames.forEach((frame) => {
          const frameLeft = pageLeft + (frame.x / 100) * pageWidth;
          const frameTop = top + (frame.y / 100) * pageHeight;
          const frameWidth = (frame.width / 100) * pageWidth;
          const frameHeight = (frame.height / 100) * pageHeight;

          // ImageFrame constructor now handles placeholder styles automatically
          const imageFrame = new ImageFrame({
            left: frameLeft,
            top: frameTop,
            width: frameWidth,
            height: frameHeight,
          });

          canvas.add(imageFrame);
        });
      };

      applyTemplateFrames(newLeftPageNumber, leftTemplate, spreadStartX, pageTop);
      applyTemplateFrames(newRightPageNumber, rightTemplate, spreadStartX + pageWidth + pageSpacing, pageTop);

      // 6. Update page count
      // Note: pageCount is managed by the hook, we need to trigger a re-render

      canvas.requestRenderAll();
      save();

      // Update focused page but don't change view
      setFocusedPageNumber(newLeftPageNumber);
      updatePageFocusVisuals();
    },

    deleteSpread: (spreadIndex: number) => {
      const workspaces = getWorkspaces();
      const totalSpreads = Math.ceil(workspaces.length / 2);

      // Cannot delete if only one spread
      if (totalSpreads <= 1) return;

      // Calculate page numbers to delete
      const leftPageNumber = spreadIndex * 2 + 1;
      const rightPageNumber = spreadIndex * 2 + 2;

      // Get page dimensions
      const firstWorkspace = workspaces[0] as fabric.Rect;
      const pageWidth = firstWorkspace.width || 2970;
      const pageHeight = firstWorkspace.height || 2100;
      const pageSpacing = 20;
      const spreadSpacing = 100;

      // 1. Find and remove pages to delete
      const pagesToDelete = workspaces.filter(
        (ws: any) => ws.pageNumber === leftPageNumber || ws.pageNumber === rightPageNumber
      );

      // 2. Find and remove all objects on those pages
      const allObjects = canvas.getObjects();
      const objectsToRemove: fabric.Object[] = [];

      pagesToDelete.forEach((page: any) => {
        const pageLeft = page.left || 0;
        const pageTop = page.top || 0;
        const pageW = page.width || 0;
        const pageH = page.height || 0;

        allObjects.forEach((obj: any) => {
          if (obj === page) return;
          if (obj.name?.startsWith("clip-page-") || obj.name === "clip") return;
          if (obj.type === "line" && obj.name?.startsWith("snap-line")) return;

          const objCenter = obj.getCenterPoint();
          if (
            objCenter.x >= pageLeft &&
            objCenter.x <= pageLeft + pageW &&
            objCenter.y >= pageTop &&
            objCenter.y <= pageTop + pageH
          ) {
            objectsToRemove.push(obj);

            // Also remove linked image if this is a frame
            if (isFrameType(obj.type)) {
              const frame = obj as unknown as IFrame;
              const linkedImage = frame.getLinkedImage(canvas);
              if (linkedImage) {
                objectsToRemove.push(linkedImage);
              }
            }
          }
        });
      });

      // Remove objects and pages
      objectsToRemove.forEach((obj) => canvas.remove(obj));
      pagesToDelete.forEach((page) => canvas.remove(page));

      // 3. Renumber remaining pages
      const remainingWorkspaces = getWorkspaces();
      remainingWorkspaces.forEach((ws: any) => {
        if (ws.pageNumber > rightPageNumber) {
          ws.pageNumber -= 2;
          if (ws.name?.startsWith("clip-page-")) {
            ws.name = `clip-page-${ws.pageNumber}`;
          }
        }
      });

      // 4. Reposition remaining pages and move their objects
      remainingWorkspaces.forEach((workspace: any) => {
        if (!workspace.pageNumber) return;
        const pageNum = workspace.pageNumber;
        const newSpreadIndex = Math.floor((pageNum - 1) / 2);
        const isLeftPage = pageNum % 2 === 1;

        const spreadStartX = newSpreadIndex * (2 * pageWidth + pageSpacing + spreadSpacing);
        const xPosition = isLeftPage ? spreadStartX : spreadStartX + pageWidth + pageSpacing;

        const oldLeft = workspace.left || 0;
        const deltaX = xPosition - oldLeft;

        // Only move if there's a position change
        if (Math.abs(deltaX) > 0.1) {
          workspace.set({ left: xPosition });
          workspace.setCoords();

          // Move all objects on this page by the same deltaX
          const pageTop = workspace.top || 0;
          const pageW = workspace.width || 0;
          const pageH = workspace.height || 0;

          allObjects.forEach((obj: any) => {
            if (objectsToRemove.includes(obj)) return;
            if (obj.name?.startsWith("clip-page-") || obj.name === "clip") return;
            if (obj.type === "line" && obj.name?.startsWith("snap-line")) return;
            if (obj.isPageWorkspace) return;

            // Check if object is on this page (use old page position)
            const objCenter = obj.getCenterPoint();
            if (
              objCenter.x >= oldLeft &&
              objCenter.x <= oldLeft + pageW &&
              objCenter.y >= pageTop &&
              objCenter.y <= pageTop + pageH
            ) {
              // Move object with the page
              obj.set({
                left: (obj.left || 0) + deltaX,
              });
              obj.setCoords();

              // If this is a framedImage, reapply its clip path
              if (obj.type === "framedImage") {
                const framedImage = obj as FramedImage;
                const linkedFrame = framedImage.getLinkedFrame(canvas);
                if (linkedFrame) {
                  // Move the linked frame as well
                  linkedFrame.set({
                    left: (linkedFrame.left || 0) + deltaX,
                  });
                  linkedFrame.setCoords();

                  // Reapply clip path to the image
                  framedImage.applyFrameClip(linkedFrame);
                }
              }
            }
          });
        }
      });

      canvas.requestRenderAll();
      save();

      // Navigate to a valid page (update focus but maintain current view)
      const newFocusedPage = Math.min(focusedPageNumber, remainingWorkspaces.length);
      if (newFocusedPage !== focusedPageNumber) {
        setFocusedPageNumber(newFocusedPage);
      }
      updatePageFocusVisuals();
      // Don't zoom to page - maintain current view
    },

    applyTemplateToPage: (pageNumber: number, template: PageTemplate) => {
      console.log('[APPLY TEMPLATE] Starting applyTemplateToPage for page', pageNumber);
      const workspaces = getWorkspaces();
      const targetWorkspace = workspaces.find((ws: any) => ws.pageNumber === pageNumber) as fabric.Rect;

      if (!targetWorkspace) {
        console.log('[APPLY TEMPLATE] No workspace found for page', pageNumber);
        return;
      }

      console.log('[APPLY TEMPLATE] Found workspace, adding frames:', template.frames.length);

      const pageLeft = targetWorkspace.left || 0;
      const pageTop = targetWorkspace.top || 0;
      const pageWidth = targetWorkspace.width || 2970;
      const pageHeight = targetWorkspace.height || 2100;

      template.frames.forEach((frame, idx) => {
        const frameLeft = pageLeft + (frame.x / 100) * pageWidth;
        const frameTop = pageTop + (frame.y / 100) * pageHeight;
        const frameWidth = (frame.width / 100) * pageWidth;
        const frameHeight = (frame.height / 100) * pageHeight;

        console.log(`[APPLY TEMPLATE] Adding frame ${idx + 1}/${template.frames.length}`);

        // ImageFrame constructor now handles placeholder styles automatically
        const imageFrame = new ImageFrame({
          left: frameLeft,
          top: frameTop,
          width: frameWidth,
          height: frameHeight,
        });

        canvas.add(imageFrame);
      });

      console.log('[APPLY TEMPLATE] All frames added, requesting render');
      canvas.requestRenderAll();

      console.log('[APPLY TEMPLATE] Calling save()');
      save();
      console.log('[APPLY TEMPLATE] Save completed');
    },

    redistributeImages: (uploadedImages: ImageMetadata[], style: AlbumStyle) => {
      if (uploadedImages.length === 0) {
        return; // Nothing to redistribute
      }

      // Clear entire canvas
      const allObjects = canvas.getObjects();
      allObjects.forEach((obj) => canvas.remove(obj));

      // Analyze image dimensions for orientation matching
      const analyzeImageDimensions = async (
        imgs: ImageMetadata[]
      ): Promise<ImageWithOrientation[]> => {
        return Promise.all(
          imgs.map((img) => {
            return new Promise<ImageWithOrientation>((resolve) => {
              const image = new Image();
              image.crossOrigin = "anonymous";
              image.onload = () => {
                const orientation: ImageOrientation =
                  image.width / image.height > 1.15
                    ? "landscape"
                    : image.width / image.height < 0.85
                    ? "portrait"
                    : "square";
                resolve({
                  url: img.url,
                  width: image.width,
                  height: image.height,
                  orientation,
                });
              };
              image.onerror = () => {
                resolve({
                  url: img.url,
                  width: 100,
                  height: 100,
                  orientation: "square",
                });
              };
              image.src = img.url;
            });
          })
        );
      };

      // Run async analysis and regenerate layout
      analyzeImageDimensions(uploadedImages).then((imagesWithOrientation) => {
        const minPages = calculateMinimumPages(imagesWithOrientation.length, style);
        const layoutResult = generateAutoLayout(
          imagesWithOrientation,
          minPages,
          style
        );

        const canvasJson = generateCanvasJsonWithAutoLayout(
          layoutResult,
          2970,
          2100
        );

        // Load new layout
        const data = JSON.parse(canvasJson);
        const reviverFunction = (obj: any, fabricObj: fabric.Object) => {
          if (fabricObj.type === "framedImage") {
            const framedImage = fabricObj as FramedImage;
            const linkedFrameId = framedImage.linkedFrameId;

            if (linkedFrameId) {
              setTimeout(() => {
                const findFrameById = (frameId: string): IFrame | undefined => {
                  for (const obj of canvas.getObjects()) {
                    if (isFrameType(obj.type) && (obj as IFrame).id === frameId) {
                      return obj as IFrame;
                    }
                    if (obj.type === "group") {
                      const group = obj as fabric.Group;
                      const foundInGroup = group
                        .getObjects()
                        .find(
                          (o) => isFrameType(o.type) && (o as IFrame).id === frameId
                        ) as IFrame | undefined;
                      if (foundInGroup) return foundInGroup;
                    }
                  }
                  return undefined;
                };

                const frame = findFrameById(linkedFrameId);
                if (frame) {
                  const anyFramedImage = framedImage as any;
                  if (
                    anyFramedImage._frameWidth &&
                    anyFramedImage._frameHeight &&
                    framedImage.width &&
                    framedImage.height
                  ) {
                    const scaleX = anyFramedImage._frameWidth / framedImage.width;
                    const scaleY = anyFramedImage._frameHeight / framedImage.height;
                    const coverScale = Math.max(scaleX, scaleY);

                    framedImage.set({
                      scaleX: coverScale,
                      scaleY: coverScale,
                    });

                    framedImage.customScaleX = coverScale;
                    framedImage.customScaleY = coverScale;

                    delete anyFramedImage._frameWidth;
                    delete anyFramedImage._frameHeight;
                  }

                  framedImage.applyFrameClip(frame);
                  canvas.requestRenderAll();
                }
              }, 0);
            }
          }
        };

        canvas.loadFromJSON(data, () => {
          canvas.requestRenderAll();

          // Log framedImages after redistribution (after reviver completes)
          setTimeout(() => {
            const framedImages = canvas.getObjects().filter(obj => obj.type === 'framedImage');
            console.log('[REDISTRIBUTE] After redistribution, framedImages:',
              framedImages.map((obj: any) => ({
                imageUrl: obj.imageUrl?.substring(0, 50),
                scaleX: obj.scaleX,
                scaleY: obj.scaleY,
                customScaleX: obj.customScaleX,
                customScaleY: obj.customScaleY,
                left: obj.left,
                top: obj.top,
              }))
            );

            save();
          }, 100); // Wait for reviver setTimeout to complete

          // Don't zoom or pan - maintain current view
        }, reviverFunction);
      });
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
  const panModeRef = useRef<boolean>(false);
  const justExitedPanModeRef = useRef<boolean>(false);
  const [isPanModeState, setIsPanModeState] = useState(false);

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

  // Zoom to a specific page - callback version for use outside buildEditor
  const zoomToPageCallback = useCallback((pageNumber: number) => {
    if (!canvas) return;

    const workspaces = canvas
      .getObjects()
      .filter((object) => object.name === "clip" || object.name?.startsWith("clip-page-"));

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
  }, [canvas]);

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
    // Use multiplicative zoom like scroll wheel for consistent feel
    zoomRatio *= 1.1;
    // Clamp to same range as scroll zoom (0.01 to 1.0)
    zoomRatio = Math.min(Math.max(zoomRatio, 0.01), 1.0);
    const center = canvas.getCenter();
    canvas.zoomToPoint(
      new fabric.Point(center.left, center.top),
      zoomRatio
    );
  }, [canvas]);

  const zoomOut = useCallback(() => {
    if (!canvas) return;
    let zoomRatio = canvas.getZoom();
    // Use multiplicative zoom like scroll wheel for consistent feel
    zoomRatio *= 0.9;
    // Clamp to same range as scroll zoom (0.01 to 1.0)
    zoomRatio = Math.min(Math.max(zoomRatio, 0.01), 1.0);
    const center = canvas.getCenter();
    canvas.zoomToPoint(
      new fabric.Point(center.left, center.top),
      zoomRatio
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

  // Pan mode callbacks for hotkeys
  const enablePanModeCallback = useCallback(() => {
    if (!canvas) return;
    // Blur any focused element to prevent spacebar from triggering button clicks
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    canvas.discardActiveObject();
    canvas.renderAll();
    panModeRef.current = true;
    setIsPanModeState(true);
    canvas.defaultCursor = 'grab';
    canvas.hoverCursor = 'grab';
    canvas.selection = false;
    canvas.forEachObject((obj) => {
      obj.selectable = false;
      obj.evented = false;
    });
  }, [canvas]);

  const disablePanModeCallback = useCallback(() => {
    if (!canvas) return;
    panModeRef.current = false;
    setIsPanModeState(false);
    // Temporarily mark that we just exited pan mode to prevent accidental page selection
    justExitedPanModeRef.current = true;
    setTimeout(() => {
      justExitedPanModeRef.current = false;
    }, 100);
    canvas.defaultCursor = 'default';
    canvas.hoverCursor = 'move';
    canvas.selection = true;
    canvas.forEachObject((obj) => {
      if (obj.name === 'clip' || obj.name?.startsWith('clip-page-')) {
        return;
      }
      obj.selectable = true;
      obj.evented = true;
    });
  }, [canvas]);

  const isPanModeCallback = useCallback(() => {
    return panModeRef.current;
  }, []);

  // Drawing mode callbacks for hotkeys
  const enableDrawingModeCallback = useCallback(() => {
    if (!canvas) return;
    canvas.discardActiveObject();
    canvas.renderAll();
    canvas.isDrawingMode = true;
    canvas.freeDrawingBrush.width = strokeWidth;
    canvas.freeDrawingBrush.color = strokeColor;
  }, [canvas, strokeWidth, strokeColor]);

  const disableDrawingModeCallback = useCallback(() => {
    if (!canvas) return;
    canvas.isDrawingMode = false;
  }, [canvas]);

  // Shape creation callbacks for hotkeys
  const addRectangleCallback = useCallback(() => {
    if (!canvas) return;
    // Find the focused workspace to center the shape
    const workspaces = canvas.getObjects().filter(
      (obj: any) => obj.name === "clip" || obj.name?.startsWith("clip-page-")
    );
    const focusedWs = workspaces.find((ws: any) => ws.pageNumber === focusedPageNumber) || workspaces[0];
    const wsCenter = focusedWs?.getCenterPoint();
    const canvasCenter = canvas.getCenter();
    const centerX = wsCenter?.x ?? canvasCenter.left;
    const centerY = wsCenter?.y ?? canvasCenter.top;

    const rect = new fabric.Rect({
      ...RECTANGLE_OPTIONS,
      fill: fillColor,
      stroke: strokeColor,
      strokeWidth: strokeWidth,
      left: centerX,
      top: centerY,
      originX: 'center',
      originY: 'center',
    });
    canvas.add(rect);
    canvas.setActiveObject(rect);
    canvas.requestRenderAll();
    save();
  }, [canvas, fillColor, strokeColor, strokeWidth, focusedPageNumber, save]);

  const addCircleCallback = useCallback(() => {
    if (!canvas) return;
    const workspaces = canvas.getObjects().filter(
      (obj: any) => obj.name === "clip" || obj.name?.startsWith("clip-page-")
    );
    const focusedWs = workspaces.find((ws: any) => ws.pageNumber === focusedPageNumber) || workspaces[0];
    const wsCenter = focusedWs?.getCenterPoint();
    const canvasCenter = canvas.getCenter();
    const centerX = wsCenter?.x ?? canvasCenter.left;
    const centerY = wsCenter?.y ?? canvasCenter.top;

    const circle = new fabric.Circle({
      ...CIRCLE_OPTIONS,
      fill: fillColor,
      stroke: strokeColor,
      strokeWidth: strokeWidth,
      left: centerX,
      top: centerY,
      originX: 'center',
      originY: 'center',
    });
    canvas.add(circle);
    canvas.setActiveObject(circle);
    canvas.requestRenderAll();
    save();
  }, [canvas, fillColor, strokeColor, strokeWidth, focusedPageNumber, save]);

  const addTextCallback = useCallback(() => {
    if (!canvas) return;
    const workspaces = canvas.getObjects().filter(
      (obj: any) => obj.name === "clip" || obj.name?.startsWith("clip-page-")
    );
    const focusedWs = workspaces.find((ws: any) => ws.pageNumber === focusedPageNumber) || workspaces[0];
    const wsCenter = focusedWs?.getCenterPoint();
    const canvasCenter = canvas.getCenter();
    const centerX = wsCenter?.x ?? canvasCenter.left;
    const centerY = wsCenter?.y ?? canvasCenter.top;

    const text = new fabric.Textbox("Text", {
      ...TEXT_OPTIONS,
      fill: fillColor,
      left: centerX,
      top: centerY,
      originX: 'center',
      originY: 'center',
    });
    canvas.add(text);
    canvas.setActiveObject(text);
    canvas.requestRenderAll();
    save();
  }, [canvas, fillColor, focusedPageNumber, save]);

  // Duplicate callback for hotkeys
  const duplicateCallback = useCallback(() => {
    if (!canvas) return;

    const activeObject = canvas.getActiveObject();
    console.log("[DUPLICATE_CALLBACK] Called. activeObject:", activeObject);
    console.log("[DUPLICATE_CALLBACK] activeObject type:", activeObject?.type);

    if (!activeObject) {
      console.log("[DUPLICATE_CALLBACK] No active object, returning early");
      return;
    }

    const offsetX = 20;
    const offsetY = 20;

    // Handle frame types - need to also clone linked image
    if (isFrameType(activeObject.type)) {
      const frame = activeObject as unknown as IFrame;
      const linkedImage = frame.getLinkedImage(canvas) as FramedImage | null;
      console.log("[DUPLICATE_CALLBACK] Frame type detected. Frame id:", frame.id);

      if (linkedImage) {
        console.log("[DUPLICATE_CALLBACK] Cloning frame with linked image");
        frame.clone((clonedFrame: any) => {
          linkedImage.clone((clonedImage: any) => {
            const newFrameId = `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const newImageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            clonedFrame.id = newFrameId;
            clonedFrame.linkedImageId = newImageId;
            clonedImage.id = newImageId;
            clonedImage.linkedFrameId = newFrameId;

            clonedFrame.set({
              left: (clonedFrame.left || 0) + offsetX,
              top: (clonedFrame.top || 0) + offsetY,
              evented: true,
              selectable: true,
            });

            clonedImage.set({
              left: (clonedImage.left || 0) + offsetX,
              top: (clonedImage.top || 0) + offsetY,
              evented: false,
              selectable: false,
            });

            clonedImage.applyFrameClip(clonedFrame);

            canvas.add(clonedImage);
            canvas.add(clonedFrame);
            canvas.setActiveObject(clonedFrame);
            canvas.requestRenderAll();
            save();
          });
        });
        return;
      }
    }

    // Handle FramedImage - need to also clone linked frame
    if (activeObject.type === "framedImage") {
      const image = activeObject as FramedImage;
      const linkedFrame = image.getLinkedFrame(canvas);
      console.log("[DUPLICATE_CALLBACK] FramedImage detected");

      if (linkedFrame) {
        console.log("[DUPLICATE_CALLBACK] Cloning framedImage with linked frame");
        linkedFrame.clone((clonedFrame: any) => {
          image.clone((clonedImage: any) => {
            const newFrameId = `frame_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const newImageId = `img_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

            clonedFrame.id = newFrameId;
            clonedFrame.linkedImageId = newImageId;
            clonedImage.id = newImageId;
            clonedImage.linkedFrameId = newFrameId;

            clonedFrame.set({
              left: (clonedFrame.left || 0) + offsetX,
              top: (clonedFrame.top || 0) + offsetY,
              evented: true,
              selectable: true,
            });

            clonedImage.set({
              left: (clonedImage.left || 0) + offsetX,
              top: (clonedImage.top || 0) + offsetY,
              evented: false,
              selectable: false,
            });

            clonedImage.applyFrameClip(clonedFrame);

            canvas.add(clonedImage);
            canvas.add(clonedFrame);
            canvas.setActiveObject(clonedFrame);
            canvas.requestRenderAll();
            save();
          });
        });
        return;
      }
    }

    // Default behavior for other objects
    console.log("[DUPLICATE_CALLBACK] Default behavior - cloning object type:", activeObject.type);
    activeObject.clone((cloned: any) => {
      console.log("[DUPLICATE_CALLBACK] Default clone complete:", cloned?.type);
      cloned.set({
        left: (cloned.left || 0) + offsetX,
        top: (cloned.top || 0) + offsetY,
        evented: true,
      });

      if (cloned.type === "activeSelection") {
        console.log("[DUPLICATE_CALLBACK] Handling activeSelection");
        cloned.canvas = canvas;
        cloned.forEachObject((obj: any) => {
          canvas.add(obj);
        });
        cloned.setCoords();
      } else {
        canvas.add(cloned);
      }

      canvas.setActiveObject(cloned);
      canvas.requestRenderAll();
      save();
    });
  }, [canvas, save]);

  useHotkeys({
    undo,
    redo,
    copy,
    paste,
    duplicate: duplicateCallback,
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
    enablePanMode: enablePanModeCallback,
    disablePanMode: disablePanModeCallback,
    isPanMode: isPanModeCallback,
    addRectangle: addRectangleCallback,
    addCircle: addCircleCallback,
    addText: addTextCallback,
    enableDrawingMode: enableDrawingModeCallback,
    disableDrawingMode: disableDrawingModeCallback,
  });

  useLoadState({
    canvas,
    autoZoom,
    zoomToPage: zoomToPageCallback,
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
    panModeRef,
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
      // Skip page selection when in pan mode or just exited pan mode
      if (panModeRef.current || justExitedPanModeRef.current) return;

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
      if (isFrameType(target?.type)) {
        const frame = target as unknown as IFrame;
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
    const syncFrameImage = (frame: IFrame) => {
      const image = frame.getLinkedImage(canvas) as FramedImage | null;
      if (image && !image.isInEditMode) {
        // Calculate frame center - use getCenterPoint for non-circle frames to match getClipPath
        let frameCenterX: number;
        let frameCenterY: number;

        if (frame.type === "circleFrame") {
          // Circle frames need manual calculation (radius-based positioning)
          const radiusX = ((frame as any).radius || 200) * (frame.scaleX || 1);
          const radiusY = ((frame as any).radius || 200) * (frame.scaleY || 1);
          frameCenterX = (frame.left || 0) + radiusX;
          frameCenterY = (frame.top || 0) + radiusY;
        } else {
          // For other frame types, use getCenterPoint to match getClipPath
          const center = (frame as any).getCenterPoint();
          frameCenterX = center.x;
          frameCenterY = center.y;
        }

        const newLeft = frameCenterX + image.offsetX;
        const newTop = frameCenterY + image.offsetY;

        image.set({
          left: newLeft,
          top: newTop,
          dirty: true,
        });
        image.applyFrameClip(frame);
        image.setCoords();
      }
    };

    const handleObjectMoving = (e: fabric.IEvent) => {
      const target = e.target;

      // Shift key constraint for edit mode images
      if (target?.type === "framedImage") {
        const framedImage = target as FramedImage;

        if (framedImage.isInEditMode && e.e && (e.e as any).shiftKey && framedImage._initialDragPosition) {
          const initialPos = framedImage._initialDragPosition;
          const currentX = framedImage.left || 0;
          const currentY = framedImage.top || 0;

          // Calculate deltas from initial position to determine axis
          const deltaX = Math.abs(currentX - initialPos.x);
          const deltaY = Math.abs(currentY - initialPos.y);

          // Lock to axis with larger initial movement
          if (!framedImage._lockedAxis) {
            // Determine axis after minimum movement (5px threshold)
            if (deltaX > 5 || deltaY > 5) {
              framedImage._lockedAxis = deltaX > deltaY ? 'horizontal' : 'vertical';
            }
          }

          // Apply constraint based on locked axis - maintain ORIGINAL position on constrained axis
          if (framedImage._lockedAxis === 'horizontal') {
            // Allow horizontal movement, lock vertical to original Y
            framedImage.set({ top: initialPos.y });
          } else if (framedImage._lockedAxis === 'vertical') {
            // Allow vertical movement, lock horizontal to original X
            framedImage.set({ left: initialPos.x });
          }

          framedImage.setCoords();
        } else {
          // Shift not pressed - clear axis lock
          if (target?.type === "framedImage") {
            delete (target as FramedImage)._lockedAxis;
          }
        }
      }

      // Handle ActiveSelection (multi-select)
      if (target?.type === "activeSelection") {
        const selection = target as fabric.ActiveSelection;
        const selectionObjects = selection.getObjects();

        selection.forEachObject((obj) => {
          if (isFrameType(obj.type)) {
            // For objects in a group, we need to calculate their absolute position
            const frame = obj as unknown as IFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;

            if (image && !image.isInEditMode) {
              // Check if the linked image is ALSO in the selection
              // If so, fabric.js is already moving it - we just need to update the clip
              const imageIsInSelection = selectionObjects.some(
                (selObj) => selObj.type === "framedImage" && (selObj as any).id === image.id
              );

              // Get absolute position by combining group and object transforms
              // Account for selection scale when calculating relative position
              const groupCenter = selection.getCenterPoint();
              const relativeLeft = (obj.left || 0) * (selection.scaleX || 1);
              const relativeTop = (obj.top || 0) * (selection.scaleY || 1);

              const absoluteLeft = groupCenter.x + relativeLeft;
              const absoluteTop = groupCenter.y + relativeTop;

              // Effective frame scale = frame scale * selection scale
              const effectiveScaleX = (frame.scaleX || 1) * (selection.scaleX || 1);
              const effectiveScaleY = (frame.scaleY || 1) * (selection.scaleY || 1);

              // Temporarily modify frame position/scale to get correct clip path
              const savedLeft = frame.left;
              const savedTop = frame.top;
              const savedScaleX = frame.scaleX;
              const savedScaleY = frame.scaleY;

              (frame as any).set({
                left: absoluteLeft,
                top: absoluteTop,
                scaleX: effectiveScaleX,
                scaleY: effectiveScaleY,
              });

              // Calculate frame CENTER after setting temp position - use getCenterPoint for non-circle frames
              let frameCenterX: number;
              let frameCenterY: number;
              if (frame.type === "circleFrame") {
                const radiusX = ((frame as any).radius || 200) * effectiveScaleX;
                const radiusY = ((frame as any).radius || 200) * effectiveScaleY;
                frameCenterX = absoluteLeft + radiusX;
                frameCenterY = absoluteTop + radiusY;
              } else {
                const center = (frame as any).getCenterPoint();
                frameCenterX = center.x;
                frameCenterY = center.y;
              }

              if (!imageIsInSelection) {
                // Image is NOT in selection - we need to move it manually
                image.set({
                  left: frameCenterX + image.offsetX,
                  top: frameCenterY + image.offsetY,
                });
              }

              image.applyFrameClip(frame);
              image.setCoords();

              // Restore original position/scale
              (frame as any).set({
                left: savedLeft,
                top: savedTop,
                scaleX: savedScaleX,
                scaleY: savedScaleY,
              });
            }
          }
        });
        return;
      }

      // Handle native fabric.Group (grouped objects)
      if (target?.type === "group") {
        const group = target as fabric.Group;
        const groupCenter = group.getCenterPoint();

        group.forEachObject((obj) => {
          if (isFrameType(obj.type)) {
            const frame = obj as unknown as IFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;

            if (image && !image.isInEditMode) {
              // Get absolute position by combining group and object transforms
              // Account for group scale when calculating relative position
              const relativeLeft = (obj.left || 0) * (group.scaleX || 1);
              const relativeTop = (obj.top || 0) * (group.scaleY || 1);

              const absoluteLeft = groupCenter.x + relativeLeft;
              const absoluteTop = groupCenter.y + relativeTop;

              // Effective frame scale = frame scale * group scale
              const effectiveScaleX = (frame.scaleX || 1) * (group.scaleX || 1);
              const effectiveScaleY = (frame.scaleY || 1) * (group.scaleY || 1);

              // Temporarily modify frame position/scale to get correct clip path
              const savedLeft = frame.left;
              const savedTop = frame.top;
              const savedScaleX = frame.scaleX;
              const savedScaleY = frame.scaleY;

              (frame as any).set({
                left: absoluteLeft,
                top: absoluteTop,
                scaleX: effectiveScaleX,
                scaleY: effectiveScaleY,
              });

              // Calculate frame CENTER after setting temp position - use getCenterPoint for non-circle frames
              let frameCenterX: number;
              let frameCenterY: number;
              if (frame.type === "circleFrame") {
                const radiusX = ((frame as any).radius || 200) * effectiveScaleX;
                const radiusY = ((frame as any).radius || 200) * effectiveScaleY;
                frameCenterX = absoluteLeft + radiusX;
                frameCenterY = absoluteTop + radiusY;
              } else {
                const center = (frame as any).getCenterPoint();
                frameCenterX = center.x;
                frameCenterY = center.y;
              }

              image.set({
                left: frameCenterX + image.offsetX,
                top: frameCenterY + image.offsetY,
              });

              image.applyFrameClip(frame);

              // Restore original position/scale
              (frame as any).set({
                left: savedLeft,
                top: savedTop,
                scaleX: savedScaleX,
                scaleY: savedScaleY,
              });

              image.setCoords();
            }
          }
        });
        return;
      }

      // Handle single frame selection
      if (isFrameType(target?.type)) {
        syncFrameImage(target as unknown as IFrame);
      }
    };

    const handleObjectScaling = (e: fabric.IEvent) => {
      const target = e.target;

      // Handle ActiveSelection scaling
      if (target?.type === "activeSelection") {
        const selection = target as fabric.ActiveSelection;
        const selectionObjects = selection.getObjects();

        // Store initial scale values at the START of scaling operation
        if ((selection as any)._scalingStarted !== true) {
          (selection as any)._scalingStarted = true;
          (selection as any)._initialSelectionScaleX = selection.scaleX || 1;
          (selection as any)._initialSelectionScaleY = selection.scaleY || 1;
        }

        // Calculate the scale ratio from the initial scale
        const selectionScaleRatioX = (selection.scaleX || 1) / (selection as any)._initialSelectionScaleX;
        const selectionScaleRatioY = (selection.scaleY || 1) / (selection as any)._initialSelectionScaleY;
        const uniformSelectionScaleRatio = Math.max(selectionScaleRatioX, selectionScaleRatioY);

        const groupCenter = selection.getCenterPoint();

        selectionObjects.forEach((obj) => {
          if (isFrameType(obj.type)) {
            const frame = obj as unknown as IFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;

            if (image && !image.isInEditMode) {
              // Check if image is also in selection
              const imageIsInSelection = selectionObjects.some(
                (selObj) => selObj.type === "framedImage" && (selObj as any).id === image.id
              );

              // Calculate absolute position of frame (accounting for selection transform)
              const relativeLeft = (obj.left || 0) * (selection.scaleX || 1);
              const relativeTop = (obj.top || 0) * (selection.scaleY || 1);
              const absoluteLeft = groupCenter.x + relativeLeft;
              const absoluteTop = groupCenter.y + relativeTop;

              // Effective frame scale = frame scale * selection scale
              const effectiveScaleX = (frame.scaleX || 1) * (selection.scaleX || 1);
              const effectiveScaleY = (frame.scaleY || 1) * (selection.scaleY || 1);

              // Temporarily modify frame position/scale to get correct clip path and center
              const savedLeft = frame.left;
              const savedTop = frame.top;
              const savedScaleX = frame.scaleX;
              const savedScaleY = frame.scaleY;

              (frame as any).set({
                left: absoluteLeft,
                top: absoluteTop,
                scaleX: effectiveScaleX,
                scaleY: effectiveScaleY,
              });

              // Calculate frame CENTER after setting temp position - use getCenterPoint for non-circle frames
              let frameCenterX: number;
              let frameCenterY: number;
              if (frame.type === "circleFrame") {
                const radiusX = ((frame as any).radius || 200) * effectiveScaleX;
                const radiusY = ((frame as any).radius || 200) * effectiveScaleY;
                frameCenterX = absoluteLeft + radiusX;
                frameCenterY = absoluteTop + radiusY;
              } else {
                const center = (frame as any).getCenterPoint();
                frameCenterX = center.x;
                frameCenterY = center.y;
              }

              if (!imageIsInSelection) {
                // Image is NOT in selection - we control it manually
                // Use stored initial values for the image
                const initialOffsetX = (image as any)._initialOffsetX ?? image.offsetX;
                const initialOffsetY = (image as any)._initialOffsetY ?? image.offsetY;
                const initialCustomScale = (image as any)._initialCustomScale ?? image.customScaleX;

                // Store initial values if not already stored
                if ((image as any)._initialOffsetX === undefined) {
                  (image as any)._initialOffsetX = image.offsetX;
                  (image as any)._initialOffsetY = image.offsetY;
                  (image as any)._initialCustomScale = image.customScaleX;
                }

                // Calculate scaled values from initial
                const scaledOffsetX = initialOffsetX * selectionScaleRatioX;
                const scaledOffsetY = initialOffsetY * selectionScaleRatioY;
                const scaledCustomScale = initialCustomScale * uniformSelectionScaleRatio;

                image.set({
                  left: frameCenterX + scaledOffsetX,
                  top: frameCenterY + scaledOffsetY,
                  scaleX: scaledCustomScale,
                  scaleY: scaledCustomScale,
                });
              }
              // If image IS in selection, fabric.js handles its transform, just update clip

              image.applyFrameClip(frame);
              image.setCoords();

              // Restore original position/scale
              (frame as any).set({
                left: savedLeft,
                top: savedTop,
                scaleX: savedScaleX,
                scaleY: savedScaleY,
              });
            }
          }
        });

        canvas.requestRenderAll();
        return;
      }

      if (isFrameType(target?.type)) {
        const frame = target as unknown as IFrame;
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

          // Calculate frame CENTER - use getCenterPoint for non-circle frames to match getClipPath
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

          // Apply the scaled position and uniform scale
          image.set({
            left: frameCenterX + newOffsetX,
            top: frameCenterY + newOffsetY,
            scaleX: newScale,
            scaleY: newScale,
          });

          // Update clipPath to match new frame size
          image.applyFrameClip(frame);
        }
      }

      // Handle group scaling - sync all FramedImages inside
      if (target?.type === "group") {
        const group = target as fabric.Group;

        // Store initial scale values at the START of scaling operation
        // We use a flag to know if we've captured the initial state
        if ((group as any)._scalingStarted !== true) {
          (group as any)._scalingStarted = true;
          (group as any)._initialGroupScaleX = group.scaleX || 1;
          (group as any)._initialGroupScaleY = group.scaleY || 1;
        }

        // Calculate the scale ratio from the initial scale
        const groupScaleRatioX = (group.scaleX || 1) / (group as any)._initialGroupScaleX;
        const groupScaleRatioY = (group.scaleY || 1) / (group as any)._initialGroupScaleY;
        const uniformGroupScaleRatio = Math.max(groupScaleRatioX, groupScaleRatioY);

        const groupCenter = group.getCenterPoint();

        group.forEachObject((obj) => {
          if (isFrameType(obj.type)) {
            const frame = obj as unknown as IFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;

            if (image && !image.isInEditMode) {
              // Calculate absolute position of frame (accounting for group transform)
              const relativeLeft = (obj.left || 0) * (group.scaleX || 1);
              const relativeTop = (obj.top || 0) * (group.scaleY || 1);
              const absoluteLeft = groupCenter.x + relativeLeft;
              const absoluteTop = groupCenter.y + relativeTop;

              // Effective frame scale = frame scale * group scale
              const effectiveScaleX = (frame.scaleX || 1) * (group.scaleX || 1);
              const effectiveScaleY = (frame.scaleY || 1) * (group.scaleY || 1);

              // Temporarily modify frame position/scale to get correct clip path and center
              const savedLeft = frame.left;
              const savedTop = frame.top;
              const savedScaleX = frame.scaleX;
              const savedScaleY = frame.scaleY;

              (frame as any).set({
                left: absoluteLeft,
                top: absoluteTop,
                scaleX: effectiveScaleX,
                scaleY: effectiveScaleY,
              });

              // Calculate frame CENTER after setting temp position - use getCenterPoint for non-circle frames
              let frameCenterX: number;
              let frameCenterY: number;
              if (frame.type === "circleFrame") {
                const radiusX = ((frame as any).radius || 200) * effectiveScaleX;
                const radiusY = ((frame as any).radius || 200) * effectiveScaleY;
                frameCenterX = absoluteLeft + radiusX;
                frameCenterY = absoluteTop + radiusY;
              } else {
                const center = (frame as any).getCenterPoint();
                frameCenterX = center.x;
                frameCenterY = center.y;
              }

              // Use stored initial values for the image (before this scaling operation started)
              const initialOffsetX = (image as any)._initialOffsetX ?? image.offsetX;
              const initialOffsetY = (image as any)._initialOffsetY ?? image.offsetY;
              const initialCustomScale = (image as any)._initialCustomScale ?? image.customScaleX;

              // Store initial values if not already stored
              if ((image as any)._initialOffsetX === undefined) {
                (image as any)._initialOffsetX = image.offsetX;
                (image as any)._initialOffsetY = image.offsetY;
                (image as any)._initialCustomScale = image.customScaleX;
              }

              // Calculate scaled values from initial
              const scaledOffsetX = initialOffsetX * groupScaleRatioX;
              const scaledOffsetY = initialOffsetY * groupScaleRatioY;
              const scaledCustomScale = initialCustomScale * uniformGroupScaleRatio;

              image.set({
                left: frameCenterX + scaledOffsetX,
                top: frameCenterY + scaledOffsetY,
                scaleX: scaledCustomScale,
                scaleY: scaledCustomScale,
              });

              image.applyFrameClip(frame);

              // Restore original position/scale
              (frame as any).set({
                left: savedLeft,
                top: savedTop,
                scaleX: savedScaleX,
                scaleY: savedScaleY,
              });
            }
          }
        });

        canvas.requestRenderAll();
      }
    };

    const handleObjectModified = (e: fabric.IEvent) => {
      const target = e.target;

      // Handle ActiveSelection (multi-select) - sync all frames after move/scale
      if (target?.type === "activeSelection") {
        const selection = target as fabric.ActiveSelection;
        const selectionObjects = selection.getObjects();

        // Check if scaling occurred (flag was set during scaling)
        const wasScaled = (selection as any)._scalingStarted === true;

        // Calculate the scale ratio from initial (only if scaling occurred)
        let selectionScaleRatioX = 1;
        let selectionScaleRatioY = 1;
        let uniformSelectionScaleRatio = 1;

        if (wasScaled) {
          const initialScaleX = (selection as any)._initialSelectionScaleX;
          const initialScaleY = (selection as any)._initialSelectionScaleY;
          selectionScaleRatioX = (selection.scaleX || 1) / initialScaleX;
          selectionScaleRatioY = (selection.scaleY || 1) / initialScaleY;
          uniformSelectionScaleRatio = Math.max(selectionScaleRatioX, selectionScaleRatioY);
        }

        const groupCenter = selection.getCenterPoint();

        selectionObjects.forEach((obj) => {
          if (isFrameType(obj.type)) {
            const frame = obj as unknown as IFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;

            if (image && !image.isInEditMode) {
              // Check if image is also in selection
              const imageIsInSelection = selectionObjects.some(
                (selObj) => selObj.type === "framedImage" && (selObj as any).id === image.id
              );

              // Only update scale values if scaling actually occurred AND image is not in selection
              if (wasScaled && !imageIsInSelection) {
                // Finalize the scaled values using initial stored values
                const initialOffsetX = (image as any)._initialOffsetX ?? image.offsetX;
                const initialOffsetY = (image as any)._initialOffsetY ?? image.offsetY;
                const initialCustomScale = (image as any)._initialCustomScale ?? image.customScaleX;

                // Permanently update the image's stored offset/scale
                image.offsetX = initialOffsetX * selectionScaleRatioX;
                image.offsetY = initialOffsetY * selectionScaleRatioY;
                image.customScaleX = initialCustomScale * uniformSelectionScaleRatio;
                image.customScaleY = image.customScaleX;

                // Clear the initial values
                delete (image as any)._initialOffsetX;
                delete (image as any)._initialOffsetY;
                delete (image as any)._initialCustomScale;
              }

              // Calculate absolute position (accounting for selection scale)
              const relativeLeft = (obj.left || 0) * (selection.scaleX || 1);
              const relativeTop = (obj.top || 0) * (selection.scaleY || 1);
              const absoluteLeft = groupCenter.x + relativeLeft;
              const absoluteTop = groupCenter.y + relativeTop;

              // Effective frame scale
              const effectiveScaleX = (frame.scaleX || 1) * (selection.scaleX || 1);
              const effectiveScaleY = (frame.scaleY || 1) * (selection.scaleY || 1);

              // Temporarily modify frame position/scale to get correct clip path and center
              const savedLeft = frame.left;
              const savedTop = frame.top;
              const savedScaleX = frame.scaleX;
              const savedScaleY = frame.scaleY;

              (frame as any).set({
                left: absoluteLeft,
                top: absoluteTop,
                scaleX: effectiveScaleX,
                scaleY: effectiveScaleY,
              });

              // Calculate frame CENTER after setting temp position - use getCenterPoint for non-circle frames
              let frameCenterX: number;
              let frameCenterY: number;
              if (frame.type === "circleFrame") {
                const radiusX = ((frame as any).radius || 200) * effectiveScaleX;
                const radiusY = ((frame as any).radius || 200) * effectiveScaleY;
                frameCenterX = absoluteLeft + radiusX;
                frameCenterY = absoluteTop + radiusY;
              } else {
                const center = (frame as any).getCenterPoint();
                frameCenterX = center.x;
                frameCenterY = center.y;
              }

              if (!imageIsInSelection) {
                image.set({
                  left: frameCenterX + image.offsetX,
                  top: frameCenterY + image.offsetY,
                  scaleX: image.customScaleX,
                  scaleY: image.customScaleY,
                });
              }

              image.applyFrameClip(frame);
              image.setCoords();

              // Restore original position/scale
              (frame as any).set({
                left: savedLeft,
                top: savedTop,
                scaleX: savedScaleX,
                scaleY: savedScaleY,
              });
            }
          }
        });

        // Clear the selection's scaling tracking
        if (wasScaled) {
          delete (selection as any)._scalingStarted;
          delete (selection as any)._initialSelectionScaleX;
          delete (selection as any)._initialSelectionScaleY;
        }

        // Auto-select page when selection is moved to a different page
        const workspaces = canvas
          .getObjects()
          .filter((obj: any) => obj.name === "clip" || obj.name?.startsWith("clip-page-"));

        if (workspaces.length > 1) {
          const selCenter = selection.getCenterPoint();

          for (const workspace of workspaces) {
            const wsLeft = workspace.left || 0;
            const wsTop = workspace.top || 0;
            const wsWidth = (workspace.width || 0) * (workspace.scaleX || 1);
            const wsHeight = (workspace.height || 0) * (workspace.scaleY || 1);

            if (
              selCenter.x >= wsLeft &&
              selCenter.x <= wsLeft + wsWidth &&
              selCenter.y >= wsTop &&
              selCenter.y <= wsTop + wsHeight
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

        canvas.requestRenderAll();
        return;
      }

      // Handle native fabric.Group - sync all frames after move/scale
      if (target?.type === "group") {
        const group = target as fabric.Group;
        const groupCenter = group.getCenterPoint();

        // Check if scaling occurred (flag was set during scaling)
        const wasScaled = (group as any)._scalingStarted === true;

        // Calculate the scale ratio from initial (only if scaling occurred)
        let groupScaleRatioX = 1;
        let groupScaleRatioY = 1;
        let uniformGroupScaleRatio = 1;

        if (wasScaled) {
          const initialScaleX = (group as any)._initialGroupScaleX;
          const initialScaleY = (group as any)._initialGroupScaleY;
          groupScaleRatioX = (group.scaleX || 1) / initialScaleX;
          groupScaleRatioY = (group.scaleY || 1) / initialScaleY;
          uniformGroupScaleRatio = Math.max(groupScaleRatioX, groupScaleRatioY);
        }

        group.forEachObject((obj) => {
          if (isFrameType(obj.type)) {
            const frame = obj as unknown as IFrame;
            const image = frame.getLinkedImage(canvas) as FramedImage | null;

            if (image && !image.isInEditMode) {
              // Only update scale values if scaling actually occurred
              if (wasScaled) {
                // Finalize the scaled values using initial stored values
                const initialOffsetX = (image as any)._initialOffsetX ?? image.offsetX;
                const initialOffsetY = (image as any)._initialOffsetY ?? image.offsetY;
                const initialCustomScale = (image as any)._initialCustomScale ?? image.customScaleX;

                // Permanently update the image's stored offset/scale
                image.offsetX = initialOffsetX * groupScaleRatioX;
                image.offsetY = initialOffsetY * groupScaleRatioY;
                image.customScaleX = initialCustomScale * uniformGroupScaleRatio;
                image.customScaleY = image.customScaleX; // Keep uniform

                // Clear the temporary initial values
                delete (image as any)._initialOffsetX;
                delete (image as any)._initialOffsetY;
                delete (image as any)._initialCustomScale;
              }

              // Calculate absolute position of frame (accounting for group transform)
              const relativeLeft = (obj.left || 0) * (group.scaleX || 1);
              const relativeTop = (obj.top || 0) * (group.scaleY || 1);
              const absoluteLeft = groupCenter.x + relativeLeft;
              const absoluteTop = groupCenter.y + relativeTop;

              // Effective frame scale = frame scale * group scale
              const effectiveScaleX = (frame.scaleX || 1) * (group.scaleX || 1);
              const effectiveScaleY = (frame.scaleY || 1) * (group.scaleY || 1);

              // Temporarily modify frame position/scale to get correct clip path and center
              const savedLeft = frame.left;
              const savedTop = frame.top;
              const savedScaleX = frame.scaleX;
              const savedScaleY = frame.scaleY;

              (frame as any).set({
                left: absoluteLeft,
                top: absoluteTop,
                scaleX: effectiveScaleX,
                scaleY: effectiveScaleY,
              });

              // Calculate frame CENTER after setting temp position - use getCenterPoint for non-circle frames
              let frameCenterX: number;
              let frameCenterY: number;
              if (frame.type === "circleFrame") {
                const radiusX = ((frame as any).radius || 200) * effectiveScaleX;
                const radiusY = ((frame as any).radius || 200) * effectiveScaleY;
                frameCenterX = absoluteLeft + radiusX;
                frameCenterY = absoluteTop + radiusY;
              } else {
                const center = (frame as any).getCenterPoint();
                frameCenterX = center.x;
                frameCenterY = center.y;
              }

              image.set({
                left: frameCenterX + image.offsetX,
                top: frameCenterY + image.offsetY,
                scaleX: image.customScaleX,
                scaleY: image.customScaleY,
              });

              image.applyFrameClip(frame);
              image.setCoords();

              // Restore original position/scale
              (frame as any).set({
                left: savedLeft,
                top: savedTop,
                scaleX: savedScaleX,
                scaleY: savedScaleY,
              });
            }
          }
        });

        // Clear the group's scaling tracking only if scaling occurred
        if (wasScaled) {
          delete (group as any)._scalingStarted;
          delete (group as any)._initialGroupScaleX;
          delete (group as any)._initialGroupScaleY;
        }

        // Auto-select page when group is moved to a different page
        const workspaces = canvas
          .getObjects()
          .filter((obj: any) => obj.name === "clip" || obj.name?.startsWith("clip-page-"));

        if (workspaces.length > 1) {
          const grpCenter = group.getCenterPoint();

          for (const workspace of workspaces) {
            const wsLeft = workspace.left || 0;
            const wsTop = workspace.top || 0;
            const wsWidth = (workspace.width || 0) * (workspace.scaleX || 1);
            const wsHeight = (workspace.height || 0) * (workspace.scaleY || 1);

            if (
              grpCenter.x >= wsLeft &&
              grpCenter.x <= wsLeft + wsWidth &&
              grpCenter.y >= wsTop &&
              grpCenter.y <= wsTop + wsHeight
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

        canvas.requestRenderAll();
        return;
      }

      // Handle single frame
      if (isFrameType(target?.type)) {
        const frame = target as unknown as IFrame;

        const image = frame.getLinkedImage(canvas) as FramedImage | null;
        if (image && !image.isInEditMode) {
          // Calculate the scale DELTA from the modification
          const scaleRatioX = (frame.scaleX || 1) / frame._previousScaleX;
          const scaleRatioY = (frame.scaleY || 1) / frame._previousScaleY;

          // Check if scaling actually occurred (not just movement)
          const wasScaled = Math.abs(scaleRatioX - 1) > 0.001 || Math.abs(scaleRatioY - 1) > 0.001;

          if (wasScaled) {
            // Use the MAX ratio to maintain cover behavior (no stretching)
            const uniformScaleRatio = Math.max(scaleRatioX, scaleRatioY);

            // Update stored offset (scaled by respective axis for position)
            image.offsetX = image.offsetX * scaleRatioX;
            image.offsetY = image.offsetY * scaleRatioY;

            // Update stored scale uniformly (no stretching)
            image.customScaleX = image.customScaleX * uniformScaleRatio;
            image.customScaleY = image.customScaleX; // Keep uniform
          }

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

          // Final position using center calculation (preserve existing scale)
          image.set({
            left: frameCenterX + image.offsetX,
            top: frameCenterY + image.offsetY,
          });

          image.applyFrameClip(frame);
          image.setCoords();
        }

        // Update the frame's previous transform for next operation
        frame.updatePreviousTransform();
      }

      // Auto-select page when object is moved to a different page
      if (target) {
        const workspaces = canvas
          .getObjects()
          .filter((obj: any) => obj.name === "clip" || obj.name?.startsWith("clip-page-"));

        if (workspaces.length > 1) {
          const objCenter = target.getCenterPoint();

          for (const workspace of workspaces) {
            const wsLeft = workspace.left || 0;
            const wsTop = workspace.top || 0;
            const wsWidth = (workspace.width || 0) * (workspace.scaleX || 1);
            const wsHeight = (workspace.height || 0) * (workspace.scaleY || 1);

            if (
              objCenter.x >= wsLeft &&
              objCenter.x <= wsLeft + wsWidth &&
              objCenter.y >= wsTop &&
              objCenter.y <= wsTop + wsHeight
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
      }
    };

    const handleObjectMouseDown = (e: fabric.IEvent) => {
      const target = e.target;
      // Capture the starting position when user begins dragging an image in edit mode
      if (target?.type === "framedImage") {
        const framedImage = target as FramedImage;
        if (framedImage.isInEditMode) {
          framedImage._initialDragPosition = {
            x: framedImage.left || 0,
            y: framedImage.top || 0,
          };
        }
      }
    };

    const handleMouseUp = () => {
      // Clear shift constraint tracking when mouse is released
      canvas.getObjects().forEach((obj) => {
        if (obj.type === "framedImage") {
          const img = obj as any;
          delete img._initialDragPosition;
          delete img._lockedAxis;
        }
      });
    };

    canvas.on("mouse:down", handleObjectMouseDown);
    canvas.on("object:moving", handleObjectMoving);
    canvas.on("object:scaling", handleObjectScaling);
    canvas.on("object:modified", handleObjectModified);
    canvas.on("mouse:up", handleMouseUp);

    return () => {
      canvas.off("mouse:down", handleObjectMouseDown);
      canvas.off("object:moving", handleObjectMoving);
      canvas.off("object:scaling", handleObjectScaling);
      canvas.off("object:modified", handleObjectModified);
      canvas.off("mouse:up", handleMouseUp);
    };
  }, [canvas, focusedPageNumber, setFocusedPageNumber]);

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
        panModeRef,
        justExitedPanModeRef,
        setIsPanModeState,
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

  return { init, editor, snapLines, snappingOptions, container, hasClipboard, isPanMode: isPanModeState };
};
