import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { messages } from '../lib/messages.js';

const I18nContext = createContext(null);

function interpolate(text, values) {
  if (!values) return text;
  return String(text).replace(/\{(\w+)\}/g, (match, key) =>
    values[key] === undefined || values[key] === null ? match : String(values[key])
  );
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => (localStorage.getItem('hisab_language') === 'ur' ? 'ur' : 'en'));

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.classList.toggle('lang-ur', lang === 'ur');
    localStorage.setItem('hisab_language', lang);
  }, [lang]);

  const setLang = useCallback((next) => {
    setLangState(next === 'ur' ? 'ur' : 'en');
  }, []);

  const t = useCallback(
    (key, values) => {
      const dictionary = messages[lang] || messages.en;
      const text = dictionary[key] ?? messages.en[key] ?? key;
      return interpolate(text, values);
    },
    [lang]
  );

  const value = useMemo(
    () => ({ lang, setLang, t, isUrdu: lang === 'ur', toggleLanguage: () => setLang(lang === 'ur' ? 'en' : 'ur') }),
    [lang, setLang, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider');
  return context;
}
