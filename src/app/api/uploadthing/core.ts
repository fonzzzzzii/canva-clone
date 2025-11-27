import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError } from "uploadthing/server";

import { auth } from "@/auth";
 
const f = createUploadthing();
 
export const ourFileRouter = {
  imageUploader: f({ image: { maxFileSize: "2GB", maxFileCount: 50 } })
    .middleware(async ({ req }) => {
      const session = await auth();
 
      if (!session) throw new UploadThingError("Unauthorized");
 
      return { userId: session.user?.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      return {
        url: file.url,
        uploadedAt: new Date().toISOString(),
        originalName: file.name,
        size: file.size,
      };
    }),
} satisfies FileRouter;
 
export type OurFileRouter = typeof ourFileRouter;
