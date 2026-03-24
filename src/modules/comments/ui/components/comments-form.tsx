import { z } from 'zod';
import { toast } from 'sonner';
import { useUser, useClerk } from '@clerk/nextjs';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { trpc } from '@/trpc/client';
import { Button } from '@/components/ui/button';
import { commentInsertSchema } from '@/db/schema';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/user-avatar';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form';

interface CommentsFormProps {
  videoId: string;
  parentId?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  variant?: 'comment' | 'reply';
}

const commentFormSchema = commentInsertSchema.omit({ userId: true });
type CommentFormValues = z.infer<typeof commentFormSchema>;

export const CommentForm = ({
  videoId,
  parentId,
  onCancel,
  onSuccess,
  variant = 'comment',
}: CommentsFormProps) => {
  const { user } = useUser();
  const clerk = useClerk();
  const utils = trpc.useUtils();
  const create = trpc.comments.create.useMutation({
    onSuccess: () => {
      // refresh comments
      utils.comments.getMany.invalidate({ videoId });
      // refresh comments & replies
      utils.comments.getMany.invalidate({ videoId, parentId });
      form.reset();
      toast.success('Comment added');
      onSuccess?.();
    },
    onError: (error) => {
      if (error.data?.code === 'UNAUTHORIZED') {
        clerk.openSignIn();
      } else {
        toast.error('Something went wrong!');
      }
    },
  });
  const form = useForm<CommentFormValues>({
    resolver: zodResolver(commentInsertSchema.omit({ userId: true })),
    defaultValues: {
      parentId,
      videoId,
      value: '',
    },
  });

  const handleSubmit = (values: CommentFormValues) => {
    console.log(values);
    create.mutate(values);
  };

  const handleCancel = () => {
    form.reset();
    onCancel?.();
  };
  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(handleSubmit)}
        className="flex gap-4 group"
      >
        <UserAvatar
          size="lg"
          imageUrl={user?.imageUrl || '/user-placeholder.svg'}
          name={user?.username || 'User'}
        />
        <div className="flex-1">
          <FormField
            name="value"
            control={form.control}
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder={
                      variant === 'reply'
                        ? 'Reply to this comment...'
                        : 'Add a comment...'
                    }
                    className="resize-none bg-transparent overflow-hidden min-h-0"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="justify-end gap-2 mt-2 flex">
            {onCancel && (
              <Button variant="ghost" type="button" onClick={handleCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" size="sm" disabled={create.isPending}>
              {variant === 'reply' ? 'Reply' : 'Comment'}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
};
