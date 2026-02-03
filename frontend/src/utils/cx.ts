import { extendTailwindMerge } from 'tailwind-merge'
import { clsx, type ClassValue } from 'clsx'

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        'text-xs',
        'text-sm',
        'text-md',
        'text-lg',
        'text-xl',
        'text-display-xs',
        'text-display-sm',
        'text-display-md',
        'text-display-lg',
        'text-display-xl',
        'text-display-2xl',
      ],
    },
  },
})

export function cx(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
