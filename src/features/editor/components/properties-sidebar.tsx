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

  // Store INITIAL frame scale when object is selected (not previous values)
  const initialFrameScaleRef = useRef<{ scaleX: number; scaleY: number }>({ scaleX: 1, scaleY: 1 });

  // Store INITIAL image state when object is selected (for imageFrame objects)
  // For single frames: stores one entry. For groups: stores entry for each imageFrame child
  const initialImageStatesRef = useRef<Map<string, { offsetX: number; offsetY: number; customScaleX: number }>>(new Map());

  // Track previous scale for non-imageFrame objects (legacy behavior)
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

  // Get frame's absolute position (handles grouped objects)
  const getFrameAbsolutePosition = (frame: any, canvas: any) => {
    const activeObject = canvas.getActiveObject();

    // Check if frame is inside an ActiveSelection or Group
    if (activeObject && (activeObject.type === "activeSelection" || activeObject.type === "group")) {
      const group = activeObject;
      const groupCenter = group.getCenterPoint();
      const groupScaleX = group.scaleX || 1;
      const groupScaleY = group.scaleY || 1;

      // Frame's left/top are relative to group center
      return {
        left: groupCenter.x + (frame.left || 0) * groupScaleX,
        top: groupCenter.y + (frame.top || 0) * groupScaleY,
        effectiveScaleX: (frame.scaleX || 1) * groupScaleX,
        effectiveScaleY: (frame.scaleY || 1) * groupScaleY,
      };
    }

    // Single object - use absolute position directly
    return {
      left: frame.left || 0,
      top: frame.top || 0,
      effectiveScaleX: frame.scaleX || 1,
      effectiveScaleY: frame.scaleY || 1,
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

      // Store initial scale for delta calculations (legacy)
      previousScaleRef.current = { scaleX, scaleY };

      // Get effective scale (includes group scale if applicable)
      let effectiveScaleX = scaleX;
      let effectiveScaleY = scaleY;

      if (editor?.canvas) {
        const activeObject = editor.canvas.getActiveObject();
        if (activeObject && (activeObject.type === "activeSelection" || activeObject.type === "group")) {
          effectiveScaleX *= (activeObject.scaleX || 1);
          effectiveScaleY *= (activeObject.scaleY || 1);
        }
      }

      // Store initial frame scale for imageFrame objects (with effective scale)
      initialFrameScaleRef.current = { scaleX: effectiveScaleX, scaleY: effectiveScaleY };

      // Clear previous initial states
      initialImageStatesRef.current.clear();

      // Helper to store initial state for a linked image
      const storeImageState = (frame: any) => {
        const linkedImageId = frame.linkedImageId;
        if (!linkedImageId || !editor?.canvas) return;

        const objects = editor.canvas.getObjects();
        const image = objects.find(
          (obj: any) => obj.type === "framedImage" && obj.id === linkedImageId
        ) as any;

        if (image) {
          initialImageStatesRef.current.set(linkedImageId, {
            offsetX: image.offsetX,
            offsetY: image.offsetY,
            customScaleX: image.customScaleX,
          });
        }
      };

      // Store initial state based on selection type
      if (editor?.canvas) {
        const activeObject = editor.canvas.getActiveObject();

        if (activeObject?.type === "group") {
          // Native group - iterate through children
          (activeObject as fabric.Group).forEachObject((obj: any) => {
            if (obj.type === "imageFrame") {
              storeImageState(obj);
            }
          });
        } else if (activeObject?.type === "activeSelection") {
          // ActiveSelection - iterate through selected objects
          editor.canvas.getActiveObjects().forEach((obj: any) => {
            if (obj.type === "imageFrame") {
              storeImageState(obj);
            }
          });
        } else if (selectedObject.type === "imageFrame") {
          // Single imageFrame
          storeImageState(selectedObject);
        }
      }
    }
  }, [selectedObject, editor]);

  const onClose = () => {
    onChangeActiveTool("select");
  };

  // Helper to sync imageFrame with its linked FramedImage
  // positionOnly: true for X/Y changes (just move), false for width/height changes (recalculate scale)
  const syncFrameImage = (frame: any, canvas: any, positionOnly: boolean = false) => {
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

    // Get absolute position (handles grouped objects)
    const absPos = getFrameAbsolutePosition(frame, canvas);

    if (positionOnly) {
      // For position-only changes, just move the image with the frame
      // Use current offset values - don't recalculate scale
      image.set({
        left: absPos.left + image.offsetX,
        top: absPos.top + image.offsetY,
      });
    } else {
      // For size changes, recalculate based on initial values
      // This prevents corruption when typing intermediate values like "6" -> "60" -> "605"
      const initialState = initialImageStatesRef.current.get(linkedImageId);
      if (!initialState) return;

      const scaleRatioX = absPos.effectiveScaleX / initialFrameScaleRef.current.scaleX;
      const scaleRatioY = absPos.effectiveScaleY / initialFrameScaleRef.current.scaleY;

      // Use the MAX ratio to maintain cover behavior (no stretching)
      const uniformScaleRatio = Math.max(scaleRatioX, scaleRatioY);

      // Calculate new values from INITIAL state (not current state)
      const newOffsetX = initialState.offsetX * scaleRatioX;
      const newOffsetY = initialState.offsetY * scaleRatioY;
      const newScale = initialState.customScaleX * uniformScaleRatio;

      // Update the stored offsets and custom scale
      image.offsetX = newOffsetX;
      image.offsetY = newOffsetY;
      image.customScaleX = newScale;
      image.customScaleY = newScale;

      // Apply the scaled position and uniform scale
      image.set({
        left: absPos.left + newOffsetX,
        top: absPos.top + newOffsetY,
        scaleX: newScale,
        scaleY: newScale,
      });
    }

    // Create temporary frame object with absolute values for clipping
    const tempFrame = {
      left: absPos.left,
      top: absPos.top,
      width: frame.width,
      height: frame.height,
      scaleX: absPos.effectiveScaleX,
      scaleY: absPos.effectiveScaleY,
    };

    // Update clipPath to match new frame size
    image.applyFrameClip(tempFrame);
    image.setCoords();

    // Update the frame's previous transform values
    if (frame.updatePreviousTransform) {
      frame.updatePreviousTransform();
    }
  };

  // Helper to sync imageFrame with its linked FramedImage for NATIVE GROUPS
  // Uses group.getCenterPoint() to calculate absolute position (matching arrow key behavior)
  const syncFrameImageForGroup = (
    frame: any,
    group: fabric.Group,
    canvas: any,
    positionOnly: boolean = false
  ) => {
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

    // Calculate absolute position like arrow keys do
    const groupCenter = group.getCenterPoint();
    const groupScaleX = group.scaleX || 1;
    const groupScaleY = group.scaleY || 1;

    const absoluteLeft = groupCenter.x + (frame.left || 0) * groupScaleX;
    const absoluteTop = groupCenter.y + (frame.top || 0) * groupScaleY;
    const effectiveScaleX = (frame.scaleX || 1) * groupScaleX;
    const effectiveScaleY = (frame.scaleY || 1) * groupScaleY;

    if (positionOnly) {
      // For position-only changes, just move the image with the frame
      image.set({
        left: absoluteLeft + image.offsetX,
        top: absoluteTop + image.offsetY,
      });
    } else {
      // For size changes, recalculate based on initial values
      const initialState = initialImageStatesRef.current.get(linkedImageId);
      if (!initialState) return;

      const scaleRatioX = effectiveScaleX / initialFrameScaleRef.current.scaleX;
      const scaleRatioY = effectiveScaleY / initialFrameScaleRef.current.scaleY;
      const uniformScaleRatio = Math.max(scaleRatioX, scaleRatioY);

      const newOffsetX = initialState.offsetX * scaleRatioX;
      const newOffsetY = initialState.offsetY * scaleRatioY;
      const newScale = initialState.customScaleX * uniformScaleRatio;

      image.offsetX = newOffsetX;
      image.offsetY = newOffsetY;
      image.customScaleX = newScale;
      image.customScaleY = newScale;

      image.set({
        left: absoluteLeft + newOffsetX,
        top: absoluteTop + newOffsetY,
        scaleX: newScale,
        scaleY: newScale,
      });
    }

    // Create temporary frame object with absolute values for clipping
    const tempFrame = {
      left: absoluteLeft,
      top: absoluteTop,
      width: frame.width,
      height: frame.height,
      scaleX: effectiveScaleX,
      scaleY: effectiveScaleY,
    };

    image.applyFrameClip(tempFrame);
    image.setCoords();

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
    const activeObject = editor.canvas.getActiveObject();

    // Check if we're dealing with a group/selection (multiple objects)
    if (activeObject && (activeObject.type === "activeSelection" || activeObject.type === "group")) {
      const group = activeObject as any;
      const originX = group.originX || "center";
      const originY = group.originY || "center";
      const groupWidth = (group.width || 0) * (group.scaleX || 1);
      const groupHeight = (group.height || 0) * (group.scaleY || 1);

      if (property === "x") {
        // User typed top-left X relative to workspace
        // Convert to group's position (groups typically use center origin)
        let absoluteLeft = numValue + workspaceOffset.left;
        if (originX === "center") {
          absoluteLeft += groupWidth / 2;
        }
        group.set({ left: absoluteLeft });
      } else if (property === "y") {
        let absoluteTop = numValue + workspaceOffset.top;
        if (originY === "center") {
          absoluteTop += groupHeight / 2;
        }
        group.set({ top: absoluteTop });
      } else if (property === "width") {
        const baseWidth = group.width || 1;
        const newScaleX = numValue / baseWidth;
        group.set({ scaleX: newScaleX });
      } else if (property === "height") {
        const baseHeight = group.height || 1;
        const newScaleY = numValue / baseHeight;
        group.set({ scaleY: newScaleY });
      }

      group.setCoords();

      // Sync all imageFrames within the group/selection
      // positionOnly: true for X/Y changes, false for width/height
      const positionOnly = property === "x" || property === "y";

      if (activeObject.type === "group") {
        // Native fabric.Group - use forEachObject to access children
        // getActiveObjects() returns [group] for native groups, not the children!
        (activeObject as fabric.Group).forEachObject((obj: any) => {
          if (obj.type === "imageFrame") {
            syncFrameImageForGroup(obj, activeObject as fabric.Group, editor.canvas, positionOnly);
          }
        });
      } else {
        // ActiveSelection - getActiveObjects() works here
        const objects = editor.canvas.getActiveObjects();
        objects.forEach((obj: any) => {
          if (obj.type === "imageFrame") {
            syncFrameImage(obj, editor.canvas, positionOnly);
          }
        });
      }
    } else {
      // Single object - modify directly
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

          // Sync linked image position for imageFrame (position only)
          if (obj.type === "imageFrame") {
            syncFrameImage(obj, editor.canvas, true);
          }
        } else if (property === "y") {
          // Convert workspace-relative Y to absolute canvas position
          let absoluteTop = numValue + workspaceOffset.top;
          // If origin is center, add half height to convert from top-left to center
          if (originY === "center") {
            absoluteTop += height / 2;
          }
          obj.set({ top: absoluteTop });

          // Sync linked image position for imageFrame (position only)
          if (obj.type === "imageFrame") {
            syncFrameImage(obj, editor.canvas, true);
          }
        } else if (property === "width") {
          const baseWidth = obj.get("width") || 1;
          const newScaleX = numValue / baseWidth;
          obj.set({ scaleX: newScaleX });

          // For imageFrame, sync the linked image with cover behavior (scale change)
          if (obj.type === "imageFrame") {
            syncFrameImage(obj, editor.canvas, false);
          }
        } else if (property === "height") {
          const baseHeight = obj.get("height") || 1;
          const newScaleY = numValue / baseHeight;
          obj.set({ scaleY: newScaleY });

          // For imageFrame, sync the linked image with cover behavior (scale change)
          if (obj.type === "imageFrame") {
            syncFrameImage(obj, editor.canvas, false);
          }
        }
        obj.setCoords();
      });
    }

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
