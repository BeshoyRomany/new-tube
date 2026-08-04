import { UploadDropzone } from '@/lib/uploadthing';
import { ResponsiveModal } from '@/components/responsive-modal';
import { trpc } from '@/trpc/client';

interface ThumbnailUploadModalProps {
  videoId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ThumbnailUploadModal = ({
  videoId,
  open,
  onOpenChange,
}: ThumbnailUploadModalProps) => {
  const utils = trpc.useUtils();
  const onUploadComplete = () => {
    utils.studio.getMany.invalidate();
    utils.studio.getOne.invalidate({ id: videoId });
    onOpenChange(false);
  };
  return (
    <ResponsiveModal
      title="Upload a thumbnail"
      open={open}
      onOpenChange={onOpenChange}
    >
      <UploadDropzone
        endpoint="thumbnailUploader"
        input={{ videoId }}
        onClientUploadComplete={onUploadComplete}
        className="ut-button:bg-primary ut-button:text-primary-foreground ut-button:shadow ut-button:hover:bg-primary/90 ut-button:transition-colors ut-button:ut-readying:bg-primary/70 ut-button:ut-uploading:bg-primary/70 ut-label:text-foreground ut-allowed-content:text-muted-foreground ut-upload-icon:text-muted-foreground border-muted-foreground/25 bg-transparent"
      />
    </ResponsiveModal>
  );
};
