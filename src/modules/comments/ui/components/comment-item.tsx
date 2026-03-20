import Link from 'next/link';
import {
  Edit2Icon,
  MessageSquareIcon,
  MoreVerticalIcon,
  Trash2Icon,
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

interface CommentItemProps {
  comment: CommentsGetManyOutput['items'][number];
}

export const CommentItem = ({ comment }: CommentItemProps) => {
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { userId } = useAuth();
  const utils = trpc.useUtils();
  const clerk = useClerk();
  const remove = trpc.comments.remove.useMutation({
    onSuccess: () => {
      utils.comments.getMany.invalidate({ videoId: comment.videoId });
      toast.success('Comment deleted');
    },
    onError: (error) => {
      if (error.data?.code === 'UNAUTHORIZED') {
        return clerk.openSignIn();
      }
      toast.error('Something went wrong!');
    },
  });
  const update = trpc.comments.update.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      utils.comments.getMany.invalidate({ videoId: comment.videoId });
      toast.success('Comment updated');
    },
    onError: (error) => {
      if (error.data?.code === 'UNAUTHORIZED') {
        return clerk.openSignIn();
      }
      toast.error('Something went wrong!');
    },
  });
  return (
    <div>
      <div className="flex gap-4">
        <Link href={`/users/${comment.userId}`}>
          <UserAvatar
            size="lg"
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
              <Link href={`/users/${comment.userId}`}>
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
              {/* TODO: Reactions */}
            </div>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8">
                  <MoreVerticalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => {}}>
                  <MessageSquareIcon className="size-4" />
                  Replay
                </DropdownMenuItem>
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
    </div>
  );
};
