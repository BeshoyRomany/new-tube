import { cva, VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@/components/ui/tooltip';

const userInfoVariant = cva('flex items-center gap-1', {
  variants: {
    size: {
      default: '[&_p]:text-sm [&_svg]:size-4',
      lg: '[&_p]:text-base [&_svg]:size-5 [&_p]:font-medium [&_p]:text-foreground',
      sm: '[&_p]:text-xs [&_svg]:size-3.5',
    },
    defaultVariants: {
      size: 'default',
    },
  },
});

interface UserInfoProps extends VariantProps<typeof userInfoVariant> {
  name: string;
  className?: string;
}

export const UserInfo = ({ name, className, size }: UserInfoProps) => {
  return (
    <div className={cn(userInfoVariant({ size, className }))}>
      <Tooltip>
        <TooltipTrigger asChild>
          <p className="text-muted-foreground hover:text-foreground line-clamp-1">
            {name}
          </p>
        </TooltipTrigger>
        <TooltipContent align="center">
          <p>{name}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  );
};
