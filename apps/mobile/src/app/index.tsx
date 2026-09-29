import { Redirect } from 'expo-router';
import { consumeResume } from '@/lib/bootstrap';
import { useSession } from '@/lib/session';
import { useSettings } from '@/lib/settings';

export default function Gate() {
  const onboarded = useSettings((s) => s.onboarded);
  const session = useSession((s) => s.session);
  if (!onboarded) return <Redirect href="/onboarding" />;
  if (!session) return <Redirect href="/login" />;
  const resume = consumeResume();
  if (resume) return <Redirect href={{ pathname: '/pay/return', params: { id: resume, resumed: '1' } }} />;
  return <Redirect href="/home" />;
}
