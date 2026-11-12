// SPDX-License-Identifier: AGPL-3.0-or-later
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-lg border border-neutral-200 border-l-4 p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-neutral-950 dark:border-neutral-800 dark:[&>svg]:text-neutral-50",
  {
    variants: {
      variant: {
        default: "bg-white text-neutral-950 dark:bg-neutral-950 dark:text-neutral-50",
        destructive:
          "border-red-500/50 text-red-500 dark:border-red-500 [&>svg]:text-red-500 dark:border-red-900/50 dark:text-red-900 dark:dark:border-red-900 dark:[&>svg]:text-red-900",
        warning:
          "border-yellow-500/50 text-yellow-800 dark:border-yellow-500 [&>svg]:text-yellow-700 dark:border-yellow-900/50 dark:text-yellow-500 dark:dark:border-yellow-900 dark:[&>svg]:text-yellow-500",
        info: "border-blue-500/50 text-blue-700 dark:border-blue-500 [&>svg]:text-blue-700 dark:border-blue-900/50 dark:text-blue-400 dark:dark:border-blue-900 dark:[&>svg]:text-blue-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Alert = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className, props.class)} {...props} />
  )
);
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(({ className, ...props }, ref) => (
  <h5 ref={ref} className={cn("mb-1 font-bold leading-none tracking-tight", className, props.class)} {...props} />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("text-sm [&_p]:leading-relaxed", className, props.class)} {...props} />
);
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
