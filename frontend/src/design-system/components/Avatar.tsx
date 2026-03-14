import type { ImgHTMLAttributes } from 'react';
import './Avatar.css';

export type AvatarVariant = 'user' | 'ai';
export type AvatarSize = 'sm' | 'md' | 'lg';
export type AvatarStatus = 'online' | 'offline' | 'busy';

export interface AvatarProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'size'> {
  variant?: AvatarVariant;
  size?: AvatarSize;
  name?: string;
  status?: AvatarStatus;
  src?: string;
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function Avatar({
  variant = 'user',
  size = 'md',
  name,
  status,
  src,
  alt,
  className,
  ...rest
}: AvatarProps) {
  const classes = [
    'ds-avatar',
    `ds-avatar--${variant}`,
    `ds-avatar--${size}`,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const label = alt ?? name ?? (variant === 'ai' ? 'ZenAI' : 'Avatar');

  return (
    <div className={classes} aria-label={label} role="img">
      {variant === 'ai' ? (
        <span className="ds-avatar__ai" aria-hidden="true">Z</span>
      ) : src ? (
        <img
          className="ds-avatar__image"
          src={src}
          alt={label}
          {...rest}
        />
      ) : (
        <span className="ds-avatar__initials" aria-hidden="true">
          {name ? getInitials(name) : '?'}
        </span>
      )}
      {status && (
        <span
          className={`ds-avatar__status ds-avatar__status--${status}`}
          aria-label={status}
        />
      )}
    </div>
  );
}
