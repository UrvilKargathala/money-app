import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/common/loading-skeleton";

export function AppPageSkeleton() {
  return (
    <div className="space-y-8" role="status" aria-live="polite" aria-label="Loading page">
      <span className="sr-only">Loading page content</span>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Card key={index}>
            <CardContent className="space-y-4 p-6">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-10 rounded-xl" />
              </div>
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-3 w-40" />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        <Card>
          <CardHeader className="space-y-2 pb-4">
            <Skeleton className="h-5 w-44" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-64 w-full rounded-xl" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-2 pb-4">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="flex items-center gap-3 rounded-lg border border-line p-3">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="space-y-2 pb-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-52" />
            </CardHeader>
            <CardContent className="space-y-3">
              {Array.from({ length: 4 }).map((__, rowIndex) => (
                <Skeleton key={rowIndex} className="h-12 w-full rounded-lg" />
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function AuthPageSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-sunken p-6" aria-label="Loading authentication page">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 pb-4">
          <Skeleton className="mx-auto h-12 w-12 rounded-2xl" />
          <Skeleton className="mx-auto h-7 w-44" />
          <Skeleton className="mx-auto h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="mx-auto h-4 w-48" />
        </CardContent>
      </Card>
    </div>
  );
}

export function PricingPageSkeleton() {
  return (
    <div className="min-h-screen bg-sunken p-6" aria-label="Loading pricing page">
      <div className="mx-auto max-w-6xl space-y-10">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-9 w-28 rounded-xl" />
        </div>
        <div className="space-y-4 text-center">
          <Skeleton className="mx-auto h-10 w-80 max-w-full" />
          <Skeleton className="mx-auto h-5 w-[28rem] max-w-full" />
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="space-y-5 p-6">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-10 w-28" />
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((__, rowIndex) => (
                    <Skeleton key={rowIndex} className="h-4 w-full" />
                  ))}
                </div>
                <Skeleton className="h-10 w-full rounded-xl" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
