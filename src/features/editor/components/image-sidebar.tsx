import { Upload, X } from "lucide-react";

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
  uploadedImages: string[];
  onUploadedImagesChange: (images: string[]) => void;
}

export const ImageSidebar = ({
  editor,
  activeTool,
  onChangeActiveTool,
  uploadedImages,
  onUploadedImagesChange,
}: ImageSidebarProps) => {
  const onClose = () => {
    onChangeActiveTool("select");
  };

  const handleDelete = (urlToDelete: string) => {
    onUploadedImagesChange(uploadedImages.filter((url) => url !== urlToDelete));
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, imageUrl: string) => {
    e.dataTransfer.setData("image-url", imageUrl);
    e.dataTransfer.effectAllowed = "copy";
  };

  return (
    <aside
      className={cn(
        "bg-white relative border-r z-[40] w-[360px] h-full flex flex-col",
        activeTool === "images" ? "visible" : "hidden"
      )}
    >
      <ToolSidebarHeader title="Images" description="Drag images to your canvas" />
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
            // Process ALL uploaded images (fixes multi-upload bug)
            const newUrls = res.map((file) => file.url);
            onUploadedImagesChange([...uploadedImages, ...newUrls]);
          }}
        />
      </div>
      <ScrollArea>
        <div className="p-4">
          {uploadedImages.length === 0 ? (
            <div className="flex flex-col gap-y-4 items-center justify-center py-8">
              <Upload className="size-8 text-muted-foreground" />
              <p className="text-muted-foreground text-sm text-center">
                No images uploaded yet.<br />Upload an image to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {uploadedImages.map((url, index) => (
                <div
                  key={`image-${index}-${url.slice(-20)}`}
                  draggable
                  onDragStart={(e) => handleDragStart(e, url)}
                  className="relative w-full h-[100px] group cursor-grab active:cursor-grabbing bg-muted rounded-sm overflow-hidden border hover:ring-2 hover:ring-primary/50 transition"
                >
                  <img
                    src={url}
                    alt="Uploaded image"
                    className="object-cover w-full h-full pointer-events-none"
                    loading="lazy"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(url);
                    }}
                    className="absolute top-1 right-1 bg-black/50 hover:bg-black/70 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
      <ToolSidebarClose onClick={onClose} />
    </aside>
  );
};
