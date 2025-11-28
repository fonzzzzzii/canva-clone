import { useEffect, useMemo, useState, useRef } from "react";

import { ActiveTool, Editor } from "@/features/editor/types";
import { ToolSidebarClose } from "@/features/editor/components/tool-sidebar-close";
import { ToolSidebarHeader } from "@/features/editor/components/tool-sidebar-header";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

interface PropertiesSidebarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
}

export const PropertiesSidebar = ({
  editor,
  activeTool,
  onChangeActiveTool,
}: PropertiesSidebarProps) => {
  const selectedObject = useMemo(
    () => editor?.selectedObjects[0],
    [editor?.selectedObjects]
  );

  const [dimensions, setDimensions] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  // Store previous scale values for delta calculations
  const previousScaleRef = useRef<{ scaleX: number; scaleY: number }>({ scaleX: 1, scaleY: 1 });

  // Store the current workspace offset for the page the object is on
  const currentWorkspaceOffsetRef = useRef<{ left: number; top: number }>({ left: 0, top: 0 });

  // Find the workspace (page) that contains a given object
  const getWorkspaceForObject = (obj: fabric.Object) => {
    if (!editor?.canvas) return null;

    // Get all workspaces (pages)
    const workspaces = editor.canvas
      .getObjects()
      .filter((o: any) => o.name === "clip" || o.name?.startsWith("clip-page-"));

    if (workspaces.length === 0) return null;
    if (workspaces.length === 1) return workspaces[0];

    // Find which workspace contains this object's center
    // Use canvas coordinates (not screen coordinates from getBoundingRect)
    const objCenter = obj.getCenterPoint();

    for (const workspace of workspaces) {
      // Use workspace's actual canvas coordinates
      const wsLeft = workspace.left || 0;
      const wsTop = workspace.top || 0;
      const wsWidth = (workspace.width || 0) * (workspace.scaleX || 1);
      const wsHeight = (workspace.height || 0) * (workspace.scaleY || 1);

      if (
        objCenter.x >= wsLeft &&
        objCenter.x <= wsLeft + wsWidth &&
        objCenter.y >= wsTop &&
        objCenter.y <= wsTop + wsHeight
      ) {
        return workspace;
      }
    }

    // Fallback to first workspace
    return workspaces[0];
  };

  // Get workspace position for relative coordinates
  const getWorkspaceOffset = (obj?: fabric.Object) => {
    const workspace = obj ? getWorkspaceForObject(obj) : editor?.getWorkspace();
    if (!workspace) return { left: 0, top: 0 };
    return {
      left: workspace.left || 0,
      top: workspace.top || 0,
    };
  };

  // Update local state when selection changes
  useEffect(() => {
    if (selectedObject) {
      // Always recalculate which page the object is on based on its current position
      // This ensures the coordinate system switches as soon as the object moves to a new page
      const workspaceOffset = getWorkspaceOffset(selectedObject);
      currentWorkspaceOffsetRef.current = workspaceOffset;

      const left = selectedObject.get("left") || 0;
      const top = selectedObject.get("top") || 0;
      const scaleX = selectedObject.get("scaleX") || 1;
      const scaleY = selectedObject.get("scaleY") || 1;
      const width = (selectedObject.get("width") || 0) * scaleX;
      const height = (selectedObject.get("height") || 0) * scaleY;
      const originX = selectedObject.get("originX") || "left";
      const originY = selectedObject.get("originY") || "top";

      // Calculate top-left corner position (accounting for object origin)
      let displayLeft = left - workspaceOffset.left;
      let displayTop = top - workspaceOffset.top;

      // If origin is center, subtract half dimensions to get top-left
      if (originX === "center") {
        displayLeft -= width / 2;
      }
      if (originY === "center") {
        displayTop -= height / 2;
      }

      setDimensions({
        x: Math.round(displayLeft),
        y: Math.round(displayTop),
        width: Math.round(width),
        height: Math.round(height),
      });

      // Store initial scale for delta calculations
      previousScaleRef.current = { scaleX, scaleY };
    }
  }, [selectedObject, editor]);

  const onClose = () => {
    onChangeActiveTool("select");
  };

  // Helper to sync imageFrame with its linked FramedImage
  const syncFrameImage = (frame: any, canvas: any) => {
    const linkedImageId = frame.linkedImageId;
    if (!linkedImageId) return;

    // Find the linked FramedImage
    const objects = canvas.getObjects();
    let image: any = null;
    for (const obj of objects) {
      if (obj.type === "framedImage" && obj.id === linkedImageId) {
        image = obj;
        break;
      }
    }

    if (!image || image.isInEditMode) return;

    const frameScaleX = frame.scaleX || 1;
    const frameScaleY = frame.scaleY || 1;
    const prevScaleX = previousScaleRef.current.scaleX;
    const prevScaleY = previousScaleRef.current.scaleY;

    // Calculate the scale ratio (delta from previous)
    const scaleRatioX = frameScaleX / prevScaleX;
    const scaleRatioY = frameScaleY / prevScaleY;

    // Use the MAX ratio to maintain cover behavior (no stretching)
    const uniformScaleRatio = Math.max(scaleRatioX, scaleRatioY);

    // Apply uniform scale to maintain aspect ratio
    const newOffsetX = image.offsetX * scaleRatioX;
    const newOffsetY = image.offsetY * scaleRatioY;
    const newScale = image.customScaleX * uniformScaleRatio;

    // Update the stored offsets and custom scale
    image.offsetX = newOffsetX;
    image.offsetY = newOffsetY;
    image.customScaleX = newScale;
    image.customScaleY = newScale;

    // Apply the scaled position and uniform scale
    image.set({
      left: (frame.left || 0) + newOffsetX,
      top: (frame.top || 0) + newOffsetY,
      scaleX: newScale,
      scaleY: newScale,
    });

    // Update clipPath to match new frame size
    image.applyFrameClip(frame);
    image.setCoords();

    // Update the frame's previous transform values
    if (frame.updatePreviousTransform) {
      frame.updatePreviousTransform();
    }
  };

  const handleChange = (property: "x" | "y" | "width" | "height", value: string) => {
    const numValue = parseFloat(value) || 0;

    setDimensions((prev) => ({
      ...prev,
      [property]: numValue,
    }));

    if (!editor?.canvas) return;

    // Use the stored workspace offset (the page the object was on when selected)
    const workspaceOffset = currentWorkspaceOffsetRef.current;

    editor.canvas.getActiveObjects().forEach((obj) => {
      const originX = obj.get("originX") || "left";
      const originY = obj.get("originY") || "top";
      const scaleX = obj.get("scaleX") || 1;
      const scaleY = obj.get("scaleY") || 1;
      const width = (obj.get("width") || 0) * scaleX;
      const height = (obj.get("height") || 0) * scaleY;

      if (property === "x") {
        // Convert workspace-relative X to absolute canvas position
        let absoluteLeft = numValue + workspaceOffset.left;
        // If origin is center, add half width to convert from top-left to center
        if (originX === "center") {
          absoluteLeft += width / 2;
        }
        obj.set({ left: absoluteLeft });

        // Sync linked image position for imageFrame
        if (obj.type === "imageFrame") {
          syncFrameImage(obj, editor.canvas);
        }
      } else if (property === "y") {
        // Convert workspace-relative Y to absolute canvas position
        let absoluteTop = numValue + workspaceOffset.top;
        // If origin is center, add half height to convert from top-left to center
        if (originY === "center") {
          absoluteTop += height / 2;
        }
        obj.set({ top: absoluteTop });

        // Sync linked image position for imageFrame
        if (obj.type === "imageFrame") {
          syncFrameImage(obj, editor.canvas);
        }
      } else if (property === "width") {
        const baseWidth = obj.get("width") || 1;
        const newScaleX = numValue / baseWidth;
        obj.set({ scaleX: newScaleX });

        // For imageFrame, sync the linked image with cover behavior
        if (obj.type === "imageFrame") {
          syncFrameImage(obj, editor.canvas);
          // Update the previous scale ref after syncing
          previousScaleRef.current.scaleX = newScaleX;
        }
      } else if (property === "height") {
        const baseHeight = obj.get("height") || 1;
        const newScaleY = numValue / baseHeight;
        obj.set({ scaleY: newScaleY });

        // For imageFrame, sync the linked image with cover behavior
        if (obj.type === "imageFrame") {
          syncFrameImage(obj, editor.canvas);
          // Update the previous scale ref after syncing
          previousScaleRef.current.scaleY = newScaleY;
        }
      }
      obj.setCoords();
    });

    editor.canvas.requestRenderAll();
  };

  return (
    <aside
      className={cn(
        "bg-white relative border-r z-[40] w-[360px] h-full flex flex-col",
        activeTool === "properties" ? "visible" : "hidden"
      )}
    >
      <ToolSidebarHeader
        title="Properties"
        description="Modify object position and dimensions"
      />
      <ScrollArea>
        <div className="p-4 space-y-4 border-b">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prop-x">X</Label>
              <Input
                id="prop-x"
                type="number"
                value={dimensions.x}
                onChange={(e) => handleChange("x", e.target.value)}
                disabled={!selectedObject}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prop-y">Y</Label>
              <Input
                id="prop-y"
                type="number"
                value={dimensions.y}
                onChange={(e) => handleChange("y", e.target.value)}
                disabled={!selectedObject}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prop-width">Width</Label>
              <Input
                id="prop-width"
                type="number"
                value={dimensions.width}
                onChange={(e) => handleChange("width", e.target.value)}
                disabled={!selectedObject}
                min={1}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prop-height">Height</Label>
              <Input
                id="prop-height"
                type="number"
                value={dimensions.height}
                onChange={(e) => handleChange("height", e.target.value)}
                disabled={!selectedObject}
                min={1}
              />
            </div>
          </div>
        </div>
      </ScrollArea>
      <ToolSidebarClose onClick={onClose} />
    </aside>
  );
};
