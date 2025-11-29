import { fabric } from "fabric";
import { useCallback, useEffect } from "react";

interface UseAutoResizeProps {
  canvas: fabric.Canvas | null;
  container: HTMLDivElement | null;
}

export const useAutoResize = ({ canvas, container }: UseAutoResizeProps) => {
  // Resize canvas without changing zoom level or viewport position
  const resizeCanvas = useCallback(() => {
    if (!canvas || !container) return;

    const width = container.offsetWidth;
    const height = container.offsetHeight;

    const oldWidth = canvas.getWidth();
    const oldHeight = canvas.getHeight();

    canvas.setWidth(width);
    canvas.setHeight(height);

    // Adjust viewport to keep the same center point visible
    const viewportTransform = canvas.viewportTransform;
    if (viewportTransform) {
      // Calculate how much the center shifted
      const deltaX = (width - oldWidth) / 2;
      const deltaY = (height - oldHeight) / 2;

      // Adjust the viewport translation to compensate
      viewportTransform[4] += deltaX;
      viewportTransform[5] += deltaY;

      canvas.setViewportTransform(viewportTransform);
    }

    canvas.requestRenderAll();
  }, [canvas, container]);

  const autoZoom = useCallback(() => {
    if (!canvas || !container) return;

    const width = container.offsetWidth;
    const height = container.offsetHeight;

    canvas.setWidth(width);
    canvas.setHeight(height);

    const center = canvas.getCenter();

    const zoomRatio = 0.85;

    // Find all workspace objects (single or multi-page)
    const workspaces = canvas
      .getObjects()
      .filter((object) => object.name === "clip" || object.name?.startsWith("clip-page-"));

    if (workspaces.length === 0) return;

    // For single page, use existing logic
    if (workspaces.length === 1) {
      const localWorkspace = workspaces[0];

      // @ts-ignore
      const scale = fabric.util.findScaleToFit(localWorkspace, {
        width: width,
        height: height,
      });

      const zoom = zoomRatio * scale;

      canvas.setViewportTransform(fabric.iMatrix.concat());
      canvas.zoomToPoint(new fabric.Point(center.left, center.top), zoom);

      const workspaceCenter = localWorkspace.getCenterPoint();
      const viewportTransform = canvas.viewportTransform;

      if (
        canvas.width === undefined ||
        canvas.height === undefined ||
        !viewportTransform
      ) {
        return;
      }

      viewportTransform[4] = canvas.width / 2 - workspaceCenter.x * viewportTransform[0];
      viewportTransform[5] = canvas.height / 2 - workspaceCenter.y * viewportTransform[3];

      canvas.setViewportTransform(viewportTransform);

      localWorkspace.clone((cloned: fabric.Rect) => {
        canvas.clipPath = cloned;
        canvas.requestRenderAll();
      });
    } else {
      // For multi-page, calculate bounding box of all workspaces
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      workspaces.forEach((workspace) => {
        const bounds = workspace.getBoundingRect();
        minX = Math.min(minX, bounds.left);
        minY = Math.min(minY, bounds.top);
        maxX = Math.max(maxX, bounds.left + bounds.width);
        maxY = Math.max(maxY, bounds.top + bounds.height);
      });

      const boundingBoxWidth = maxX - minX;
      const boundingBoxHeight = maxY - minY;
      const centerX = minX + boundingBoxWidth / 2;
      const centerY = minY + boundingBoxHeight / 2;

      // Calculate scale to fit all workspaces
      const scaleX = width / boundingBoxWidth;
      const scaleY = height / boundingBoxHeight;
      const scale = Math.min(scaleX, scaleY);
      const zoom = zoomRatio * scale;

      canvas.setViewportTransform(fabric.iMatrix.concat());
      canvas.zoomToPoint(new fabric.Point(center.left, center.top), zoom);

      const viewportTransform = canvas.viewportTransform;

      if (
        canvas.width === undefined ||
        canvas.height === undefined ||
        !viewportTransform
      ) {
        return;
      }

      // Center the view on all workspaces
      viewportTransform[4] = canvas.width / 2 - centerX * viewportTransform[0];
      viewportTransform[5] = canvas.height / 2 - centerY * viewportTransform[3];

      canvas.setViewportTransform(viewportTransform);

      // For multi-page, don't set a global clipPath
      canvas.clipPath = undefined;
      canvas.requestRenderAll();
    }
  }, [canvas, container]);

  useEffect(() => {
    let resizeObserver: ResizeObserver | null = null;
    let lastWidth = 0;
    let lastHeight = 0;

    if (canvas && container) {
      // Get initial size
      lastWidth = container.offsetWidth;
      lastHeight = container.offsetHeight;

      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        const newWidth = Math.round(entry.contentRect.width);
        const newHeight = Math.round(entry.contentRect.height);

        // Only trigger autoZoom on significant size changes (more than 20px)
        // This prevents oscillation from scrollbar appearing/disappearing
        const widthChange = Math.abs(newWidth - lastWidth);
        const heightChange = Math.abs(newHeight - lastHeight);

        if (widthChange > 20 || heightChange > 20) {
          lastWidth = newWidth;
          lastHeight = newHeight;
          // Resize canvas but maintain current zoom level and viewport position
          resizeCanvas();
        }
      });

      resizeObserver.observe(container);
    }

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [canvas, container, resizeCanvas]);

  return { autoZoom };
};
