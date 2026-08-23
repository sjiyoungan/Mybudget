import { useState, type FormEvent } from 'react'
import { Wallet } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth-context'

export function LoginPage() {
  const { signIn, signUp } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'in' | 'up' | null>(null)

  async function submit(mode: 'in' | 'up') {
    if (!email.trim() || password.length < 6) {
      setError('Enter an email and a password of at least 6 characters.')
      return
    }
    setError(null)
    setBusy(mode)
    const action = mode === 'in' ? signIn : signUp
    const message = await action(email.trim(), password)
    setBusy(null)
    if (message) setError(message)
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submit('in')
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-6">
      <form className="grid w-full max-w-sm gap-4" onSubmit={onSubmit}>
        <div className="grid justify-items-center gap-2 text-center">
          <Wallet className="size-6" />
          <h1 className="font-heading text-2xl font-medium">Mybudget</h1>
          <p className="text-muted-foreground text-sm">
            Sign in once. Stay signed in on this device, and use the same email
            on any other device to see the same paystubs.
          </p>
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="grid gap-1.5">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            minLength={6}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={busy != null}>
          {busy === 'in' ? 'Signing in…' : 'Sign in'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy != null}
          onClick={() => void submit('up')}
        >
          {busy === 'up' ? 'Creating…' : 'Create account'}
        </Button>
      </form>
    </div>
  )
}
