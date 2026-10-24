import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ProfileProblem } from '../components/common/ProfileProblem';
import { Spinner } from '../components/ui/misc';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types';
import { decideAccess } from './access';

/**
 * Guard with five auth states (loading / signed out / unverified / profile error / verified). Protected content never renders until
 * Firebase has reported its state. NOTE: client-side guards are a UX layer, not server-side authorization.
 */
export function RequireRole({ role }: { role: UserRole }) {
  const { status, role: userRole } = useAuth();
  const loc = useLocation();
  switch (decideAccess(status, userRole, role)) {
    case 'wait': return <Spinner label="Checking your session" />;
    case 'login': return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
    case 'verify': return <Navigate to="/verify-email" replace />;
    case 'error': return <ProfileProblem />;
    case 'unauthorized': return <Navigate to="/unauthorized" replace />;
    default: return <Outlet />;
  }
}
