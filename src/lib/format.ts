const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
})

export function formatUsd(amount: number) {
  return usd.format(amount)
}

export function formatUsdNumber(amount: number) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatUsdWholeNumberUp(amount: number) {
  const whole =
    amount > 0 ? Math.ceil(amount - 1e-9) : amount < 0 ? Math.ceil(amount) : 0
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(whole)
}

export function formatUsdWhole(amount: number) {
  return formatWholeUsd(Math.round(amount))
}

export function formatUsdWholeUp(amount: number) {
  if (amount > 0) return formatWholeUsd(Math.ceil(amount - 1e-9))
  if (amount < 0) return formatWholeUsd(Math.ceil(amount))
  return formatWholeUsd(0)
}

function formatWholeUsd(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatLongDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatShortDate(iso: string) {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateWithoutYear(
  iso: string,
  month: 'long' | 'short' = 'long',
) {
  const [year, monthNum, day] = iso.split('-').map(Number)
  return new Date(year, monthNum - 1, day).toLocaleDateString('en-US', {
    month,
    day: 'numeric',
  })
}
