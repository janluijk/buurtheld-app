import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/session';
import { ExploreMap } from './ExploreMap';

export default async function ExplorePage() {
  const session = await getSession();
  const isSignedIn = !!session;
  if (!isSignedIn) {
    redirect('/');
  }
  return <ExploreMap />;
}
