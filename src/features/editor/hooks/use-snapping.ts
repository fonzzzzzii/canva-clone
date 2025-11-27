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
  save: (skip?: boolean) => void;
}

export const useSnapping = ({
  canvas,
  snappingOptions,
  onSnapLinesChange,
  save,
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

      // Clear snap lines during scaling for smooth interaction
      onSnapLinesChange([]);

      // Apply scaling snap while dragging if snap to grid is enabled
      if (snappingOptions.snapToGrid) {
        const currentWidth = target.getScaledWidth();
        const currentHeight = target.getScaledHeight();

        const snappedWidth = Math.round(currentWidth / snappingOptions.snapGridSize) * snappingOptions.snapGridSize;
        const snappedHeight = Math.round(currentHeight / snappingOptions.snapGridSize) * snappingOptions.snapGridSize;

        const widthDiff = Math.abs(currentWidth - snappedWidth);
        const heightDiff = Math.abs(currentHeight - snappedHeight);

        // Determine origin based on which corner is being dragged
        // @ts-ignore - __corner exists during scaling
        const corner = target.__corner;

        let originX: 'left' | 'center' | 'right' = 'left';
        let originY: 'top' | 'center' | 'bottom' = 'top';

        // Map corner to the opposite origin point (the point that should stay fixed)
        if (corner) {
          if (corner.includes('l')) {
            originX = 'right'; // Left handle - fix right edge
          } else if (corner.includes('r')) {
            originX = 'left'; // Right handle - fix left edge
          } else {
            originX = 'center'; // Middle handles
          }

          if (corner.includes('t')) {
            originY = 'bottom'; // Top handle - fix bottom edge
          } else if (corner.includes('b')) {
            originY = 'top'; // Bottom handle - fix top edge
          } else {
            originY = 'center'; // Middle handles
          }
        }

        // Get the position of the origin point before scaling
        const originPoint = target.getPointByOrigin(originX, originY);

        // Apply scale adjustments only if within threshold
        if (widthDiff < snappingOptions.snapThreshold) {
          const scaleAdjustmentX = snappedWidth / currentWidth;
          target.scaleX = (target.scaleX || 1) * scaleAdjustmentX;
        }

        if (heightDiff < snappingOptions.snapThreshold) {
          const scaleAdjustmentY = snappedHeight / currentHeight;
          target.scaleY = (target.scaleY || 1) * scaleAdjustmentY;
        }

        // Restore the origin point position to prevent sliding
        target.setPositionByOrigin(originPoint, originX, originY);
        target.setCoords();
      }
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

    const handleObjectModified = (e: fabric.IEvent) => {
      // Clear snap lines when object modification is complete
      onSnapLinesChange([]);

      // Save canvas state
      save();
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
  }, [canvas, snappingOptions, onSnapLinesChange, save]);
};
