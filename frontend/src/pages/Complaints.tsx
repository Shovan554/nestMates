import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  PlusIcon,
  ExclamationTriangleIcon,
  TrashIcon,
  CheckBadgeIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckSolid } from '@heroicons/react/24/solid'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { toast } from '../stores/toast'
import { confirmDialog } from '../components/ConfirmDialog'
import { SkeletonCard } from '../components/Skeleton'
import type {
  ApiEnvelope,
  Complaint,
  GroupMember,
  GroupPunishmentItem,
  GroupWithMembers,
  Punishment,
  StrikeCount,
} from '../lib/types'
import Card from '../components/Card'
import Modal from '../components/Modal'
import Avatar from '../components/Avatar'

function formatDate(s: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.valueOf())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

interface FileForm {
  filed_against: string
  reason: string
}

const EMPTY_FILE_FORM: FileForm = { filed_against: '', reason: '' }

export default function Complaints() {
  const { user } = useAuthStore()
  const [members, setMembers] = useState<GroupMember[]>([])
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [strikes, setStrikes] = useState<StrikeCount[]>([])
  const [punishments, setPunishments] = useState<Punishment[]>([])
  const [groupPunishments, setGroupPunishments] = useState<GroupPunishmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [fileOpen, setFileOpen] = useState(false)
  const [fileForm, setFileForm] = useState<FileForm>(EMPTY_FILE_FORM)
  const [filing, setFiling] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  const [punishOpen, setPunishOpen] = useState(false)
  const [newPunishment, setNewPunishment] = useState('')
  const [addingPunishment, setAddingPunishment] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [groupRes, complaintsRes, strikesRes, punishmentsRes, gpRes] = await Promise.all([
        api.get<ApiEnvelope<GroupWithMembers>>('/groups/me'),
        api.get<ApiEnvelope<Complaint[]>>('/complaints'),
        api.get<ApiEnvelope<StrikeCount[]>>('/strikes'),
        api.get<ApiEnvelope<Punishment[]>>('/punishments'),
        api.get<ApiEnvelope<GroupPunishmentItem[]>>('/group-punishments'),
      ])
      setMembers(groupRes.data.data?.members ?? [])
      if (complaintsRes.data.error) setError(complaintsRes.data.error)
      else setComplaints(complaintsRes.data.data ?? [])
      setStrikes(strikesRes.data.data ?? [])
      setPunishments(punishmentsRes.data.data ?? [])
      setGroupPunishments(gpRes.data.data ?? [])
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to load complaints'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filedByMe = useMemo(
    () => complaints.filter((c) => c.filed_by === user?.id),
    [complaints, user?.id],
  )
  const others = useMemo(
    () => complaints.filter((c) => c.filed_by !== user?.id),
    [complaints, user?.id],
  )

  const activePunishments = useMemo(
    () => punishments.filter((p) => !p.is_completed),
    [punishments],
  )

  function openFile() {
    setFileForm(EMPTY_FILE_FORM)
    setFileError(null)
    setFileOpen(true)
  }

  async function submitFile(e: FormEvent) {
    e.preventDefault()
    if (!fileForm.filed_against || fileForm.reason.trim().length < 10) {
      setFileError('Pick a roommate and write at least 10 characters.')
      return
    }
    setFiling(true)
    setFileError(null)
    try {
      const res = await api.post<ApiEnvelope<Complaint>>('/complaints', {
        filed_against: fileForm.filed_against,
        reason: fileForm.reason.trim(),
      })
      if (res.data.error || !res.data.data) {
        setFileError(res.data.error ?? 'Failed to file complaint')
        return
      }
      setComplaints((prev) => [res.data.data!, ...prev])
      const [strikesRes, punishmentsRes] = await Promise.all([
        api.get<ApiEnvelope<StrikeCount[]>>('/strikes'),
        api.get<ApiEnvelope<Punishment[]>>('/punishments'),
      ])
      setStrikes(strikesRes.data.data ?? [])
      setPunishments(punishmentsRes.data.data ?? [])
      setFileOpen(false)
    } catch (err: unknown) {
      setFileError(
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to file complaint',
      )
    } finally {
      setFiling(false)
    }
  }

  async function handleCompletePunishment(id: string) {
    try {
      const res = await api.patch<ApiEnvelope<Punishment>>(`/punishments/${id}/complete`)
      if (res.data.error || !res.data.data) {
        toast.error(res.data.error ?? 'Failed to mark complete')
        return
      }
      const updated = res.data.data
      setPunishments((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      toast.success('Punishment served — clean slate')
    } catch {
      toast.error('Failed to mark complete')
    }
  }

  async function addPunishment(e: FormEvent) {
    e.preventDefault()
    if (!newPunishment.trim()) return
    setAddingPunishment(true)
    try {
      const res = await api.post<ApiEnvelope<GroupPunishmentItem>>('/group-punishments', {
        description: newPunishment.trim(),
      })
      if (res.data.error || !res.data.data) {
        toast.error(res.data.error ?? 'Failed to add')
        return
      }
      setGroupPunishments((prev) =>
        [...prev, res.data.data!].sort((a, b) => a.description.localeCompare(b.description)),
      )
      setNewPunishment('')
      toast.success('Added to the punishment pool')
    } catch {
      toast.error('Failed to add')
    } finally {
      setAddingPunishment(false)
    }
  }

  async function removePunishment(id: string) {
    const ok = await confirmDialog({
      title: 'Remove this punishment option?',
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await api.delete<ApiEnvelope<unknown>>(`/group-punishments/${id}`)
      if (res.data.error) {
        toast.error(res.data.error)
        return
      }
      setGroupPunishments((prev) => prev.filter((p) => p.id !== id))
    } catch {
      toast.error('Failed to remove')
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-600 mb-1">
            Complaints
          </p>
          <h1 className="text-3xl font-bold text-gray-900">Strike tracker</h1>
        </div>
        <button
          onClick={openFile}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition shadow-sm shadow-primary-200"
        >
          <PlusIcon className="h-4 w-4" />
          File a complaint
        </button>
      </header>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <SkeletonCard rows={3} />
          <SkeletonCard rows={2} />
        </div>
      ) : (
        <>
          {activePunishments.length > 0 && (
            <Card eyebrow="Active punishments" title={`${activePunishments.length} pending`}>
              <ul className="space-y-2">
                {activePunishments.map((p) => {
                  const isMine = p.user_id === user?.id
                  return (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg border border-rose-200 bg-rose-50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          displayName={p.user_name ?? '?'}
                          avatarUrl={p.user_avatar}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {p.user_name}
                            {isMine && <span className="text-[10px] text-rose-500 ml-1.5">you</span>}
                          </p>
                          <p className="text-sm text-rose-700 mt-0.5">{p.description}</p>
                        </div>
                      </div>
                      {isMine && (
                        <button
                          onClick={() => handleCompletePunishment(p.id)}
                          className="text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 px-3 py-1.5 rounded-md inline-flex items-center gap-1 shrink-0"
                        >
                          <CheckBadgeIcon className="h-3.5 w-3.5" />
                          Mark done
                        </button>
                      )}
                    </li>
                  )
                })}
              </ul>
            </Card>
          )}

          <Card eyebrow="Strike tracker" title={`${members.length} ${members.length === 1 ? 'member' : 'members'}`}>
            <ul className="space-y-2">
              {strikes.map((s) => (
                <li
                  key={s.user_id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <Avatar displayName={s.display_name} avatarUrl={s.avatar_url} size="sm" />
                    <span className="text-sm font-medium text-gray-900">
                      {s.display_name}
                      {s.user_id === user?.id && (
                        <span className="text-[10px] text-gray-400 ml-1.5">you</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className={`text-base ${
                          i < (s.strike_count % 3 || (s.strike_count > 0 ? 3 : 0))
                            ? 'opacity-100'
                            : 'opacity-20 grayscale'
                        }`}
                        aria-hidden
                      >
                        ⚡
                      </span>
                    ))}
                    <span className="text-xs text-gray-500 ml-1">×{s.strike_count}</span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card
              eyebrow="Filed by you"
              title={`${filedByMe.length} ${filedByMe.length === 1 ? 'complaint' : 'complaints'}`}
            >
              <ComplaintList items={filedByMe} side="filer" />
            </Card>

            <Card
              eyebrow="Filed by others"
              title={`${others.length} ${others.length === 1 ? 'complaint' : 'complaints'}`}
            >
              <ComplaintList items={others} side="against" />
            </Card>
          </div>

          <Card
            eyebrow="Punishment pool"
            title={`${groupPunishments.length} options`}
            action={
              <button
                onClick={() => setPunishOpen(true)}
                className="text-xs font-medium text-primary-700 hover:underline"
              >
                Edit pool
              </button>
            }
          >
            <p className="text-xs text-gray-500 mb-3">
              When someone hits 3 strikes, a punishment is randomly drawn from this pool.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {groupPunishments.map((p) => (
                <li
                  key={p.id}
                  className="text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded-full px-3 py-1"
                >
                  {p.description}
                </li>
              ))}
              {groupPunishments.length === 0 && (
                <li className="text-xs text-gray-400">No custom punishments yet.</li>
              )}
            </ul>
          </Card>

          {punishments.some((p) => p.is_completed) && (
            <Card
              eyebrow="Punishment history"
              title={`${punishments.filter((p) => p.is_completed).length} completed`}
            >
              <ul className="space-y-2">
                {punishments
                  .filter((p) => p.is_completed)
                  .map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-gray-50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          displayName={p.user_name ?? '?'}
                          avatarUrl={p.user_avatar}
                          size="sm"
                        />
                        <div>
                          <p className="text-sm text-gray-700">
                            {p.user_name} · {p.description}
                          </p>
                          <p className="text-xs text-gray-400">
                            Done {formatDate(p.completed_at)}
                          </p>
                        </div>
                      </div>
                      <CheckSolid className="h-4 w-4 text-accent-500 shrink-0" />
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <Modal
        open={fileOpen}
        onClose={() => setFileOpen(false)}
        title="File a complaint"
        footer={
          <>
            <button
              type="button"
              onClick={() => setFileOpen(false)}
              className="px-3.5 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="file-complaint-form"
              disabled={filing || !fileForm.filed_against || fileForm.reason.trim().length < 10}
              className="px-3.5 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 rounded-lg shadow-sm shadow-primary-200"
            >
              {filing ? 'Filing…' : 'File complaint'}
            </button>
          </>
        }
      >
        <form id="file-complaint-form" onSubmit={submitFile} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Roommate</label>
            <select
              required
              value={fileForm.filed_against}
              onChange={(e) => setFileForm({ ...fileForm, filed_against: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
            >
              <option value="">Pick a roommate</option>
              {members
                .filter((m) => m.id !== user?.id)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.display_name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              What happened?{' '}
              <span className="text-gray-400 font-normal">(min 10 characters)</span>
            </label>
            <textarea
              required
              minLength={10}
              maxLength={2000}
              rows={4}
              value={fileForm.reason}
              onChange={(e) => setFileForm({ ...fileForm, reason: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition resize-none"
              placeholder="They left dishes in the sink for a week again..."
            />
            <p className="text-xs text-gray-400 mt-1">
              {fileForm.reason.trim().length}/10 minimum
            </p>
          </div>
          <div className="text-xs text-gray-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2.5">
            <ExclamationTriangleIcon className="h-4 w-4 inline -mt-0.5 mr-1 text-amber-600" />
            Heads up: 3 complaints = 1 strike, 3 strikes = a punishment.
          </div>

          {fileError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {fileError}
            </div>
          )}
        </form>
      </Modal>

      <Modal
        open={punishOpen}
        onClose={() => setPunishOpen(false)}
        title="Punishment pool"
        footer={
          <button
            type="button"
            onClick={() => setPunishOpen(false)}
            className="px-3.5 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg"
          >
            Close
          </button>
        }
      >
        <div className="space-y-3">
          <ul className="space-y-1.5 max-h-60 overflow-y-auto">
            {groupPunishments.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-gray-50"
              >
                <span className="text-sm text-gray-800">{p.description}</span>
                <button
                  onClick={() => removePunishment(p.id)}
                  className="p-1 text-gray-400 hover:text-rose-600 rounded-md transition"
                  aria-label="Remove"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </li>
            ))}
            {groupPunishments.length === 0 && (
              <li className="text-sm text-gray-400 text-center py-3">No options yet.</li>
            )}
          </ul>

          <form onSubmit={addPunishment} className="flex gap-2 pt-2 border-t border-gray-100">
            <input
              required
              minLength={2}
              maxLength={200}
              value={newPunishment}
              onChange={(e) => setNewPunishment(e.target.value)}
              placeholder="Add a punishment idea…"
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition text-sm"
            />
            <button
              type="submit"
              disabled={addingPunishment || !newPunishment.trim()}
              className="px-3.5 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 rounded-lg shadow-sm shadow-primary-200"
            >
              Add
            </button>
          </form>
        </div>
      </Modal>
    </div>
  )
}

function ComplaintList({ items, side }: { items: Complaint[]; side: 'filer' | 'against' }) {
  if (items.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-sm text-gray-500">Nothing here.</p>
      </div>
    )
  }
  return (
    <ul className="space-y-2.5">
      {items.map((c) => (
        <li key={c.id} className="p-3 rounded-lg border border-gray-100 bg-white">
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {side === 'filer' ? (
                <>
                  <span>You filed against</span>
                  <Avatar
                    displayName={c.filed_against_name ?? '?'}
                    avatarUrl={c.filed_against_avatar}
                    size="sm"
                  />
                  <span className="font-medium text-gray-700">{c.filed_against_name}</span>
                </>
              ) : (
                <>
                  <Avatar
                    displayName={c.filed_by_name ?? '?'}
                    avatarUrl={c.filed_by_avatar}
                    size="sm"
                  />
                  <span className="font-medium text-gray-700">{c.filed_by_name}</span>
                  <span>→</span>
                  <Avatar
                    displayName={c.filed_against_name ?? '?'}
                    avatarUrl={c.filed_against_avatar}
                    size="sm"
                  />
                  <span className="font-medium text-gray-700">{c.filed_against_name}</span>
                </>
              )}
            </div>
            <span className="text-[11px] text-gray-400 shrink-0">{formatDate(c.created_at)}</span>
          </div>
          <p className="text-sm text-gray-700 italic">"{c.reason}"</p>
        </li>
      ))}
    </ul>
  )
}
