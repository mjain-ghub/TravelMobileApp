export const colors = {
  primary: '#0B5563',
  primaryDark: '#083D47',
  primarySoft: '#E2F1F4',
  accent: '#F2994A',
  bg: '#F4F7F9',
  card: '#FFFFFF',
  text: '#14232B',
  muted: '#5B6B75',
  border: '#DCE4E9',
  danger: '#C0392B',
  dangerSoft: '#FBE9E7',
  warn: '#9A6700',
  warnSoft: '#FFF4D6',
  ok: '#1E8E5A',
  okSoft: '#E3F5EC',
  info: '#2563EB',
  infoSoft: '#E6EEFF',
  native: '#6D3FC7', // used to colour-code the two integration methods everywhere
  nativeSoft: '#EFE8FB',
  webview: '#B45309',
  webviewSoft: '#FDEBD3',
};

export const radius = 14;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };

export const formatMoney = (cents: number, currency = 'USD') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);

export const formatDuration = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
