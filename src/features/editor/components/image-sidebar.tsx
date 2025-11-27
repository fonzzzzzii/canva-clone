import { useMemo } from "react";
import { AlertTriangle, Loader, Upload } from "lucide-react";

import { ActiveTool, Editor } from "@/features/editor/types";
import { ToolSidebarClose } from "@/features/editor/components/tool-sidebar-close";
import { ToolSidebarHeader } from "@/features/editor/components/tool-sidebar-header";

import { cn } from "@/lib/utils";
import { UploadButton } from "@/lib/uploadthing";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ImageSidebarProps {
  editor: Editor | undefined;
  activeTool: ActiveTool;
  onChangeActiveTool: (tool: ActiveTool) => void;
}

export const ImageSidebar = ({ editor, activeTool, onChangeActiveTool }: ImageSidebarProps) => {
  // Get images from the canvas (both regular images and FramedImages)
  const images = useMemo(() => {
    if (!editor?.canvas) return [];

    const allObjects = editor.canvas.getObjects();
    const imageUrls: string[] = [];

    allObjects.forEach((obj: any) => {
      // Handle regular fabric.Image objects
      if (obj.type === "image") {
        const url = obj.getSrc?.() || obj.src || obj._element?.src;
        if (url) imageUrls.push(url);
      }
      // Handle FramedImage objects (type === "framedImage" or groups with imageUrl property)
      else if (obj.type === "framedImage" || (obj.type === "group" && obj.imageUrl)) {
        imageUrls.push(obj.imageUrl);
      }
    });

    // Return unique URLs while preserving order
    return Array.from(new Set(imageUrls)).map((url, index) => ({
      id: `image-${index}`,
      url: url as string,
    }));
  }, [editor?.canvas, editor?.canvas?.getObjects()]);

  const onClose = () => {
    onChangeActiveTool("select");
  };

  return (
    <aside
      className={cn(
        "bg-white relative border-r z-[40] w-[360px] h-full flex flex-col",
        activeTool === "images" ? "visible" : "hidden"
      )}
    >
      <ToolSidebarHeader title="Images" description="Add images to your canvas" />
      <div className="p-4 border-b">
        <UploadButton
          appearance={{
            button: "w-full text-sm font-medium",
            allowedContent: "hidden",
          }}
          content={{
            button: "Upload Image",
          }}
          endpoint="imageUploader"
          onClientUploadComplete={(res) => {
            editor?.addImage(res[0].url);
          }}
        />
      </div>
      <ScrollArea>
        <div className="p-4">
          {images.length === 0 ? (
            <div className="flex flex-col gap-y-4 items-center justify-center py-8">
              <Upload className="size-8 text-muted-foreground" />
              <p className="text-muted-foreground text-sm text-center">
                No images in this project yet.<br />Upload an image to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {images.map((image) => {
                return (
                  <button
                    onClick={() => editor?.addImage(image.url)}
                    key={image.id}
                    className="relative w-full h-[100px] group hover:opacity-75 transition bg-muted rounded-sm overflow-hidden border"
                  >
                    <img
                      src={image.url}
                      alt="Project image"
                      className="object-cover w-full h-full"
                      loading="lazy"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
      <ToolSidebarClose onClick={onClose} />
    </aside>
  );
};
