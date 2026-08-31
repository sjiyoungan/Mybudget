import { Children, Fragment, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

export function MetricStrip({
  className,
  columns,
  children,
}: {
  className?: string
  columns?: 3 | 4
  children: ReactNode
}) {
  const items = Children.toArray(children)

  return (
    <section
      className={cn(
        'metric-grid',
        columns === 3 && 'metric-cols-3',
        className,
      )}
    >
      {items.map((child, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <span className="metric-rule" aria-hidden />
          ) : null}
          {child}
        </Fragment>
      ))}
      {items.length > 0 ? (
        <span className="metric-rule" aria-hidden />
      ) : null}
    </section>
  )
}
