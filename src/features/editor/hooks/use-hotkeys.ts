import { fabric } from "fabric";
import { useEvent } from "react-use";
import { ImageFrame } from "@/features/editor/objects/image-frame";
import { FramedImage } from "@/features/editor/objects/framed-image";

interface UseHotkeysProps {
  canvas: fabric.Canvas | null;
  undo: () => void;
  redo: () => void;
  save: (skip?: boolean) => void;
  copy: () => void;
  paste: () => void;
  toggleGrid?: () => void;
  toggleSnapping?: () => void;
  zoomIn?: () => void;
  zoomOut?: () => void;
  autoZoom?: () => void;
  gridSize?: number;
  groupSelected?: () => void;
  ungroupSelected?: () => void;
}

export const useHotkeys = ({
  canvas,
  undo,
  redo,
  save,
  copy,
  paste,
  toggleGrid,
  toggleSnapping,
  zoomIn,
  zoomOut,
  autoZoom,
  gridSize = 10,
  groupSelected,
  ungroupSelected,
}: UseHotkeysProps) => {
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
      copy();
      paste();
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
          if (obj.type === "imageFrame") {
            const frame = obj as ImageFrame;
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
          if (obj.type === "imageFrame") {
            const frame = obj as ImageFrame;
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

              const tempFrame = {
                left: absoluteLeft,
                top: absoluteTop,
                width: frame.width,
                height: frame.height,
                scaleX: effectiveScaleX,
                scaleY: effectiveScaleY,
              } as ImageFrame;

              linkedImage.applyFrameClip(tempFrame);
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
          if (obj.type === "imageFrame") {
            const frame = obj as ImageFrame;
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

              // Update image position
              linkedImage.set({
                left: absoluteLeft + linkedImage.offsetX,
                top: absoluteTop + linkedImage.offsetY,
              });

              // Update clip path
              const tempFrame = {
                left: absoluteLeft,
                top: absoluteTop,
                width: frame.width,
                height: frame.height,
                scaleX: effectiveScaleX,
                scaleY: effectiveScaleY,
              } as ImageFrame;

              linkedImage.applyFrameClip(tempFrame);
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
          if (obj.type === "imageFrame") {
            const frame = obj as ImageFrame;
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
  });
};
