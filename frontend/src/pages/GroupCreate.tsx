import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import type { ApiEnvelope, Group } from '../lib/types'
import AuthLayout from '../components/AuthLayout'

export default function GroupCreate() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const res = await api.post<ApiEnvelope<Group>>('/groups', { name: name.trim() })
      if (res.data.error || !res.data.data) {
        setError(res.data.error ?? 'Failed to create group')
        return
      }
      navigate('/dashboard', { replace: true })
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to create group'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Set up your household"
      subtitle="Give your shared space a name. You'll get an invite code to share with roommates."
      footer={
        <>
          Already have an invite code?{' '}
          <Link to="/group/join" className="text-primary-600 font-semibold hover:text-primary-700">
            Join a household
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Household name</label>
          <input
            type="text"
            required
            minLength={1}
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
            placeholder="The Lake St. Loft"
          />
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !name.trim()}
          className="w-full bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white font-semibold py-2.5 rounded-lg transition shadow-sm shadow-primary-200"
        >
          {submitting ? 'Creating…' : 'Create household'}
        </button>
      </form>
    </AuthLayout>
  )
}
