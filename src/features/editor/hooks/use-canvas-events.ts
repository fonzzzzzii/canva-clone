import { fabric } from "fabric";
import { useEffect } from "react";

interface UseCanvasEventsProps {
  save: () => void;
  canvas: fabric.Canvas | null;
  setSelectedObjects: (objects: fabric.Object[]) => void;
  clearSelectionCallback?: () => void;
};

export const useCanvasEvents = ({
  save,
  canvas,
  setSelectedObjects,
  clearSelectionCallback,
}: UseCanvasEventsProps) => {
  useEffect(() => {
    if (canvas) {
      canvas.on("object:added", () => save());
      canvas.on("object:removed", () => save());
      // Note: object:modified save is handled in use-snapping.ts after snap logic
      canvas.on("selection:created", (e) => {
        setSelectedObjects(canvas.getActiveObjects());
      });
      canvas.on("selection:updated", (e) => {
        setSelectedObjects(canvas.getActiveObjects());
      });
      canvas.on("selection:cleared", () => {
        setSelectedObjects([]);
        clearSelectionCallback?.();
      });
      // Note: mouse:down for page selection is handled in use-editor.ts
    }

    return () => {
      if (canvas) {
        canvas.off("object:added");
        canvas.off("object:removed");
        canvas.off("selection:created");
        canvas.off("selection:updated");
        canvas.off("selection:cleared");
      }
    };
  },
  [
    save,
    canvas,
    clearSelectionCallback,
    setSelectedObjects, // No need for this, this is from setState
  ]);
};
