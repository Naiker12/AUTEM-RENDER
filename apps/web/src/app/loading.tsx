export default function GlobalLoading() {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[2px] overflow-hidden bg-border/30">
      <div className="btn-primary h-full w-1/3 animate-pulse rounded-full" />
    </div>
  );
}
