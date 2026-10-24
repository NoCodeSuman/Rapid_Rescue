import { ShieldAlert } from 'lucide-react';
import { LinkButton } from '../../components/ui/Button';
import { useAuth, dashboardPath } from '../../contexts/AuthContext';

export default function Unauthorized() {
  const { user } = useAuth();
  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-danger-100 text-danger-600"><ShieldAlert className="h-7 w-7" aria-hidden /></span>
      <h1 className="mt-4 text-2xl font-semibold">You don't have access to that page</h1>
      <p className="mt-2 text-sm text-ink-soft">Your account role is not permitted to open this area. Access controls are enforced by this application.</p>
      <div className="mt-6"><LinkButton to={user ? dashboardPath(user.role) : '/login'}>{user ? 'Back to my dashboard' : 'Log in'}</LinkButton></div>
    </div>
  );
}
