import { Menu, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ROLE_LABEL } from "../../utils/constants";

export default function Navbar({ onToggleSidebar }: { onToggleSidebar?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-line bg-paper-card px-4">
      <button
        type="button"
        className="rounded-sm p-1.5 text-ink-mute hover:bg-paper lg:hidden"
        onClick={onToggleSidebar}
        aria-label="Buka menu"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="font-mono text-xs tracking-widest text-ink-mute">
        UJIANKU
      </div>
      <div className="ml-auto flex items-center gap-2">
        {user && (
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-semibold leading-tight">{user.name}</div>
              <div className="font-mono text-[10px] uppercase text-ink-mute">{ROLE_LABEL[user.role]}</div>
            </div>
            <button
              type="button"
              className="rounded-sm p-1.5 text-ink-mute hover:bg-signal-soft hover:text-signal"
              aria-label="Keluar"
              onClick={async () => {
                await logout();
                navigate("/login", { replace: true });
              }}
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
