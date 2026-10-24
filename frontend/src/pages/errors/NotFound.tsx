import { Compass, Home } from 'lucide-react';
import { LinkButton } from '../../components/ui/Button';
import { useAuth, dashboardPath } from '../../contexts/AuthContext';

export default function NotFound() {
  const { user } = useAuth();
  return (
    <main id="main" className="flex min-h-screen items-center justify-center bg-surface-muted px-4">
      <div className="max-w-md text-center">
        <p className="text-6xl font-bold text-navy-800">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-ink-soft">The page you are looking for does not exist or has moved. This is a booking site, so only the documented routes are available.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <LinkButton to="/"><Home className="h-4 w-4" aria-hidden />Return home</LinkButton>
          <LinkButton to={user ? dashboardPath(user.role) : '/login'} variant="outline"><Compass className="h-4 w-4" aria-hidden />{user ? 'Go to my dashboard' : 'Log in'}</LinkButton>
        </div>
      </div>
    </main>
  );
}
