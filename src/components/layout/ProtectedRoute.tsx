import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ROLE_HOME } from "../../utils/constants";
import type { Role } from "../../types";
import Loader from "../common/Loader";

export default function ProtectedRoute({ allowedRoles }: { allowedRoles: Role[] }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loader full />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!allowedRoles.includes(user.role)) {
    return <Navigate to={ROLE_HOME[user.role]} replace />;
  }
  return <Outlet />;
}
