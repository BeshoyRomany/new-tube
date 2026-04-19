import { cn } from '@/lib/utils';
import { Button, ButtonProps } from '@/components/ui/button';

interface SubscriptionsButtonProps {
  onClick: ButtonProps['onClick'];
  disabled: boolean;
  isSubscribed: boolean;
  className?: string;
  size?: ButtonProps['size'];
}

export const SubscriptionButton = ({
  onClick,
  disabled,
  isSubscribed,
  className,
  size,
}: SubscriptionsButtonProps) => {
  return (
    <Button
      size={size}
      disabled={disabled}
      variant={isSubscribed ? 'secondary' : 'default'}
      className={cn('rounded-full', className)}
      onClick={onClick}
    >
      {isSubscribed ? 'Unsubscribe' : 'Subscribe'}
    </Button>
  );
};
