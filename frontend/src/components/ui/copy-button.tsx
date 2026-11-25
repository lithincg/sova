import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "./button";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  value: string;
  label?: string;
  toastMessage?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
}

export function CopyButton({
  value,
  label = "Copy",
  toastMessage = "Copied to clipboard",
  size = "sm",
  variant = "ghost",
  className,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = () => {
    navigator.clipboard?.writeText(value);
    toast.success(toastMessage);
    setCopied(true);
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      onClick={handleCopy}
      className={cn("gap-1.5", className)}
    >
      <span className="relative flex h-3.5 w-3.5 items-center justify-center">
        <Copy
          className={cn(
            "absolute h-3 w-3 transition-[opacity,transform] duration-150 ease-out",
            copied ? "scale-75 opacity-0" : "scale-100 opacity-100"
          )}
        />
        <Check
          className={cn(
            "absolute h-3.5 w-3.5 text-[#166534] transition-[opacity,transform] duration-150 ease-out",
            copied ? "scale-100 opacity-100" : "scale-75 opacity-0"
          )}
        />
      </span>
      {label && <span>{copied ? "Copied" : label}</span>}
    </Button>
  );
}
