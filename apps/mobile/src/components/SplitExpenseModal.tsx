import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View, ScrollView } from 'react-native';
import { formatINR, type SplitData, type SplitShare } from '@paytrack/shared';
import { PrimaryButton, SecondaryButton } from '@/components/Buttons';
import { Icon } from '@/components/Icon';
import { ScalePressable } from '@/components/ScalePressable';
import { colors, radius, space, type, useIsLight } from '@/theme/tokens';
import { uuid } from '@/lib/ids';

interface SplitExpenseModalProps {
  visible: boolean;
  totalAmountPaise: number;
  currentSplit: SplitData | null;
  onClose: () => void;
  onSave: (split: SplitData | null) => Promise<void>;
}

export function SplitExpenseModal({ visible, totalAmountPaise, currentSplit, onClose, onSave }: SplitExpenseModalProps) {
  const isLight = useIsLight();
  const [numPeople, setNumPeople] = useState<number>(currentSplit ? currentSplit.totalShares : 2);
  const [shares, setShares] = useState<SplitShare[]>(() => {
    if (currentSplit?.shares && currentSplit.shares.length > 0) {
      return currentSplit.shares;
    }
    const splitAmount = Math.round(totalAmountPaise / 2);
    return [
      { id: uuid(), personName: 'You', amountPaise: splitAmount, isPaid: true, settledAt: new Date().toISOString() },
      { id: uuid(), personName: 'Friend 1', amountPaise: totalAmountPaise - splitAmount, isPaid: false },
    ];
  });

  const updatePersonCount = (count: number) => {
    const validCount = Math.max(2, Math.min(count, 10));
    setNumPeople(validCount);

    const baseAmount = Math.floor(totalAmountPaise / validCount);
    const remainder = totalAmountPaise - baseAmount * validCount;

    const newShares: SplitShare[] = [];
    for (let i = 0; i < validCount; i++) {
      const existing = shares[i];
      const personName = i === 0 ? 'You' : existing?.personName || `Person ${i + 1}`;
      const amountPaise = i === 0 ? baseAmount + remainder : baseAmount;
      newShares.push({
        id: existing?.id || uuid(),
        personName,
        amountPaise,
        isPaid: i === 0 ? true : existing?.isPaid || false,
        settledAt: existing?.settledAt,
      });
    }
    setShares(newShares);
  };

  const toggleSettled = (shareId: string) => {
    setShares((prev) =>
      prev.map((s) => {
        if (s.id === shareId) {
          const isPaid = !s.isPaid;
          return {
            ...s,
            isPaid,
            settledAt: isPaid ? new Date().toISOString() : null,
          };
        }
        return s;
      }),
    );
  };

  const updateName = (shareId: string, name: string) => {
    setShares((prev) =>
      prev.map((s) => (s.id === shareId ? { ...s, personName: name } : s)),
    );
  };

  const handleSave = async () => {
    const splitData: SplitData = {
      totalShares: shares.length,
      shares,
    };
    await onSave(splitData);
    onClose();
  };

  const handleRemove = async () => {
    await onSave(null);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={type.h3}>Split Expense</Text>
              <Text style={type.caption}>Total Bill: {formatINR(totalAmountPaise)}</Text>
            </View>
            <ScalePressable onPress={onClose} style={styles.closeBtn}>
              <Icon name="close" size={20} color={colors.textSecondary} />
            </ScalePressable>
          </View>

          <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
            {/* Number of people selector */}
            <View style={{ marginBottom: space.md }}>
              <Text style={[type.label, { marginBottom: space.xs }]}>Split equally between:</Text>
              <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                {[2, 3, 4, 5].map((n) => (
                  <ScalePressable
                    key={n}
                    onPress={() => updatePersonCount(n)}
                    style={[
                      styles.pill,
                      numPeople === n && styles.pillActive,
                    ]}
                  >
                    <Text style={[type.bodyStrong, numPeople === n ? { color: colors.onPrimary } : { color: colors.text }]}>
                      {n} people
                    </Text>
                  </ScalePressable>
                ))}
              </View>
            </View>

            {/* Shares breakdown */}
            <View style={{ gap: space.sm }}>
              {shares.map((share, idx) => (
                <View key={share.id} style={styles.shareRow}>
                  <View style={{ flex: 1, gap: 2 }}>
                    {idx === 0 ? (
                      <Text style={type.bodyStrong}>You (Payer)</Text>
                    ) : (
                      <TextInput
                        value={share.personName}
                        onChangeText={(t) => updateName(share.id, t)}
                        placeholder="Friend name"
                        placeholderTextColor={colors.textMuted}
                        style={[type.bodyStrong, styles.nameInput]}
                      />
                    )}
                    <Text style={[type.caption, { color: colors.textSecondary }]}>
                      Share: {formatINR(share.amountPaise)}
                    </Text>
                  </View>

                  {idx !== 0 ? (
                    <ScalePressable
                      onPress={() => toggleSettled(share.id)}
                      style={[
                        styles.settleBtn,
                        share.isPaid ? styles.settledBtn : styles.unsettledBtn,
                      ]}
                    >
                      <Icon
                        name={share.isPaid ? 'checkmark-circle' : 'time-outline'}
                        size={16}
                        color={share.isPaid ? colors.primary : colors.warning}
                      />
                      <Text style={[type.caption, { color: share.isPaid ? colors.primary : colors.warning, fontWeight: '700' }]}>
                        {share.isPaid ? 'Settled' : 'Unpaid'}
                      </Text>
                    </ScalePressable>
                  ) : (
                    <View style={styles.settleBtn}>
                      <Icon name="checkmark-done" size={16} color={colors.primary} />
                      <Text style={[type.caption, { color: colors.primary, fontWeight: '700' }]}>Paid</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </ScrollView>

          <View style={{ gap: space.sm, marginTop: space.lg }}>
            <PrimaryButton label="Save Split" onPress={handleSave} />
            {currentSplit ? (
              <SecondaryButton label="Remove Split" variant="danger" onPress={handleRemove} />
            ) : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bgElevated, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: space.xl, borderWidth: 1, borderColor: colors.border },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md },
  closeBtn: { padding: space.xs },
  pill: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  shareRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.md, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  nameInput: { color: colors.text, paddingVertical: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong },
  settleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  settledBtn: { backgroundColor: 'rgba(52, 245, 180, 0.12)' },
  unsettledBtn: { backgroundColor: 'rgba(251, 191, 36, 0.12)' },
});
