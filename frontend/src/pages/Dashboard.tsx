import { useEffect, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import {
  CheckCircleIcon,
  ClockIcon,
  ArrowDownCircleIcon,
  ArrowUpCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline'
import { api } from '../lib/api'
import type { ApiEnvelope, DashboardData, Profile } from '../lib/types'
import { useAuthStore } from '../stores/auth'
import Card from '../components/Card'
import Avatar from '../components/Avatar'
import Skeleton, { SkeletonCard } from '../components/Skeleton'

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDueDate(d: string | null): string | null {
  if (!d) return null
  const dt = new Date(d)
  if (isNaN(dt.valueOf())) return null
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const [me, setMe] = useState<Profile | null>(null)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [meRes, dashRes] = await Promise.all([
          api.get<ApiEnvelope<Profile>>('/me'),
          api.get<ApiEnvelope<DashboardData>>('/dashboard'),
        ])
        if (cancelled) return
        if (meRes.data.error) setError(meRes.data.error)
        else setMe(meRes.data.data)
        if (dashRes.data.error) setError(dashRes.data.error)
        else setData(dashRes.data.data)
      } catch (err: unknown) {
        if (cancelled) return
        const msg =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Failed to load dashboard'
        setError(msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-9 w-64" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <SkeletonCard rows={1} />
          <SkeletonCard rows={1} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <SkeletonCard rows={3} />
          <SkeletonCard rows={3} />
        </div>
      </div>
    )
  }

  if (me && !me.group_id) {
    return <Navigate to="/group/create" replace />
  }

  async function copyInvite() {
    if (!data) return
    try {
      await navigator.clipboard.writeText(data.group_invite_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  const greetingName = me?.display_name || user?.email?.split('@')[0] || 'there'

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-gray-500">
            {data?.group_name && (
              <>
                <span className="font-medium text-primary-700">{data.group_name}</span> · welcome
                back
              </>
            )}
          </p>
          <h1 className="text-3xl font-bold text-gray-900 mt-1">Hey {greetingName} 👋</h1>
        </div>
        {data && (
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              Invite code
            </span>
            <div className="flex items-center gap-2">
              <code className="px-3 py-1.5 bg-primary-50 text-primary-700 rounded-lg font-mono font-bold tracking-[0.3em] text-sm border border-primary-100">
                {data.group_invite_code}
              </code>
              <button
                onClick={copyInvite}
                className="px-2.5 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 rounded-lg border border-primary-200 transition"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}
      </header>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card eyebrow="What I owe" className="bg-gradient-to-br from-rose-50 to-white border-rose-100">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-rose-100 flex items-center justify-center">
                  <ArrowUpCircleIcon className="h-6 w-6 text-rose-600" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900 leading-tight">
                    {formatMoney(data.i_owe)}
                  </p>
                  <Link to="/bills" className="text-xs text-rose-700 font-medium hover:underline">
                    View bills →
                  </Link>
                </div>
              </div>
            </Card>

            <Card eyebrow="Owed to me" className="bg-gradient-to-br from-accent-50 to-white border-accent-100">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-accent-100 flex items-center justify-center">
                  <ArrowDownCircleIcon className="h-6 w-6 text-accent-700" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900 leading-tight">
                    {formatMoney(data.owed_to_me)}
                  </p>
                  <Link to="/bills" className="text-xs text-accent-700 font-medium hover:underline">
                    View bills →
                  </Link>
                </div>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card
              eyebrow="Your tasks"
              title={`${data.my_chores.length} active`}
              action={
                <Link to="/chores" className="text-xs font-medium text-primary-700 hover:underline">
                  All chores →
                </Link>
              }
            >
              {data.my_chores.length === 0 ? (
                <EmptyState
                  icon={<CheckCircleIcon className="h-8 w-8 text-accent-500" />}
                  title="You're all caught up"
                  hint="Add chores from the Chores page."
                />
              ) : (
                <ul className="space-y-2">
                  {data.my_chores.slice(0, 5).map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start justify-between gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      <span className="font-medium text-gray-800 text-sm">{c.title}</span>
                      {formatDueDate(c.due_date) && (
                        <span className="text-xs text-gray-500 inline-flex items-center gap-1 shrink-0">
                          <ClockIcon className="h-3.5 w-3.5" />
                          {formatDueDate(c.due_date)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card
              eyebrow="Roommate tasks"
              title={`${data.roommate_chores.length} pending`}
            >
              {data.roommate_chores.length === 0 ? (
                <EmptyState
                  icon={<CheckCircleIcon className="h-8 w-8 text-gray-300" />}
                  title="Nothing pending"
                  hint="Tasks assigned to others will show up here."
                />
              ) : (
                <ul className="space-y-2">
                  {data.roommate_chores.slice(0, 5).map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start justify-between gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{c.title}</p>
                        {c.assignee_name && (
                          <p className="text-xs text-gray-500 mt-0.5">{c.assignee_name}</p>
                        )}
                      </div>
                      {formatDueDate(c.due_date) && (
                        <span className="text-xs text-gray-500 inline-flex items-center gap-1 shrink-0">
                          <ClockIcon className="h-3.5 w-3.5" />
                          {formatDueDate(c.due_date)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card
            eyebrow="Roommates"
            title={`${data.roommate_status.length} ${
              data.roommate_status.length === 1 ? 'member' : 'members'
            }`}
          >
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {data.roommate_status.map((m) => {
                const dotColor =
                  m.active_chores === 0
                    ? 'bg-accent-500'
                    : m.active_chores < 3
                    ? 'bg-warm-300'
                    : 'bg-rose-500'
                return (
                  <li
                    key={m.user_id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-gray-50"
                  >
                    <div className="relative">
                      <Avatar displayName={m.display_name} avatarUrl={m.avatar_url} size="md" />
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white ${dotColor}`}
                        title={`${m.active_chores} active chore${m.active_chores === 1 ? '' : 's'}`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">
                        {m.display_name}
                        {m.user_id === user?.id && (
                          <span className="ml-1.5 text-[10px] text-gray-400 font-normal">you</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {m.active_chores} active chore{m.active_chores === 1 ? '' : 's'}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </Card>

          <Card
            eyebrow="Strikes"
            title={data.strikes.length > 0 ? 'Watch list' : 'All clear'}
            action={
              <Link
                to="/complaints"
                className="text-xs font-medium text-primary-700 hover:underline"
              >
                Complaints →
              </Link>
            }
          >
            {data.strikes.length === 0 ? (
              <EmptyState
                icon={<ExclamationTriangleIcon className="h-8 w-8 text-accent-500" />}
                title="No strikes in this household"
                hint="Stay friendly. 3 complaints = 1 strike, 3 strikes = a punishment."
              />
            ) : (
              <ul className="space-y-2">
                {data.strikes.map((s) => (
                  <li
                    key={s.user_id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-rose-100 bg-rose-50/40"
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900 text-sm">{s.display_name}</span>
                      <span className="inline-flex items-center gap-1 text-amber-600 text-xs">
                        {Array.from({ length: Math.min(s.strike_count, 3) }).map((_, i) => (
                          <span key={i}>⚡</span>
                        ))}
                        <span className="text-gray-500 ml-1">×{s.strike_count}</span>
                      </span>
                    </div>
                    {s.active_punishment && (
                      <span className="text-xs font-medium text-rose-700 bg-white border border-rose-200 px-2 py-1 rounded-md">
                        {s.active_punishment}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode
  title: string
  hint: string
}) {
  return (
    <div className="text-center py-6">
      <div className="flex justify-center mb-3">{icon}</div>
      <p className="font-medium text-gray-900 text-sm">{title}</p>
      <p className="text-xs text-gray-500 mt-1">{hint}</p>
    </div>
  )
}
