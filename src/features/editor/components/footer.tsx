import { Hand, MousePointer2, ZoomIn, ZoomOut } from "lucide-react";

import { Editor } from "@/features/editor/types";
import { PageSelector } from "@/features/editor/components/page-selector";

import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";

interface FooterProps {
  editor: Editor | undefined;
  isPanMode: boolean;
};

export const Footer = ({ editor, isPanMode }: FooterProps) => {
  const pageCount = editor?.getPageCount() || 1;
  const focusedPage = editor?.getFocusedPageNumber() || 1;

  const enableSelectionMode = () => {
    editor?.disablePanMode();
  };

  const enablePanMode = () => {
    editor?.enablePanMode();
  };

  return (
    <footer className="h-[52px] border-t bg-white w-full flex items-center overflow-x-auto z-[49] p-2 gap-x-1 shrink-0 px-4 justify-between">
      <PageSelector
        editor={editor}
        pageCount={pageCount}
        focusedPage={focusedPage}
      />
      <div className="flex items-center gap-x-1">
        <Hint label="Select" side="top" sideOffset={10}>
          <Button
            onClick={enableSelectionMode}
            size="icon"
            variant={!isPanMode ? "secondary" : "ghost"}
            className="h-full"
          >
            <MousePointer2 className="size-4" />
          </Button>
        </Hint>
        <Hint label="Pan" side="top" sideOffset={10}>
          <Button
            onClick={enablePanMode}
            size="icon"
            variant={isPanMode ? "secondary" : "ghost"}
            className="h-full"
          >
            <Hand className="size-4" />
          </Button>
        </Hint>
        <div className="w-px h-6 bg-gray-200 mx-1" />
        <Hint label="Zoom out" side="top" sideOffset={10}>
          <Button
            onClick={() => editor?.zoomOut()}
            size="icon"
            variant="ghost"
            className="h-full"
          >
            <ZoomOut className="size-4" />
          </Button>
        </Hint>
        <Hint label="Zoom in" side="top" sideOffset={10}>
          <Button
            onClick={() => editor?.zoomIn()}
            size="icon"
            variant="ghost"
            className="h-full"
          >
            <ZoomIn className="size-4" />
          </Button>
        </Hint>
      </div>
    </footer>
  );
};
