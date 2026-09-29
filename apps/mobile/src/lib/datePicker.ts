import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';

/** Opens the native Android date dialog. Resolves null when dismissed. */
export function pickDate(value: Date, opts: { min?: Date; max?: Date } = {}): Promise<Date | null> {
  if (Platform.OS !== 'android') return Promise.resolve(null);
  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      minimumDate: opts.min,
      maximumDate: opts.max,
      onChange: (event, date) => resolve(event.type === 'set' && date ? date : null),
    });
  });
}
