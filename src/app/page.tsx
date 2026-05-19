import { getCurrentUser } from '@/lib/auth/session';

type SearchParams = Promise<{ auth?: string }>;

const AUTH_MESSAGES: Record<string, string> = {
  denied: 'Strava access was denied.',
  state_mismatch: 'Login state mismatch — please try again.',
  exchange_failed: 'Strava token exchange failed — please try again.',
};

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const authMessage = params.auth ? AUTH_MESSAGES[params.auth] : null;

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="text-4xl font-bold tracking-tight">Buurtheld</h1>
        <p className="text-neutral-600">
          Find the easiest Strava Local Legend titles in your neighborhood.
        </p>

        {authMessage && (
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {authMessage}
          </div>
        )}

        {user ? (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3">
              {user.avatarUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt=""
                  className="h-10 w-10 rounded-full"
                />
              )}
              <div className="text-left">
                <div className="font-medium">
                  {user.firstname} {user.lastname}
                </div>
                <div className="text-xs text-neutral-500">Athlete #{user.stravaAthleteId}</div>
              </div>
            </div>
            <div className="flex flex-col items-center gap-3">
              <a
                href="/explore"
                className="inline-flex items-center gap-2 rounded-md bg-[#FC5200] px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-[#e34a00]"
              >
                Explore segments
              </a>
              <form action="/api/auth/logout" method="post">
                <button
                  type="submit"
                  className="rounded-md border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        ) : (
          <a
            href="/api/auth/login"
            className="inline-flex items-center gap-2 rounded-md bg-[#FC5200] px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-[#e34a00]"
          >
            Connect with Strava
          </a>
        )}
      </div>
    </main>
  );
}

function Logo() {
  return (
    <svg viewBox="0 0 512 512" className="h-20 w-20" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#FC5200" />
      <g fill="#FFFFFF">
        <path d="M 100 336 L 156 192 L 220 296 L 256 144 L 292 296 L 356 192 L 412 336 Z" />
        <rect x="96" y="328" width="320" height="68" rx="10" />
        <circle cx="156" cy="180" r="16" />
        <circle cx="256" cy="132" r="18" />
        <circle cx="356" cy="180" r="16" />
      </g>
    </svg>
  );
}
