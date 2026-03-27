'use client';
// here we marked this component as a client component because it will be used everywhere not just under videos-section
import MuxPlayer from '@mux/mux-player-react';
import { THUMBNAIL_FALLBACK } from '../../constants';
interface VideoPlayerProps {
  playbackId?: string | null | undefined;
  thumbnailUrl?: string | null | undefined;
  autoPlay?: boolean;
  onPlay?: () => void;
}
export const VideoPlayerSkeleton = () => {
  return <div className="aspect-video bg-black rounded-xl"></div>;
};
export const VideoPlayer = ({
  playbackId,
  thumbnailUrl,
  autoPlay,
  onPlay,
}: VideoPlayerProps) => {
  return (
    <MuxPlayer
      playbackId={playbackId || ''}
      poster={thumbnailUrl || THUMBNAIL_FALLBACK}
      playerInitTime={0}
      autoPlay={autoPlay}
      thumbnailTime={0}
      className="w-full h-full object-cover "
      accentColor="#FF205D"
      onPlay={onPlay}
    />
  );
};
