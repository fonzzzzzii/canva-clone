import { Editor } from "@/features/editor/types";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/hint";
import { cn } from "@/lib/utils";

interface PageSelectorProps {
  editor: Editor | undefined;
  pageCount: number;
  focusedPage: number;
}

export const PageSelector = ({
  editor,
  pageCount,
  focusedPage,
}: PageSelectorProps) => {
  // Don't show page selector for single-page projects
  if (pageCount <= 1) {
    return null;
  }

  const handlePageClick = (pageNumber: number) => {
    editor?.setFocusedPage(pageNumber);
  };

  return (
    <div className="flex items-center gap-x-1">
      <span className="text-xs text-muted-foreground mr-2">Page:</span>
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((pageNumber) => (
        <Hint key={pageNumber} label={`Page ${pageNumber}`} side="top" sideOffset={5}>
          <Button
            onClick={() => handlePageClick(pageNumber)}
            size="icon"
            variant="ghost"
            className={cn(
              "h-8 w-8 text-xs transition-all",
              focusedPage === pageNumber
                ? "bg-muted border-2 border-blue-500 text-primary font-semibold"
                : "bg-white border border-gray-300 hover:bg-gray-50"
            )}
          >
            {pageNumber}
          </Button>
        </Hint>
      ))}
    </div>
  );
};
