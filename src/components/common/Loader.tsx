import { Loader2 } from "lucide-react";

export default function Loader({ full = false, label = "Memuat…" }: { full?: boolean; label?: string }) {
  const box = (
    <div className="flex items-center gap-2 text-sm text-ink-mute" role="status">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  );
  if (full) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">{box}</div>
    );
  }
  return <div className="flex justify-center py-8">{box}</div>;
}
