import React from 'react';
import { SUPPORTED_LOCALES, Locale } from '../i18n';
import { useI18n } from '../i18n';

const containerStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
};

const selectStyle: React.CSSProperties = {
  background: 'rgba(255, 255, 255, 0.06)',
  color: 'rgba(255, 255, 255, 0.9)',
  border: '1px solid rgba(255, 255, 255, 0.12)',
  borderRadius: '8px',
  padding: '8px 12px',
  fontSize: '14px',
  cursor: 'pointer',
  outline: 'none',
  appearance: 'none',
  WebkitAppearance: 'none',
  MozAppearance: 'none',
  paddingRight: '28px',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='rgba(255,255,255,0.6)' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 8px center',
};

const labelStyle: React.CSSProperties = {
  fontSize: '14px',
  color: 'rgba(255, 255, 255, 0.6)',
};

export function LanguageSelector() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="language-selector" style={containerStyle}>
      <label htmlFor="language-selector" style={labelStyle}>
        {t('settings.language')}
      </label>
      <select
        id="language-selector"
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        style={selectStyle}
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.flag} {l.label}
          </option>
        ))}
      </select>
    </div>
  );
}
