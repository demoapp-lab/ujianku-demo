import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";

export default function AppLayout() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();

  if (!user) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar onToggleSidebar={() => setOpen((v) => !v)} />
        <main key={location.pathname} className="flex-1 p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
