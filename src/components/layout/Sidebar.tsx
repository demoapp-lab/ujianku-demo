import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  ClipboardList,
  Settings,
  FileQuestion,
  CalendarClock,
  PenLine,
  History,
  CreditCard,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Role } from "../../types";
import SchoolLogo from "../common/SchoolLogo";
import { getSchoolInfo } from "../../services/settingsService";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const MENUS: Record<Role, NavItem[]> = {
  admin: [
    { to: "/admin", label: "Dasbor", icon: LayoutDashboard },
    { to: "/admin/users", label: "Pengguna", icon: Users },
    { to: "/admin/classes", label: "Kelas & Mapel", icon: GraduationCap },
    { to: "/admin/cards", label: "Cetak Kartu", icon: CreditCard },
    { to: "/admin/log", label: "Log", icon: History },
    { to: "/admin/settings", label: "Pengaturan", icon: Settings },
    { to: "/admin/reports", label: "Laporan", icon: ClipboardList },
  ],
  teacher: [
    { to: "/teacher", label: "Dasbor", icon: LayoutDashboard },
    { to: "/teacher/bank", label: "Bank Soal", icon: FileQuestion },
    { to: "/teacher/exams", label: "Ujian", icon: ClipboardList },
    { to: "/teacher/grade", label: "Koreksi Esai", icon: PenLine },
    { to: "/teacher/results", label: "Rekap Nilai", icon: ClipboardList },
    { to: "/admin/cards", label: "Cetak Kartu", icon: CreditCard },
    { to: "/admin/log", label: "Log", icon: History },
  ],
  student: [
    { to: "/student", label: "Dasbor", icon: LayoutDashboard },
    { to: "/student/schedule", label: "Jadwal Ujian", icon: CalendarClock },
    { to: "/student/results", label: "Hasil Saya", icon: History },
  ],
};

export default function Sidebar({
  role,
  open,
  onClose,
}: {
  role: Role;
  open: boolean;
  onClose: () => void;
}) {
  const items = MENUS[role];
  const [schoolName, setSchoolName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  useEffect(() => {
    getSchoolInfo()
      .then((info) => {
        setSchoolName(info.schoolName);
        setLogoUrl(info.logoUrl);
      })
      .catch(() => undefined);
  }, []);

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-ink/40 lg:hidden" onClick={onClose} aria-hidden />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-ink-line bg-ink text-paper transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-white/10 px-3">
          <SchoolLogo url={logoUrl} className="h-8 w-8" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold leading-tight">Ujianku</div>
            <div className="truncate text-[11px] leading-tight text-paper/60">
              {schoolName.trim() || "—"}
            </div>
          </div>
          <button
            type="button"
            className="rounded-sm p-1 text-paper/60 hover:text-paper lg:hidden"
            onClick={onClose}
            aria-label="Tutup menu"
          >
            ×
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to.split("/").length === 2}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-white/10 text-brass-soft"
                    : "text-paper/70 hover:bg-white/5 hover:text-paper"
                }`
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4 font-mono text-[10px] text-paper/40">
          Ujianku - Versi 1.0
        </div>
      </aside>
    </>
  );
}
