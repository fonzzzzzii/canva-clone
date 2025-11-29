import { fabric } from "fabric";
import { useEffect } from "react";

interface UseCanvasEventsProps {
  save: () => void;
  canvas: fabric.Canvas | null;
  setSelectedObjects: (objects: fabric.Object[]) => void;
  clearSelectionCallback?: () => void;
  setFocusedPageNumber?: (pageNumber: number) => void;
};

export const useCanvasEvents = ({
  save,
  canvas,
  setSelectedObjects,
  clearSelectionCallback,
  setFocusedPageNumber,
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

      // Click on canvas to select page
      canvas.on("mouse:down", (e) => {
        if (!setFocusedPageNumber) return;

        const pointer = canvas.getPointer(e.e);
        const clickPoint = new fabric.Point(pointer.x, pointer.y);

        // Find all page workspaces
        const workspaces = canvas.getObjects().filter(
          (obj: any) => obj.name === "clip" || obj.name?.startsWith("clip-page-")
        );

        // Find which page was clicked
        for (const workspace of workspaces) {
          if (workspace.containsPoint(clickPoint)) {
            const pageNumber = (workspace as any).pageNumber;
            if (pageNumber) {
              setFocusedPageNumber(pageNumber);
            }
            break;
          }
        }
      });
    }

    return () => {
      if (canvas) {
        canvas.off("object:added");
        canvas.off("object:removed");
        canvas.off("selection:created");
        canvas.off("selection:updated");
        canvas.off("selection:cleared");
        canvas.off("mouse:down");
      }
    };
  },
  [
    save,
    canvas,
    clearSelectionCallback,
    setSelectedObjects, // No need for this, this is from setState
    setFocusedPageNumber,
  ]);
};
