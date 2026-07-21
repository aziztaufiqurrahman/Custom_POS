"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Input kata sandi dengan tombol lihat/sembunyikan (ikon mata). */
function PasswordInput({
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "type">) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        className={cn("pr-9", className)}
        {...props}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        <span className="sr-only">
          {show ? "Sembunyikan" : "Tampilkan"} kata sandi
        </span>
      </button>
    </div>
  );
}

export { PasswordInput };
