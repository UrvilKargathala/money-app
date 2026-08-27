import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function PlaceholderPage({ title, description, module }: { title: string; description: string; module: string }) {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold font-heading text-neutral-900">{title}</h1>
        <p className="text-sm text-neutral-500 font-body mt-1">{description}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Coming Soon</CardTitle>
          <CardDescription>The {module} module is under construction.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-neutral-500 font-body">
            This module will be available in the next update. Check back soon or explore the available modules from the sidebar.
          </p>
          <Button asChild className="mt-4">
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
