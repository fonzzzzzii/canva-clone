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
    if (isCtrlKey && isShiftKey && event.key === "G") {
      event.preventDefault();
      ungroupSelected?.();
    }

    // Ctrl+Shift+H: Toggle grid visibility (changed from Ctrl+Shift+G)
    if (isCtrlKey && isShiftKey && event.key === "H") {
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

      // Track which objects we've already moved (to avoid moving linked pairs twice)
      const movedObjects = new Set<fabric.Object>();

      activeObjects.forEach((obj) => {
        if (movedObjects.has(obj)) return;

        const currentLeft = obj.left || 0;
        const currentTop = obj.top || 0;

        // Move the object
        obj.set({
          left: currentLeft + deltaX,
          top: currentTop + deltaY,
        });
        obj.setCoords();
        movedObjects.add(obj);

        // If it's an ImageFrame, also move and update its linked image
        if (obj.type === "imageFrame") {
          const frame = obj as ImageFrame;
          const linkedImage = frame.getLinkedImage(canvas);
          if (linkedImage && !movedObjects.has(linkedImage)) {
            linkedImage.set({
              left: (linkedImage.left || 0) + deltaX,
              top: (linkedImage.top || 0) + deltaY,
            });
            linkedImage.applyFrameClip(frame);
            linkedImage.setCoords();
            movedObjects.add(linkedImage);
          }
        }

        // If it's a FramedImage, also move its linked frame
        if (obj.type === "framedImage") {
          const image = obj as FramedImage;
          const linkedFrame = image.getLinkedFrame(canvas);
          if (linkedFrame && !movedObjects.has(linkedFrame)) {
            linkedFrame.set({
              left: (linkedFrame.left || 0) + deltaX,
              top: (linkedFrame.top || 0) + deltaY,
            });
            linkedFrame.setCoords();
            movedObjects.add(linkedFrame);
            // Update clip path after frame moved
            image.applyFrameClip(linkedFrame);
          }
        }
      });

      canvas.requestRenderAll();
      save();
    }
  });
};
