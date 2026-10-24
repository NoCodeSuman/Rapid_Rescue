import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { Card, CardBody } from '../ui/Card';
import { ErrorState } from '../ui/misc';
import { useAuth } from '../../contexts/AuthContext';
import { useAction } from '../../hooks/useAction';

/** Shown when the signed-in, verified user's profile cannot be loaded. Never an infinite spinner; always a way out. */
export function ProfileProblem() {
  const { profileError, retryProfile, logout } = useAuth();
  const nav = useNavigate();
  const { run, pending, busy } = useAction();
  return (
    <div className="mx-auto max-w-lg px-4 py-16 sm:px-6">
      <Card><CardBody className="space-y-4">
        <ErrorState title="We couldn't load your profile" message={profileError ?? 'Something went wrong while loading your profile.'} />
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button onClick={() => run('retry', async () => { await retryProfile(); return true; })} loading={pending === 'retry'} disabled={busy}>Try again</Button>
          <Button variant="outline" disabled={busy} loading={pending === 'logout'} onClick={async () => { const ok = await run('logout', async () => { await logout(); return true; }); if (ok) nav('/login', { replace: true }); }}>Log out</Button>
        </div>
      </CardBody></Card>
    </div>
  );
}
