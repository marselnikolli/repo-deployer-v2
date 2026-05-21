import { cx } from '@/utils/cx'

interface CategoryBadgeProps {
  category: string
}

const categoryColors: Record<string, { bg: string; text: string }> = {
  security:  { bg: 'bg-[var(--color-error-50)]',   text: 'text-[var(--color-error-700)]'   },
  ci_cd:     { bg: 'bg-[var(--color-purple-50)]',  text: 'text-[var(--color-purple-700)]'  },
  database:  { bg: 'bg-[var(--color-success-50)]', text: 'text-[var(--color-success-700)]' },
  devops:    { bg: 'bg-[var(--color-orange-50)]',  text: 'text-[var(--color-orange-700)]'  },
  api:       { bg: 'bg-[var(--color-brand-50)]',   text: 'text-[var(--color-brand-700)]'   },
  frontend:  { bg: 'bg-[var(--color-pink-50)]',    text: 'text-[var(--color-pink-700)]'    },
  backend:   { bg: 'bg-[var(--color-indigo-50)]',  text: 'text-[var(--color-indigo-700)]'  },
  ml_ai:     { bg: 'bg-[var(--color-warning-50)]', text: 'text-[var(--color-warning-700)]' },
  default:   { bg: 'bg-[var(--color-gray-100)]',   text: 'text-[var(--color-gray-700)]'    },
}

export function CategoryBadge({ category }: CategoryBadgeProps) {
  const colors = categoryColors[category] ?? categoryColors.default
  return (
    <span
      className={cx(
        'inline-block px-2.5 py-1 text-[length:var(--text-xs)] font-medium rounded-[var(--radius-full)] capitalize',
        colors.bg,
        colors.text,
      )}
    >
      {category.replace('_', ' ')}
    </span>
  )
}
