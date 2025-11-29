import { useEffect, useMemo, useState } from "react";
import { fabric } from "fabric";

import {
  ActiveTool,
  Editor,
} from "@/features/editor/types";
import { ToolSidebarClose } from "@/features/editor/components/tool-sidebar-close";
import { ToolSidebarHeader } from "@/features/editor/components/tool-sidebar-header";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { IFrame, isFrameType } from "@/features/editor/objects/image-frame";
import { FramedImage } from "@/features/editor/objects/framed-image";

interface ImageFrameSidebarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
}

export const ImageFrameSidebar = ({
  editor,
  activeTool,
  onChangeActiveTool,
}: ImageFrameSidebarProps) => {
  const selectedObject = useMemo(() => editor?.selectedObjects[0], [editor?.selectedObjects]);

  // Check if selected object is any frame type or FramedImage
  const frame = useMemo(() => {
    if (isFrameType(selectedObject?.type)) {
      return selectedObject as unknown as IFrame;
    }
    return null;
  }, [selectedObject]);

  const framedImage = useMemo(() => {
    if (selectedObject?.type === "framedImage") {
      return selectedObject as FramedImage;
    }
    return null;
  }, [selectedObject]);

  const [frameWidth, setFrameWidth] = useState(400);
  const [frameHeight, setFrameHeight] = useState(400);
  const isCircle = frame?.type === "circleFrame";

  // Helper to get frame dimensions (handles circles vs other shapes)
  const getFrameDimensions = (f: IFrame): { width: number; height: number } => {
    if (f.type === "circleFrame") {
      const radius = ((f as any).radius || 200) * (f.scaleX || 1);
      return { width: radius * 2, height: radius * 2 };
    }
    return {
      width: ((f as any).width || 400) * (f.scaleX || 1),
      height: ((f as any).height || 400) * (f.scaleY || 1),
    };
  };

  // Update state when selection changes
  useEffect(() => {
    if (frame) {
      const dims = getFrameDimensions(frame);
      setFrameWidth(dims.width);
      setFrameHeight(dims.height);
    } else if (framedImage && editor?.canvas) {
      const linkedFrame = framedImage.getLinkedFrame(editor.canvas);
      if (linkedFrame) {
        const dims = getFrameDimensions(linkedFrame);
        setFrameWidth(dims.width);
        setFrameHeight(dims.height);
      }
    }
  }, [frame, framedImage, editor?.canvas]);

  const onClose = () => {
    onChangeActiveTool("select");
  };

  const handleFrameWidthChange = (value: string) => {
    const width = parseInt(value) || 400;
    setFrameWidth(width);

    if (frame && editor?.canvas) {
      if (isCircle) {
        // For circles, set radius (width = diameter)
        (frame as any).set({
          radius: width / 2,
          scaleX: 1,
          scaleY: 1,
        });
        setFrameHeight(width); // Keep diameter equal
      } else {
        // Reset scale and set new width
        (frame as any).set({
          width: width,
          scaleX: 1,
        });
      }
      (frame as fabric.Object).setCoords();

      // Update linked image's clipPath
      const linkedImage = frame.getLinkedImage(editor.canvas) as FramedImage | null;
      if (linkedImage) {
        linkedImage.applyFrameClip(frame);
      }

      editor.canvas.requestRenderAll();
    }
  };

  const handleFrameHeightChange = (value: string) => {
    const height = parseInt(value) || 400;
    setFrameHeight(height);

    if (frame && editor?.canvas) {
      if (isCircle) {
        // For circles, set radius (height = diameter)
        (frame as any).set({
          radius: height / 2,
          scaleX: 1,
          scaleY: 1,
        });
        setFrameWidth(height); // Keep diameter equal
      } else {
        // Reset scale and set new height
        (frame as any).set({
          height: height,
          scaleY: 1,
        });
      }
      (frame as fabric.Object).setCoords();

      // Update linked image's clipPath
      const linkedImage = frame.getLinkedImage(editor.canvas) as FramedImage | null;
      if (linkedImage) {
        linkedImage.applyFrameClip(frame);
      }

      editor.canvas.requestRenderAll();
    }
  };

  // Show sidebar for both frame and image in edit mode
  if (!frame && !framedImage) {
    return null;
  }

  return (
    <aside
      className={cn(
        "bg-white relative border-r z-[40] w-[360px] h-full flex flex-col",
        activeTool === "image-frame" ? "visible" : "hidden",
      )}
    >
      <ToolSidebarHeader
        title="Image Frame"
        description={framedImage?.isInEditMode ? "Edit image position" : "Adjust frame size"}
      />
      <ScrollArea>
        <div className="p-4 space-y-6">
          {/* Frame Dimensions - only show when frame is selected */}
          {frame && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">
                {isCircle ? "Circle Size" : "Frame Size"}
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    {isCircle ? "Diameter" : "Width"}
                  </Label>
                  <Input
                    type="number"
                    value={Math.round(frameWidth)}
                    onChange={(e) => handleFrameWidthChange(e.target.value)}
                    className="h-8"
                  />
                </div>
                {!isCircle && (
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Height</Label>
                    <Input
                      type="number"
                      value={Math.round(frameHeight)}
                      onChange={(e) => handleFrameHeightChange(e.target.value)}
                      className="h-8"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Edit Mode Info */}
          {framedImage?.isInEditMode && (
            <div className="bg-green-50 border border-green-200 rounded-md p-3">
              <p className="text-xs text-green-700">
                <strong>Edit Mode Active:</strong> Drag, resize, or rotate the image.
                The green dashed border shows the frame boundary.
                Press <strong>Escape</strong> or click outside to exit.
              </p>
            </div>
          )}

          {/* Instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
            <p className="text-xs text-blue-700">
              <strong>Tip:</strong> Double-click the frame to enter image edit mode.
              In edit mode, you can drag, resize, and rotate the image while the frame stays fixed.
              Press Escape or click outside to exit edit mode.
            </p>
          </div>
        </div>
      </ScrollArea>
      <ToolSidebarClose onClick={onClose} />
    </aside>
  );
};
