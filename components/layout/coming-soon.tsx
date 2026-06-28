import { Construction } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function ComingSoon({
  title,
  phase,
}: {
  title: string;
  phase: string;
}) {
  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex size-12 items-center justify-center rounded-full bg-muted">
          <Construction className="size-6 text-muted-foreground" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Fitur ini akan dibuat pada {phase}.</CardDescription>
      </CardHeader>
      <CardContent className="text-center text-sm text-muted-foreground">
        Fondasi (autentikasi, hak akses, database) sudah siap.
      </CardContent>
    </Card>
  );
}
