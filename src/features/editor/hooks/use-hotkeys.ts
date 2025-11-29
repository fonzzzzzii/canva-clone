import { fabric } from "fabric";
import { useRef } from "react";
import { useEvent } from "react-use";
import { ImageFrame, IFrame, isFrameType } from "@/features/editor/objects/image-frame";
import { FramedImage } from "@/features/editor/objects/framed-image";

interface UseHotkeysProps {
  canvas: fabric.Canvas | null;
  undo: () => void;
  redo: () => void;
  save: (skip?: boolean) => void;
  copy: () => void;
  paste: () => void;
  duplicate?: () => void;
  toggleGrid?: () => void;
  toggleSnapping?: () => void;
  zoomIn?: () => void;
  zoomOut?: () => void;
  autoZoom?: () => void;
  gridSize?: number;
  groupSelected?: () => void;
  ungroupSelected?: () => void;
  // Tool shortcuts
  enablePanMode?: () => void;
  disablePanMode?: () => void;
  isPanMode?: () => boolean;
  addRectangle?: () => void;
  addCircle?: () => void;
  addText?: () => void;
  enableDrawingMode?: () => void;
  disableDrawingMode?: () => void;
  onChangeActiveTool?: (tool: string) => void;
}

export const useHotkeys = ({
  canvas,
  undo,
  redo,
  save,
  copy,
  paste,
  duplicate,
  toggleGrid,
  toggleSnapping,
  zoomIn,
  zoomOut,
  autoZoom,
  gridSize = 10,
  groupSelected,
  ungroupSelected,
  enablePanMode,
  disablePanMode,
  isPanMode,
  addRectangle,
  addCircle,
  addText,
  enableDrawingMode,
  disableDrawingMode,
  onChangeActiveTool,
}: UseHotkeysProps) => {
  // Track if space is being held for temporary pan
  const spaceHeldRef = useRef(false);

  useEvent("keydown", (event) => {
    const isCtrlKey = event.ctrlKey || event.metaKey;
    const isShiftKey = event.shiftKey;
    const isBackspace = event.key === "Backspace";
    const isInput = ["INPUT", "TEXTAREA"].includes((event.target as HTMLElement).tagName);

    if (isInput) return;

    // delete key or backspace - delete selected objects and their linked pairs
    if (event.keyCode === 46 || isBackspace) {
      if (!canvas) return;

      const objectsToRemove: fabric.Object[] = [];

      canvas.getActiveObjects().forEach((object) => {
        objectsToRemove.push(object);

        // If deleting a frame (any type), also delete its linked image
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
    }

    if (isCtrlKey && event.key === "z") {
      event.preventDefault();
      undo();
    }

    if (isCtrlKey && event.key === "y") {
      event.preventDefault();
      redo();
    }

    if (isCtrlKey && event.key === "c") {
      event.preventDefault();
      copy();
    }

    if (isCtrlKey && event.key === "v") {
      event.preventDefault();
      paste();
    }

    // Ctrl+D: Duplicate selected objects
    if (isCtrlKey && event.key === "d") {
      event.preventDefault();
      console.log("[HOTKEYS] Ctrl+D pressed, calling duplicate");
      duplicate?.();
    }

    if (isCtrlKey && event.key === "s") {
      event.preventDefault();
      save(true);
    }

    if (isCtrlKey && event.key === "a") {
      event.preventDefault();
      canvas?.discardActiveObject();

      const allObjects = canvas?.getObjects().filter((object) => object.selectable);

      canvas?.setActiveObject(new fabric.ActiveSelection(allObjects, { canvas }));
      canvas?.renderAll();
    }

    // Ctrl+G: Group selected objects
    if (isCtrlKey && !isShiftKey && event.key === "g") {
      event.preventDefault();
      groupSelected?.();
    }

    // Ctrl+Shift+G: Ungroup selected objects
    if (isCtrlKey && isShiftKey && event.key.toLowerCase() === "g") {
      event.preventDefault();
      ungroupSelected?.();
    }

    // Ctrl+Shift+H: Toggle grid visibility (changed from Ctrl+Shift+G)
    if (isCtrlKey && isShiftKey && event.key.toLowerCase() === "h") {
      event.preventDefault();
      toggleGrid?.();
    }

    // Ctrl+': Toggle snapping on/off (toggle all snapping types)
    if (isCtrlKey && event.key === "'") {
      event.preventDefault();
      toggleSnapping?.();
    }

    // Ctrl+= or Ctrl++: Zoom in
    if (isCtrlKey && (event.key === "=" || event.key === "+")) {
      event.preventDefault();
      zoomIn?.();
    }

    // Ctrl+-: Zoom out
    if (isCtrlKey && event.key === "-") {
      event.preventDefault();
      zoomOut?.();
    }

    // Ctrl+0: Reset zoom
    if (isCtrlKey && event.key === "0") {
      event.preventDefault();
      autoZoom?.();
    }

    // Arrow keys: Move selected objects by one grid unit
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
      if (!canvas) return;

      const activeObjects = canvas.getActiveObjects();
      if (activeObjects.length === 0) return;

      event.preventDefault();

      // Calculate delta based on arrow key
      let deltaX = 0;
      let deltaY = 0;
      switch (event.key) {
        case "ArrowUp":
          deltaY = -gridSize;
          break;
        case "ArrowDown":
          deltaY = gridSize;
          break;
        case "ArrowLeft":
          deltaX = -gridSize;
          break;
        case "ArrowRight":
          deltaX = gridSize;
          break;
      }

      const activeObject = canvas.getActiveObject();

      // If we have an ActiveSelection, move it as a whole (this keeps bounding box in sync)
      if (activeObject?.type === "activeSelection") {
        const selection = activeObject as fabric.ActiveSelection;

        // Move the selection itself
        selection.set({
          left: (selection.left || 0) + deltaX,
          top: (selection.top || 0) + deltaY,
        });
        selection.setCoords();

        // Also move any linked objects that aren't in the selection
        const selectionObjects = selection.getObjects();
        const movedLinkedObjects = new Set<fabric.Object>();

        selectionObjects.forEach((obj) => {
          if (isFrameType(obj.type)) {
            const frame = obj as unknown as IFrame;
            const linkedImage = frame.getLinkedImage(canvas);
            // If the linked image is NOT in the selection, move it manually
            if (linkedImage && !selectionObjects.includes(linkedImage) && !movedLinkedObjects.has(linkedImage)) {
              linkedImage.set({
                left: (linkedImage.left || 0) + deltaX,
                top: (linkedImage.top || 0) + deltaY,
              });
              linkedImage.setCoords();
              movedLinkedObjects.add(linkedImage);
            }
          }

          if (obj.type === "framedImage") {
            const image = obj as FramedImage;
            const linkedFrame = image.getLinkedFrame(canvas);
            // If the linked frame is NOT in the selection, move it manually
            if (linkedFrame && !selectionObjects.includes(linkedFrame) && !movedLinkedObjects.has(linkedFrame)) {
              linkedFrame.set({
                left: (linkedFrame.left || 0) + deltaX,
                top: (linkedFrame.top || 0) + deltaY,
              });
              linkedFrame.setCoords();
              movedLinkedObjects.add(linkedFrame);
            }
          }
        });

        // Update clip paths for all frame/image pairs
        // Need to calculate absolute positions since objects in selection have relative coords
        // Account for selection scale when calculating positions
        const groupCenter = selection.getCenterPoint();
        selectionObjects.forEach((obj) => {
          if (isFrameType(obj.type)) {
            const frame = obj as unknown as IFrame;
            const linkedImage = frame.getLinkedImage(canvas) as FramedImage | null;
            if (linkedImage) {
              // Account for selection scale when calculating relative position
              const relativeLeft = (frame.left || 0) * (selection.scaleX || 1);
              const relativeTop = (frame.top || 0) * (selection.scaleY || 1);
              const absoluteLeft = groupCenter.x + relativeLeft;
              const absoluteTop = groupCenter.y + relativeTop;

              // Effective frame scale = frame scale * selection scale
              const effectiveScaleX = (frame.scaleX || 1) * (selection.scaleX || 1);
              const effectiveScaleY = (frame.scaleY || 1) * (selection.scaleY || 1);

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
      } else if (activeObject?.type === "group") {
        // Handle grouped objects - move the group itself
        const group = activeObject as fabric.Group;

        // Move the group
        group.set({
          left: (group.left || 0) + deltaX,
          top: (group.top || 0) + deltaY,
        });
        group.setCoords();

        // Update clip paths for any frame/image pairs inside the group
        const groupCenter = group.getCenterPoint();
        group.forEachObject((obj) => {
          if (isFrameType(obj.type)) {
            const frame = obj as unknown as IFrame;
            const linkedImage = frame.getLinkedImage(canvas) as FramedImage | null;

            if (linkedImage) {
              // Calculate absolute position accounting for group scale
              const relativeLeft = (frame.left || 0) * (group.scaleX || 1);
              const relativeTop = (frame.top || 0) * (group.scaleY || 1);
              const absoluteLeft = groupCenter.x + relativeLeft;
              const absoluteTop = groupCenter.y + relativeTop;

              // Effective frame scale = frame scale * group scale
              const effectiveScaleX = (frame.scaleX || 1) * (group.scaleX || 1);
              const effectiveScaleY = (frame.scaleY || 1) * (group.scaleY || 1);

              // Temporarily set frame to absolute position for correct clipPath and center
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

              // Update image position
              linkedImage.set({
                left: frameCenterX + linkedImage.offsetX,
                top: frameCenterY + linkedImage.offsetY,
              });

              linkedImage.applyFrameClip(frame);

              // Restore original relative position
              (frame as any).set({
                left: savedLeft,
                top: savedTop,
                scaleX: savedScaleX,
                scaleY: savedScaleY,
              });

              linkedImage.setCoords();
            }
          }
        });
      } else {
        // Single object selected - move it directly
        activeObjects.forEach((obj) => {
          obj.set({
            left: (obj.left || 0) + deltaX,
            top: (obj.top || 0) + deltaY,
          });
          obj.setCoords();

          // Handle linked pairs
          if (isFrameType(obj.type)) {
            const frame = obj as unknown as IFrame;
            const linkedImage = frame.getLinkedImage(canvas) as FramedImage | null;
            if (linkedImage) {
              linkedImage.set({
                left: (linkedImage.left || 0) + deltaX,
                top: (linkedImage.top || 0) + deltaY,
              });
              linkedImage.applyFrameClip(frame);
              linkedImage.setCoords();
            }
          }

          if (obj.type === "framedImage") {
            const image = obj as FramedImage;
            const linkedFrame = image.getLinkedFrame(canvas);
            if (linkedFrame) {
              linkedFrame.set({
                left: (linkedFrame.left || 0) + deltaX,
                top: (linkedFrame.top || 0) + deltaY,
              });
              linkedFrame.setCoords();
              image.applyFrameClip(linkedFrame);
            }
          }
        });
      }

      canvas.requestRenderAll();
      save();
    }

    // Tool shortcuts (single keys, no modifiers)
    if (!isCtrlKey && !isShiftKey) {
      switch (event.key.toLowerCase()) {
        case 'v':
          event.preventDefault();
          disablePanMode?.();
          disableDrawingMode?.();
          onChangeActiveTool?.('select');
          break;
        case 'h':
          event.preventDefault();
          disableDrawingMode?.();
          enablePanMode?.();
          break;
        case 'r':
          event.preventDefault();
          disablePanMode?.();
          disableDrawingMode?.();
          addRectangle?.();
          onChangeActiveTool?.('select');
          break;
        case 'o':
          event.preventDefault();
          disablePanMode?.();
          disableDrawingMode?.();
          addCircle?.();
          onChangeActiveTool?.('select');
          break;
        case 't':
          event.preventDefault();
          disablePanMode?.();
          disableDrawingMode?.();
          addText?.();
          onChangeActiveTool?.('select');
          break;
        case 'f':
          event.preventDefault();
          disablePanMode?.();
          disableDrawingMode?.();
          onChangeActiveTool?.('image-frame');
          break;
        case 'p':
          event.preventDefault();
          disablePanMode?.();
          enableDrawingMode?.();
          onChangeActiveTool?.('draw');
          break;
        case '=':
        case '+':
          event.preventDefault();
          zoomIn?.();
          break;
        case '-':
          event.preventDefault();
          zoomOut?.();
          break;
      }
    }

    // Space key for temporary pan (only if not already in pan mode via H key)
    if (event.code === 'Space' && !isCtrlKey && !spaceHeldRef.current) {
      event.preventDefault();
      if (!isPanMode?.()) {
        spaceHeldRef.current = true;
        enablePanMode?.();
      }
    }
  });

  // Keyup handler for Space release (temporary pan)
  useEvent("keyup", (event) => {
    if (event.code === 'Space' && spaceHeldRef.current) {
      spaceHeldRef.current = false;
      disablePanMode?.();
    }
  });
};
