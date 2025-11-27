import { fabric } from "fabric";
import { useEvent } from "react-use";

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
}: UseHotkeysProps) => {
  useEvent("keydown", (event) => {
    const isCtrlKey = event.ctrlKey || event.metaKey;
    const isShiftKey = event.shiftKey;
    const isBackspace = event.key === "Backspace";
    const isInput = ["INPUT", "TEXTAREA"].includes((event.target as HTMLElement).tagName);

    if (isInput) return;

    // delete key
    if (event.keyCode === 46) {
      canvas?.getActiveObjects().forEach((Object) => canvas?.remove(Object));
      canvas?.discardActiveObject();
      canvas?.renderAll();
    }

    if (isBackspace) {
      canvas?.remove(...canvas.getActiveObjects());
      canvas?.discardActiveObject();
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

    // Ctrl+Shift+G: Toggle grid visibility
    if (isCtrlKey && isShiftKey && event.key === "G") {
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

      activeObjects.forEach((obj) => {
        const currentLeft = obj.left || 0;
        const currentTop = obj.top || 0;

        switch (event.key) {
          case "ArrowUp":
            obj.set({ top: currentTop - gridSize });
            break;
          case "ArrowDown":
            obj.set({ top: currentTop + gridSize });
            break;
          case "ArrowLeft":
            obj.set({ left: currentLeft - gridSize });
            break;
          case "ArrowRight":
            obj.set({ left: currentLeft + gridSize });
            break;
        }

        obj.setCoords();
      });

      canvas.requestRenderAll();
      save();
    }
  });
};
