export default function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const tones = {
    default: "bg-paper text-ink-mute border-ink-line",
    success: "bg-emerald-50 text-emerald-800 border-emerald-200",
    warning: "bg-brass-soft text-ink border-brass/40",
    danger: "bg-signal-soft text-signal border-signal/30",
    info: "bg-sky-50 text-sky-800 border-sky-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[10px] font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
