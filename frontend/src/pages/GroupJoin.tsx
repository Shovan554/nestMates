import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { ApiEnvelope, Group } from '../lib/types'
import AuthLayout from '../components/AuthLayout'

const CODE_LENGTH = 6

export default function GroupJoin() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function onCodeChange(value: string) {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH)
    setCode(cleaned)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (code.length !== CODE_LENGTH) {
      setError(`Invite code must be ${CODE_LENGTH} characters`)
      return
    }
    setError(null)
    setSubmitting(true)
    try {
      const res = await api.post<ApiEnvelope<Group>>('/groups/join', { invite_code: code })
      if (res.data.error || !res.data.data) {
        setError(res.data.error ?? 'Failed to join group')
        return
      }
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to join group'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Join a household"
      subtitle="Enter the 6-character invite code from your roommate."
      footer={
        <>
          Don't have one yet?{' '}
          <Link to="/group/create" className="text-primary-600 font-semibold hover:text-primary-700">
            Create a household
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Invite code</label>
          <input
            type="text"
            required
            value={code}
            onChange={(e) => onCodeChange(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-white text-2xl font-mono tracking-[0.5em] uppercase text-center text-gray-900 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
            placeholder="ABCD12"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs text-gray-400 mt-1.5 text-center">
            {code.length}/{CODE_LENGTH}
          </p>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || code.length !== CODE_LENGTH}
          className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white font-semibold py-2.5 rounded-lg transition shadow-sm shadow-primary-200"
        >
          {submitting ? 'Joining…' : 'Join household'}
        </button>
      </form>
    </AuthLayout>
  )
}
