import { useState, type FormEvent } from 'react'

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
        <h1 className="font-heading text-center text-2xl font-medium">
          Mybudget
        </h1>

        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          aria-label="Email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          minLength={6}
          required
          aria-label="Password"
          placeholder="Password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={busy != null}>
          {busy === 'in' ? 'Logging in…' : 'Login'}
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
