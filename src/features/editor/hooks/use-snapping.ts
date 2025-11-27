import { useEffect } from "react";
import { fabric } from "fabric";
import {
  calculateGridSnap,
  findAlignmentLines,
  calculateCanvasSnap,
  roundRotationAngle,
} from "@/features/editor/utils";
import type { SnappingOptions, SnapLine } from "@/features/editor/types";

interface UseSnappingProps {
  canvas: fabric.Canvas | null;
  snappingOptions: SnappingOptions;
  onSnapLinesChange: (lines: SnapLine[]) => void;
}

export const useSnapping = ({
  canvas,
  snappingOptions,
  onSnapLinesChange,
}: UseSnappingProps) => {
  useEffect(() => {
    if (!canvas) return;

    const getWorkspace = () => {
      return canvas.getObjects().find((obj) => obj.name === "clip");
    };

    const handleObjectMoving = (e: fabric.IEvent) => {
      const target = e.target;
      if (!target || target.name === "clip") return;

      const workspace = getWorkspace();
      if (!workspace) return;

      const snapLines: SnapLine[] = [];
      let snappedLeft = target.left || 0;
      let snappedTop = target.top || 0;
      let xSnapped = false;
      let ySnapped = false;

      // Priority 1: Snap to Canvas center/edges (highest priority)
      if (snappingOptions.snapToCanvas) {
        // Use object coordinates for consistent snapping
        const targetCenter = target.getCenterPoint();
        const workspaceCenter = workspace.getCenterPoint();
        const workspaceBounds = workspace.getBoundingRect();

        // Check horizontal center (X-axis)
        if (!xSnapped) {
          const distanceToCenter = Math.abs(targetCenter.x - workspaceCenter.x);
          if (distanceToCenter < snappingOptions.snapThreshold) {
            const offset = workspaceCenter.x - targetCenter.x;
            snappedLeft = (target.left || 0) + offset;
            xSnapped = true;
            snapLines.push({ x: workspaceBounds.left + workspaceBounds.width / 2, orientation: "vertical" });
          }
        }

        // Check vertical center (Y-axis)
        if (!ySnapped) {
          const distanceToCenter = Math.abs(targetCenter.y - workspaceCenter.y);
          if (distanceToCenter < snappingOptions.snapThreshold) {
            const offset = workspaceCenter.y - targetCenter.y;
            snappedTop = (target.top || 0) + offset;
            ySnapped = true;
            snapLines.push({ y: workspaceBounds.top + workspaceBounds.height / 2, orientation: "horizontal" });
          }
        }

        // Check edges
        const targetBounds = target.getBoundingRect();

        // Left edge
        if (!xSnapped && Math.abs(targetBounds.left - workspaceBounds.left) < snappingOptions.snapThreshold) {
          const offset = workspaceBounds.left - targetBounds.left;
          snappedLeft = (target.left || 0) + offset;
          xSnapped = true;
          snapLines.push({ x: workspaceBounds.left, orientation: "vertical" });
        }

        // Right edge
        if (!xSnapped && Math.abs((targetBounds.left + targetBounds.width) - (workspaceBounds.left + workspaceBounds.width)) < snappingOptions.snapThreshold) {
          const offset = (workspaceBounds.left + workspaceBounds.width) - (targetBounds.left + targetBounds.width);
          snappedLeft = (target.left || 0) + offset;
          xSnapped = true;
          snapLines.push({ x: workspaceBounds.left + workspaceBounds.width, orientation: "vertical" });
        }

        // Top edge
        if (!ySnapped && Math.abs(targetBounds.top - workspaceBounds.top) < snappingOptions.snapThreshold) {
          const offset = workspaceBounds.top - targetBounds.top;
          snappedTop = (target.top || 0) + offset;
          ySnapped = true;
          snapLines.push({ y: workspaceBounds.top, orientation: "horizontal" });
        }

        // Bottom edge
        if (!ySnapped && Math.abs((targetBounds.top + targetBounds.height) - (workspaceBounds.top + workspaceBounds.height)) < snappingOptions.snapThreshold) {
          const offset = (workspaceBounds.top + workspaceBounds.height) - (targetBounds.top + targetBounds.height);
          snappedTop = (target.top || 0) + offset;
          ySnapped = true;
          snapLines.push({ y: workspaceBounds.top + workspaceBounds.height, orientation: "horizontal" });
        }
      }

      // Priority 2: Snap to Objects (medium priority)
      if (snappingOptions.snapToObjects) {
        const alignmentLines = findAlignmentLines(
          canvas,
          target,
          snappingOptions.snapThreshold
        );

        const targetBounds = target.getBoundingRect();

        // Only snap to objects if canvas snap didn't apply
        alignmentLines.vertical.forEach((x) => {
          if (!xSnapped) {
            const targetCenter = targetBounds.left + targetBounds.width / 2;
            const offset = x - targetCenter;

            if (Math.abs(offset) < snappingOptions.snapThreshold) {
              snappedLeft = (target.left || 0) + offset;
              xSnapped = true;
              snapLines.push({ x, orientation: "vertical" });
            }
          }
        });

        alignmentLines.horizontal.forEach((y) => {
          if (!ySnapped) {
            const targetCenter = targetBounds.top + targetBounds.height / 2;
            const offset = y - targetCenter;

            if (Math.abs(offset) < snappingOptions.snapThreshold) {
              snappedTop = (target.top || 0) + offset;
              ySnapped = true;
              snapLines.push({ y, orientation: "horizontal" });
            }
          }
        });
      }

      // Priority 3: Snap to Grid (lowest priority)
      if (snappingOptions.snapToGrid) {
        const workspaceBounds = workspace.getBoundingRect();

        // Calculate position relative to workspace origin
        const relativeLeft = (target.left || 0) - (workspace.left || 0);
        const relativeTop = (target.top || 0) - (workspace.top || 0);

        // Snap to grid in workspace coordinate space
        const gridSnap = calculateGridSnap(
          { left: relativeLeft, top: relativeTop },
          snappingOptions.snapGridSize
        );

        // Convert back to canvas coordinates
        if (!xSnapped) {
          snappedLeft = (workspace.left || 0) + gridSnap.left;
        }
        if (!ySnapped) {
          snappedTop = (workspace.top || 0) + gridSnap.top;
        }
      }

      // Apply snapped position
      target.set({
        left: snappedLeft,
        top: snappedTop,
      });

      // Update snap lines
      onSnapLinesChange(snapLines);
    };

    const handleObjectScaling = (e: fabric.IEvent) => {
      const target = e.target;
      if (!target || target.name === "clip") return;

      // We can add scaling-specific snapping here if needed
      // For now, just clear snap lines during scaling
      onSnapLinesChange([]);
    };

    const handleObjectRotating = (e: fabric.IEvent) => {
      const target = e.target;
      if (!target || target.name === "clip") return;

      if (snappingOptions.snapRotation) {
        const currentAngle = target.angle || 0;
        const snappedAngle = roundRotationAngle(currentAngle);

        if (Math.abs(currentAngle - snappedAngle) < 3) {
          target.set({ angle: snappedAngle });
        }
      }

      // Clear snap lines during rotation
      onSnapLinesChange([]);
    };

    const handleObjectModified = () => {
      // Clear snap lines when object modification is complete
      onSnapLinesChange([]);
    };

    const handleSelectionCleared = () => {
      // Clear snap lines when selection is cleared
      onSnapLinesChange([]);
    };

    // Add event listeners
    canvas.on("object:moving", handleObjectMoving);
    canvas.on("object:scaling", handleObjectScaling);
    canvas.on("object:rotating", handleObjectRotating);
    canvas.on("object:modified", handleObjectModified);
    canvas.on("selection:cleared", handleSelectionCleared);

    // Cleanup
    return () => {
      canvas.off("object:moving", handleObjectMoving);
      canvas.off("object:scaling", handleObjectScaling);
      canvas.off("object:rotating", handleObjectRotating);
      canvas.off("object:modified", handleObjectModified);
      canvas.off("selection:cleared", handleSelectionCleared);
    };
  }, [canvas, snappingOptions, onSnapLinesChange]);
};
