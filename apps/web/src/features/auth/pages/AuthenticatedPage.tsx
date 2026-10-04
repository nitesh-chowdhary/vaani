import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import { useAuth } from '../hooks/useAuth';
export function AuthenticatedPage() {
  const { user, logout } = useAuth();
  const [pending, setPending] = useState(false);
  return (
    <section className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-sm">
      <h1 className="text-2xl font-semibold">Signed in</h1>
      <p className="my-6 break-all text-slate-300">{user?.email}</p>
      <Button
        disabled={pending}
        onClick={() => {
          setPending(true);
          void logout()
            .catch(() => {
              /* local state is cleared even if the network fails */
            })
            .finally(() => setPending(false));
        }}
      >
        Log out
      </Button>
    </section>
  );
}
