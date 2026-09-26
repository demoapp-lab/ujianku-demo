import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Info, Trash2 } from "lucide-react";

export type ConfirmTone = "danger" | "warning" | "info";

export type ConfirmOptions = {
  title: string;
  message?: string;
  subject?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

const TONE: Record<
  ConfirmTone,
  { bar: string; iconWrap: string; icon: typeof Trash2; confirmBtn: string }
> = {
  danger: {
    bar: "bg-signal",
    iconWrap: "bg-signal-soft text-signal",
    icon: Trash2,
    confirmBtn: "btn-danger",
  },
  warning: {
    bar: "bg-brass",
    iconWrap: "bg-brass-soft text-brass",
    icon: AlertTriangle,
    confirmBtn: "btn-brass",
  },
  info: {
    bar: "bg-ink",
    iconWrap: "bg-paper text-ink",
    icon: Info,
    confirmBtn: "btn-primary",
  },
};

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    options: ConfirmOptions;
    resolve: (ok: boolean) => void;
  } | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      setState({ options, resolve });
    });
  }, []);

  const settle = useCallback(
    (ok: boolean) => {
      setState((prev) => {
        prev?.resolve(ok);
        return null;
      });
    },
    []
  );

  useEffect(() => {
    if (!state) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        settle(false);
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [state, settle]);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {state &&
        createPortal(
          <ConfirmPanel
            options={state.options}
            onCancel={() => settle(false)}
            onConfirm={() => settle(true)}
            cancelRef={cancelRef}
          />,
          document.body
        )}
    </ConfirmContext.Provider>
  );
}

function ConfirmPanel({
  options,
  onCancel,
  onConfirm,
  cancelRef,
}: {
  options: ConfirmOptions;
  onCancel: () => void;
  onConfirm: () => void;
  cancelRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const tone = options.tone ?? "danger";
  const t = TONE[tone];
  const Icon = t.icon;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Tutup dialog"
        className="dialog-backdrop absolute inset-0 cursor-default"
        onClick={onCancel}
      />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={options.message ? "confirm-body" : undefined}
        className="dialog-sheet relative w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`h-1 w-full ${t.bar}`} aria-hidden />
        <div className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span
              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-sm ${t.iconWrap}`}
              aria-hidden
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id="confirm-title" className="text-base font-bold leading-snug text-ink">
                {options.title}
              </h2>
              {options.message && (
                <p id="confirm-body" className="mt-1.5 text-sm leading-relaxed text-ink-mute">
                  {options.message}
                </p>
              )}
              {options.subject && (
                <p className="mt-3 inline-block max-w-full truncate rounded-sm border border-ink-line bg-paper px-2 py-1 font-mono text-xs text-ink">
                  {options.subject}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              ref={cancelRef}
              type="button"
              className="btn-secondary"
              onClick={onCancel}
            >
              {options.cancelLabel ?? "Batal"}
            </button>
            <button type="button" className={t.confirmBtn} onClick={onConfirm}>
              {options.confirmLabel ?? "Lanjutkan"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm harus dipakai di dalam ConfirmProvider");
  return ctx;
}
