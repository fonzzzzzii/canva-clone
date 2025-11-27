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

      // Clamp zoom between 0.2 (20%) and 1.0 (100%)
      zoom = Math.min(Math.max(zoom, 0.2), 1.0);

      // Zoom to cursor position
      const point = new fabric.Point(event.offsetX, event.offsetY);
      canvas.zoomToPoint(point, zoom);

      canvas.requestRenderAll();
    };

    const handleMouseDown = (opt: fabric.IEvent) => {
      const event = opt.e as MouseEvent;

      // Check for middle mouse button (button === 1)
      if (event.button === 1) {
        event.preventDefault();
        isPanning.current = true;
        lastPosX.current = event.clientX;
        lastPosY.current = event.clientY;

        // Change cursor to grab/grabbing
        canvas.defaultCursor = 'grabbing';
        canvas.setCursor('grabbing');
      }
    };

    const handleMouseMove = (opt: fabric.IEvent) => {
      if (!isPanning.current) return;

      const event = opt.e as MouseEvent;
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

    const handleMouseUp = (opt: fabric.IEvent) => {
      const event = opt.e as MouseEvent;

      // Reset panning state on middle mouse button release
      if (event.button === 1) {
        isPanning.current = false;
        canvas.defaultCursor = 'default';
        canvas.setCursor('default');
      }
    };

    // Register event listeners
    canvas.on('mouse:wheel', handleMouseWheel);
    canvas.on('mouse:down', handleMouseDown);
    canvas.on('mouse:move', handleMouseMove);
    canvas.on('mouse:up', handleMouseUp);

    // Cleanup
    return () => {
      canvas.off('mouse:wheel', handleMouseWheel);
      canvas.off('mouse:down', handleMouseDown);
      canvas.off('mouse:move', handleMouseMove);
      canvas.off('mouse:up', handleMouseUp);
    };
  }, [canvas]);
};
