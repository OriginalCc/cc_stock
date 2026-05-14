import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header skeleton */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="max-w-[1400px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 shrink-0">
              <Skeleton className="h-6 w-6 rounded" />
              <Skeleton className="h-5 w-16 hidden sm:block" />
              <Skeleton className="h-5 w-10 hidden sm:block" />
              <div className="flex items-center gap-1 ml-1">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-6 w-12 rounded" />
                ))}
              </div>
            </div>
            <Skeleton className="h-9 w-full max-w-md rounded-md" />
            <div className="flex items-center gap-2">
              <div className="hidden lg:flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-7 w-12 rounded" />
                ))}
              </div>
              <Skeleton className="h-7 w-20 rounded" />
            </div>
          </div>
        </div>
      </header>

      {/* Main content skeleton */}
      <main className="flex-1 max-w-[1400px] mx-auto w-full px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left: Chart area skeleton */}
          <div className="lg:col-span-2 space-y-4">
            {/* Quote bar skeleton */}
            <div className="flex items-center gap-4 p-4 rounded-lg border border-border">
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-20" />
            </div>
            {/* Chart skeleton */}
            <Skeleton className="h-[400px] w-full rounded-lg" />
            {/* Signal bar skeleton */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-24 rounded-full" />
              <Skeleton className="h-8 w-24 rounded-full" />
              <Skeleton className="h-8 w-24 rounded-full" />
              <Skeleton className="h-8 w-32 rounded-full" />
            </div>
          </div>

          {/* Right: Info panel skeleton */}
          <div className="space-y-4">
            <Skeleton className="h-[200px] w-full rounded-lg" />
            <Skeleton className="h-[150px] w-full rounded-lg" />
            <Skeleton className="h-[100px] w-full rounded-lg" />
          </div>
        </div>
      </main>
    </div>
  );
}
