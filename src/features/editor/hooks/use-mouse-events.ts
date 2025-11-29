import { fabric } from "fabric";
import { useEffect, useRef } from "react";

interface UseMouseEventsProps {
  canvas: fabric.Canvas | null;
}

export const useMouseEvents = ({ canvas }: UseMouseEventsProps) => {
  const isPanning = useRef(false);
  const lastPosX = useRef(0);
  const lastPosY = useRef(0);

  useEffect(() => {
    if (!canvas) return;

    // Get the canvas DOM element
    const canvasElement = canvas.getElement();
    const upperCanvasElement = canvas.upperCanvasEl;

    const handleMouseWheel = (opt: fabric.IEvent) => {
      const event = opt.e as WheelEvent;

      // Prevent default scroll behavior
      event.preventDefault();
      event.stopPropagation();

      const delta = event.deltaY;
      let zoom = canvas.getZoom();

      // Calculate new zoom level
      // Negative delta = scroll up = zoom in
      // Positive delta = scroll down = zoom out
      zoom *= 0.999 ** delta;

      // Clamp zoom between 0.01 (1%) and 1.0 (100%)
      zoom = Math.min(Math.max(zoom, 0.01), 1.0);

      // Zoom to cursor position
      const point = new fabric.Point(event.offsetX, event.offsetY);
      canvas.zoomToPoint(point, zoom);

      canvas.requestRenderAll();
    };

    // Use native DOM events for middle mouse button (more reliable)
    const handleMouseDown = (event: MouseEvent) => {
      // Check for middle mouse button (button === 1)
      if (event.button === 1) {
        event.preventDefault();
        isPanning.current = true;
        lastPosX.current = event.clientX;
        lastPosY.current = event.clientY;

        // Change cursor to grabbing
        if (upperCanvasElement) {
          upperCanvasElement.style.cursor = 'grabbing';
        }
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!isPanning.current) return;

      event.preventDefault();
      const vpt = canvas.viewportTransform;

      if (!vpt) return;

      // Calculate mouse movement delta
      const deltaX = event.clientX - lastPosX.current;
      const deltaY = event.clientY - lastPosY.current;

      // Update viewport transform for panning
      vpt[4] += deltaX;
      vpt[5] += deltaY;

      canvas.setViewportTransform(vpt);
      canvas.requestRenderAll();

      // Update last position
      lastPosX.current = event.clientX;
      lastPosY.current = event.clientY;
    };

    const handleMouseUp = (event: MouseEvent) => {
      // Reset panning state on middle mouse button release
      if (event.button === 1) {
        isPanning.current = false;
        if (upperCanvasElement) {
          upperCanvasElement.style.cursor = 'default';
        }
      }
    };

    // Prevent context menu on middle mouse button
    const handleContextMenu = (event: MouseEvent) => {
      if (event.button === 1 || isPanning.current) {
        event.preventDefault();
      }
    };

    // Register event listeners
    canvas.on('mouse:wheel', handleMouseWheel);

    // Add native DOM listeners for panning (more reliable for middle button)
    upperCanvasElement.addEventListener('mousedown', handleMouseDown);
    upperCanvasElement.addEventListener('mousemove', handleMouseMove);
    upperCanvasElement.addEventListener('mouseup', handleMouseUp);
    upperCanvasElement.addEventListener('contextmenu', handleContextMenu);

    // Also listen on window for mouseup (in case mouse leaves canvas while panning)
    window.addEventListener('mouseup', handleMouseUp);

    // Cleanup
    return () => {
      canvas.off('mouse:wheel', handleMouseWheel);
      upperCanvasElement.removeEventListener('mousedown', handleMouseDown);
      upperCanvasElement.removeEventListener('mousemove', handleMouseMove);
      upperCanvasElement.removeEventListener('mouseup', handleMouseUp);
      upperCanvasElement.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [canvas]);
};
