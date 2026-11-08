import type { ButtonHTMLAttributes } from 'react';
import { Icon, type IconName } from './Icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'ghost'; small?: boolean; icon?: IconName }

export function Button({ variant = 'ghost', small, icon, children, ...rest }: ButtonProps) {
  return <button {...rest} className={`btn btn-${variant}${small ? ' btn-sm' : ''}`}>{icon && <Icon name={icon} />}{children}</button>;
}
