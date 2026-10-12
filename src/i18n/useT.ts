import { useMemo } from 'react';
import { useEditor } from '../editor/store';
import { translator } from './i18n';

export function useT() {
  const language = useEditor((s) => s.language);
  return useMemo(() => translator(language), [language]);
}
