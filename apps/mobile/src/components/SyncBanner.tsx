import { Text, View } from 'react-native';
import { useSyncState } from '@/lib/sync';
import { colors, radius, space, type } from '@/theme/tokens';
import { Icon } from './Icon';

/** Honest sync status: shown only when something is not yet on the server. */
export function SyncBanner() {
  const { status, pending, message } = useSyncState();
  if (status === 'idle' || status === 'syncing' || (!pending && status !== 'error')) return null;
  const icon = status === 'offline' ? 'cloud-offline-outline' : status === 'local' ? 'phone-portrait-outline' : 'alert-circle-outline';
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center', padding: space.md, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }} accessibilityRole="alert">
      <Icon name={icon} size={16} color={status === 'error' ? colors.warning : colors.textSecondary} />
      <Text style={[type.caption, { color: colors.textSecondary, flex: 1 }]}>
        {message ?? 'Saved locally.'}{pending ? ` (${pending} change${pending === 1 ? '' : 's'} waiting)` : ''}
      </Text>
    </View>
  );
}
