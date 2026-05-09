import axios from 'axios'
import { supabase } from './supabase'

const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export const api = axios.create({
  baseURL: `${baseURL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  } else if (import.meta.env.DEV) {
    console.warn('[api] no Supabase session — request will be sent without Authorization header', config.url)
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status
    const config = error.config as (typeof error.config & { __retried?: boolean }) | undefined
    const url: string = config?.url ?? ''

    if (status === 401 && config && !url.includes('/auth/welcome') && !config.__retried) {
      config.__retried = true
      try {
        const { data, error: refreshError } = await supabase.auth.refreshSession()
        const token = data.session?.access_token
        if (!refreshError && token) {
          config.headers = config.headers ?? {}
          ;(config.headers as Record<string, string>).Authorization = `Bearer ${token}`
          return api.request(config)
        }
      } catch {
        /* fall through to sign-out */
      }

      try {
        await supabase.auth.signOut()
      } catch {
        /* ignore */
      }
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  },
)
