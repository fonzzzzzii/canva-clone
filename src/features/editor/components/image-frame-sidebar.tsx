import { useEffect, useMemo, useState } from "react";

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
import { ImageFrame } from "@/features/editor/objects/image-frame";
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

  // Check if selected object is an ImageFrame or FramedImage
  const imageFrame = useMemo(() => {
    if (selectedObject?.type === "imageFrame") {
      return selectedObject as ImageFrame;
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

  // Update state when selection changes
  useEffect(() => {
    if (imageFrame) {
      setFrameWidth((imageFrame.width || 400) * (imageFrame.scaleX || 1));
      setFrameHeight((imageFrame.height || 400) * (imageFrame.scaleY || 1));
    } else if (framedImage && editor?.canvas) {
      const frame = framedImage.getLinkedFrame(editor.canvas);
      if (frame) {
        setFrameWidth((frame.width || 400) * (frame.scaleX || 1));
        setFrameHeight((frame.height || 400) * (frame.scaleY || 1));
      }
    }
  }, [imageFrame, framedImage, editor?.canvas]);

  const onClose = () => {
    onChangeActiveTool("select");
  };

  const handleFrameWidthChange = (value: string) => {
    const width = parseInt(value) || 400;
    setFrameWidth(width);

    if (imageFrame && editor?.canvas) {
      // Reset scale and set new width
      imageFrame.set({
        width: width,
        scaleX: 1,
      });
      imageFrame.setCoords();

      // Update linked image's clipPath
      const linkedImage = imageFrame.getLinkedImage(editor.canvas) as FramedImage | null;
      if (linkedImage) {
        linkedImage.applyFrameClip(imageFrame);
      }

      editor.canvas.requestRenderAll();
    }
  };

  const handleFrameHeightChange = (value: string) => {
    const height = parseInt(value) || 400;
    setFrameHeight(height);

    if (imageFrame && editor?.canvas) {
      // Reset scale and set new height
      imageFrame.set({
        height: height,
        scaleY: 1,
      });
      imageFrame.setCoords();

      // Update linked image's clipPath
      const linkedImage = imageFrame.getLinkedImage(editor.canvas) as FramedImage | null;
      if (linkedImage) {
        linkedImage.applyFrameClip(imageFrame);
      }

      editor.canvas.requestRenderAll();
    }
  };

  // Show sidebar for both frame and image in edit mode
  if (!imageFrame && !framedImage) {
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
          {imageFrame && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Frame Size</Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Width</Label>
                  <Input
                    type="number"
                    value={Math.round(frameWidth)}
                    onChange={(e) => handleFrameWidthChange(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Height</Label>
                  <Input
                    type="number"
                    value={Math.round(frameHeight)}
                    onChange={(e) => handleFrameHeightChange(e.target.value)}
                    className="h-8"
                  />
                </div>
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
