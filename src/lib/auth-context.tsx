import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session, User } from '@supabase/supabase-js'

import { supabase } from '@/lib/supabase'

type AuthContextValue = {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string) => Promise<string | null>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function friendlyAuthError(message: string) {
  if (/email not confirmed/i.test(message)) {
    return 'Confirm the email link first, then sign in. In Supabase you can also turn off Confirm email.'
  }
  if (/invalid login credentials/i.test(message)) {
    return 'That email or password is incorrect.'
  }
  if (/already registered/i.test(message)) {
    return 'That email already has an account. Sign in instead.'
  }
  if (/password/i.test(message) && /at least/i.test(message)) {
    return 'Use a password with at least 6 characters.'
  }
  return message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    let cancelled = false

    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      async signIn(email, password) {
        if (!supabase) return 'Supabase is not configured.'
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        return error ? friendlyAuthError(error.message) : null
      },
      async signUp(email, password) {
        if (!supabase) return 'Supabase is not configured.'
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
        })
        if (error) return friendlyAuthError(error.message)
        if (!data.session) {
          return 'Account created. Confirm the email link, then sign in. To skip that, turn off Confirm email in Supabase Auth settings.'
        }
        return null
      },
    }),
    [loading, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
