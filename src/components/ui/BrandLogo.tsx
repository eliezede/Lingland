import React from 'react';

type BrandLogoVariant = 'mark' | 'wordmark';
type BrandLogoTone = 'dark' | 'light' | 'inherit';
type BrandLogoSize = 'sm' | 'md' | 'lg' | 'xl';

interface BrandLogoProps {
  variant?: BrandLogoVariant;
  tone?: BrandLogoTone;
  size?: BrandLogoSize;
  className?: string;
  decorative?: boolean;
}

const markSizeClasses: Record<BrandLogoSize, string> = {
  sm: 'h-9 w-10',
  md: 'h-11 w-12',
  lg: 'h-14 w-16',
  xl: 'h-20 w-24',
};

const wordmarkSizeClasses: Record<BrandLogoSize, {
  root: string;
  mark: string;
  name: string;
  tagline: string;
}> = {
  sm: {
    root: 'gap-2',
    mark: 'h-9 w-10',
    name: 'text-lg',
    tagline: 'text-[8px]',
  },
  md: {
    root: 'gap-2.5',
    mark: 'h-11 w-12',
    name: 'text-xl',
    tagline: 'text-[9px]',
  },
  lg: {
    root: 'gap-3',
    mark: 'h-14 w-16',
    name: 'text-3xl',
    tagline: 'text-[11px]',
  },
  xl: {
    root: 'gap-4',
    mark: 'h-20 w-24',
    name: 'text-4xl',
    tagline: 'text-sm',
  },
};

const toneClasses: Record<BrandLogoTone, string> = {
  dark: 'text-slate-950',
  light: 'text-white',
  inherit: '',
} as const;

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'wordmark',
  tone = 'dark',
  size = 'md',
  className = '',
  decorative = false,
}) => {
  if (variant === 'mark') {
    return (
      <img
        src="/brand/lingland-mark.png"
        alt={decorative ? '' : 'Lingland'}
        aria-hidden={decorative || undefined}
        className={`block object-contain ${markSizeClasses[size]} ${className}`}
        draggable={false}
        decoding="async"
      />
    );
  }

  const sizing = wordmarkSizeClasses[size];

  return (
    <span
      aria-hidden={decorative || undefined}
      className={`brand-wordmark flex w-fit items-center ${sizing.root} ${toneClasses[tone]} ${className}`}
    >
      <img
        src="/brand/lingland-mark.png"
        alt=""
        aria-hidden="true"
        className={`block shrink-0 object-contain ${sizing.mark}`}
        draggable={false}
        decoding="async"
      />
      <span className="flex min-w-0 flex-col justify-center text-current">
        <span className={`${sizing.name} whitespace-nowrap font-semibold leading-none tracking-normal`}>
          Lingland
        </span>
        <span className={`${sizing.tagline} mt-1 whitespace-nowrap font-medium leading-none tracking-normal opacity-70`}>
          Interpreters and Translators
        </span>
      </span>
    </span>
  );
};
