import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "pressable inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg text-[13px] font-medium cursor-pointer disabled:pointer-events-none disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E]/25",
  {
    variants: {
      variant: {
        default:
          "bg-[#1C1917] text-white shadow-[0_1px_2px_rgba(28,25,23,0.18)] hover:bg-[#292524]",
        outline:
          "sova-btn-outline bg-white text-[#1C1917] border border-[#DED8CC] hover:border-[#C7BFB1]",
        ghost:
          "bg-transparent text-[#57534E] hover:bg-[#EAE5DB]/70 hover:text-[#1C1917]",
        danger:
          "bg-[#C2410C] text-white shadow-[0_1px_2px_rgba(194,65,12,0.2)] hover:bg-[#9A3412]",
      },
      size: {
        default: "h-8 px-3",
        sm: "h-7 px-2.5 text-[12px]",
        icon: "h-8 w-8 px-0",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
