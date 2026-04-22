import Link from 'next/link';
import {
  ChevronDownIcon,
  ChevronUp,
  ChevronUpIcon,
  Edit2Icon,
  MessageSquareIcon,
  MoreVerticalIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
  Trash2Icon,
  Video,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

import { trpc } from '@/trpc/client';
import { CommentsGetManyOutput } from '../../types';
import { UserAvatar } from '@/components/user-avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useAuth, useClerk } from '@clerk/clerk-react';
import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { error } from 'console';
import { CommentForm } from './comments-form';
import { CommentReplies } from './comment-replies';

interface CommentItemProps {
  comment: CommentsGetManyOutput['items'][number];
  variant?: 'reply' | 'comment';
}

export const CommentItem = ({
  comment,
  variant = 'comment',
}: CommentItemProps) => {
  const { userId } = useAuth();
  const utils = trpc.useUtils();
  const clerk = useClerk();
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isReplyOpen, setIsReplyOpen] = useState<boolean>(false);
  const [isRepliesOpen, setIsRepliesOpen] = useState<boolean>(false);

  const remove = trpc.comments.remove.useMutation({
    onSuccess: () => {
      utils.comments.getMany.invalidate({ videoId: comment.videoId });
      utils.studio.getMany.invalidate();
      toast.success('Comment deleted');
    },
    onError: (error) => {
      if (error.data?.code === 'UNAUTHORIZED') return clerk.openSignIn();
      return toast.error('Something went wrong!');
    },
  });
  const update = trpc.comments.update.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      utils.comments.getMany.invalidate({ videoId: comment.videoId });
      toast.success('Comment updated');
    },
    onError: (error) => {
      if (error.data?.code === 'UNAUTHORIZED') return clerk.openSignIn();
      return toast.error('Something went wrong!');
    },
  });
  const like = trpc.commentReactions.like.useMutation({
    onSuccess: () => {
      utils.comments.getMany.invalidate({ videoId: comment.videoId });
    },
    onError: (error) => {
      if (error.data?.code === 'UNAUTHORIZED') return clerk.openSignIn();
      return toast.error('Something went wrong!');
    },
  });
  const dislike = trpc.commentReactions.dislike.useMutation({
    onSuccess: () => {
      utils.comments.getMany.invalidate({ videoId: comment.videoId });
    },
    onError: (error) => {
      if (error.data?.code === 'UNAUTHORIZED') return clerk.openSignIn();
      return toast.error('Something went wrong!');
    },
  });
  return (
    <div>
      <div className="flex gap-4">
        <Link prefetch href={`/users/${comment.userId}`}>
          <UserAvatar
            size={variant === 'comment' ? 'lg' : 'sm'}
            imageUrl={comment.user.imageUrl}
            name={comment.user.name}
          />
        </Link>
        {isEditing ? (
          <div className="flex-1 min-w-0">
            <div className="flex flex-col">
              <Input ref={inputRef} defaultValue={comment.value} />
              <div className="flex justify-end gap-2 mt-2">
                <Button
                  onClick={() => {
                    const newValue = inputRef.current?.value;
                    if (!newValue || newValue === comment.value) return;
                    update.mutate({ id: comment.id, value: newValue });
                  }}
                  disabled={update.isPending}
                >
                  Save
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setIsEditing((prev) => !prev)}
                  disabled={update.isPending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 min-w-0 ">
              <Link prefetch href={`/users/${comment.userId}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-medium text-sm pb-0.5">
                    {comment.user.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(comment.createdAt, {
                      addSuffix: true,
                    })
                      .replace('less than a minute ago', 'just now')
                      .replace('about', '')}
                  </span>
                </div>
              </Link>
              <p className="text-sm">{comment.value}</p>
              <div className="flex items-center ">
                <Button
                  disabled={like.isPending || dislike.isPending}
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => like.mutate({ commentId: comment.id })}
                >
                  <ThumbsUpIcon
                    className={cn(
                      comment.viewerReactions === 'like' && 'fill-black'
                    )}
                  />
                </Button>
                <span className="text-xs text-muted-foreground">
                  {comment.likeCount}
                </span>
                <Button
                  disabled={like.isPending || dislike.isPending}
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  onClick={() => dislike.mutate({ commentId: comment.id })}
                >
                  <ThumbsDownIcon
                    className={cn(
                      comment.viewerReactions === 'dislike' && 'fill-black'
                    )}
                  />
                </Button>
                <span className="text-xs text-muted-foreground">
                  {comment.dislikeCount}
                </span>
                {variant === 'comment' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 ml-1"
                    onClick={() => setIsReplyOpen(true)}
                  >
                    Reply
                  </Button>
                )}
              </div>
            </div>
            <DropdownMenu modal={false}>
              {comment.user.clerkId === userId && (
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreVerticalIcon />
                  </Button>
                </DropdownMenuTrigger>
              )}
              <DropdownMenuContent align="end">
                {variant === 'comment' && (
                  <DropdownMenuItem onClick={() => setIsReplyOpen(true)}>
                    <MessageSquareIcon className="size-4" />
                    Reply
                  </DropdownMenuItem>
                )}
                {comment.user.clerkId === userId && (
                  <>
                    <DropdownMenuItem onClick={() => setIsEditing(true)}>
                      <Edit2Icon className="size-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => remove.mutate({ id: comment.id })}
                    >
                      <Trash2Icon className="size-4" />
                      Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
      {isReplyOpen && variant === 'comment' && (
        <div className="mt-4 pl-14">
          <CommentForm
            variant="reply"
            parentId={comment.id}
            //This is the main comment we replying to so we have to pass the comment.id
            //So the comment we gonna add it will be the child (reply) who carrying the comment.id as a parentId
            videoId={comment.videoId}
            onCancel={() => {
              setIsReplyOpen(false);
            }}
            onSuccess={() => {
              setIsReplyOpen(false);
              setIsRepliesOpen(true);
            }}
          />
        </div>
      )}
      {comment.replyCount > 0 && variant === 'comment' && (
        <div className="ml-4">
          <Button
            size="sm"
            variant="tertiary"
            onClick={() => setIsRepliesOpen((current) => !current)}
          >
            {isRepliesOpen ? <ChevronUpIcon /> : <ChevronDownIcon />}
            {comment.replyCount} replies
          </Button>
        </div>
      )}
      {comment.replyCount > 0 && variant === 'comment' && isRepliesOpen && (
        <CommentReplies parentId={comment.id} videoId={comment.videoId} />
      )}
    </div>
  );
};
