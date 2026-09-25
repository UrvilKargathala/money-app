"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <Card role="alert" className="mx-auto max-w-2xl p-8 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-error/10 text-error"><AlertTriangle className="h-6 w-6" /></div>
      <h1 className="text-2xl font-bold">This section could not be loaded</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-neutral-600">Your data is safe. Check your connection and try loading this section again.</p>
      <Button onClick={reset} className="mt-6"><RotateCcw className="h-4 w-4" /> Try again</Button>
    </Card>
  );
}
