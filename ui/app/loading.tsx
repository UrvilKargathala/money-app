export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div role="status" aria-label="Loading" className="h-8 w-8 animate-spin rounded-full border-4 border-primary-200 border-t-primary-600">
        <span className="sr-only">Loading…</span>
      </div>
    </div>
  );
}
