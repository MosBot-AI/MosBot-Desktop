import type { ReactElement } from 'react';

export interface IconProps {
  readonly size?: number;
  readonly className?: string | undefined;
}

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function IconSearch({ size = 16, className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} {...base}>
      <circle cx="7" cy="7" r="4.4" />
      <path d="m10.4 10.4 3.1 3.1" />
    </svg>
  );
}

export function IconPlus({ size = 16, className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} {...base}>
      <path d="M8 3.2v9.6M3.2 8h9.6" />
    </svg>
  );
}

export function IconChevronDown({ size = 14, className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} {...base}>
      <path d="m4 6.2 4 4 4-4" />
    </svg>
  );
}

export function IconChevronRight({ size = 14, className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} {...base}>
      <path d="m6.2 4 4 4-4 4" />
    </svg>
  );
}

export function IconChevronUp({ size = 14, className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} {...base}>
      <path d="m4 9.8 4-4 4 4" />
    </svg>
  );
}

export function IconSend({ size = 16, className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} {...base}>
      <path d="M8 12.5v-9M4.4 6.9 8 3.3l3.6 3.6" />
    </svg>
  );
}

export function IconStop({ size = 16, className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} {...base}>
      <rect x="5" y="5" width="6" height="6" rx="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconClose({ size = 16, className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} {...base}>
      <path d="m4.4 4.4 7.2 7.2M11.6 4.4l-7.2 7.2" />
    </svg>
  );
}

export function IconCheck({ size = 16, className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} {...base}>
      <path d="m3.6 8.4 2.9 2.9 5.9-6.2" />
    </svg>
  );
}

export function IconWarning({ size = 16, className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} {...base}>
      <path d="M8 2.9 14 13H2z" />
      <path d="M8 6.6v3.1M8 11.3h.01" />
    </svg>
  );
}

export function IconMenu({ size = 16, className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} {...base}>
      <path d="M2.8 4.6h10.4M2.8 8h10.4M2.8 11.4h10.4" />
    </svg>
  );
}

export function IconPinned({ size = 14, className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} {...base}>
      <path d="M6 2.8h4l-.6 3.3 2 2.1H4.6l2-2.1z" />
      <path d="M8 8.2v4.6" />
    </svg>
  );
}

export function IconPaperclip({ size = 16, className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} {...base}>
      <path d="M10.6 5.2 6 9.8a1.6 1.6 0 0 0 2.3 2.3l4.6-4.6a3 3 0 0 0-4.2-4.2L3.9 8a4.1 4.1 0 0 0 5.8 5.8l2.8-2.8" />
    </svg>
  );
}
