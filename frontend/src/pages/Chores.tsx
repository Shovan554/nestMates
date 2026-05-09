import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  CheckCircleIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  ClockIcon,
  SparklesIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckSolid } from '@heroicons/react/24/solid'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { toast } from '../stores/toast'
import { confirmDialog } from '../components/ConfirmDialog'
import type { ApiEnvelope, Chore, GroupMember, GroupWithMembers } from '../lib/types'
import Card from '../components/Card'
import Modal from '../components/Modal'
import Avatar from '../components/Avatar'
import { SkeletonRow } from '../components/Skeleton'

type Filter = 'all' | 'mine' | 'unassigned' | 'completed'

interface ChoreFormState {
  title: string
  description: string
  due_date: string
  assigned_to: string
}

const EMPTY_FORM: ChoreFormState = {
  title: '',
  description: '',
  due_date: '',
  assigned_to: '',
}

function formatDate(s: string | null): string | null {
  if (!s) return null
  const d = new Date(s)
  if (isNaN(d.valueOf())) return null
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function formatDateTime(s: string | null): string | null {
  if (!s) return null
  const d = new Date(s)
  if (isNaN(d.valueOf())) return null
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function ChoresPage() {
  const { user } = useAuthStore()
  const [chores, setChores] = useState<Chore[]>([])
  const [members, setMembers] = useState<GroupMember[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  const [busy, setBusy] = useState(false)

  const [createOpen, setCreateOpen] = useState(false)
  const [editingChore, setEditingChore] = useState<Chore | null>(null)
  const [form, setForm] = useState<ChoreFormState>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [choresRes, groupRes] = await Promise.all([
        api.get<ApiEnvelope<Chore[]>>('/chores'),
        api.get<ApiEnvelope<GroupWithMembers>>('/groups/me'),
      ])
      if (choresRes.data.error) setError(choresRes.data.error)
      else setChores(choresRes.data.data ?? [])
      setMembers(groupRes.data.data?.members ?? [])
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to load chores'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const { active, completed } = useMemo(() => {
    const a: Chore[] = []
    const c: Chore[] = []
    for (const ch of chores) (ch.is_completed ? c : a).push(ch)
    return { active: a, completed: c }
  }, [chores])

  const filteredActive = useMemo(() => {
    switch (filter) {
      case 'mine':
        return active.filter((c) => c.assigned_to === user?.id)
      case 'unassigned':
        return active.filter((c) => !c.assigned_to)
      case 'completed':
        return []
      case 'all':
      default:
        return active
    }
  }, [active, filter, user?.id])

  function openCreate() {
    setForm(EMPTY_FORM)
    setFormError(null)
    setCreateOpen(true)
  }

  function openEdit(chore: Chore) {
    setForm({
      title: chore.title,
      description: chore.description ?? '',
      due_date: chore.due_date ? chore.due_date.slice(0, 10) : '',
      assigned_to: chore.assigned_to ?? '',
    })
    setFormError(null)
    setEditingChore(chore)
  }

  async function submitCreate(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setFormError(null)
    try {
      const res = await api.post<ApiEnvelope<Chore>>('/chores', {
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_date: form.due_date || null,
        assigned_to: form.assigned_to || null,
      })
      if (res.data.error || !res.data.data) {
        setFormError(res.data.error ?? 'Failed to create chore')
        return
      }
      setChores((prev) => [res.data.data!, ...prev])
      setCreateOpen(false)
    } catch (err: unknown) {
      setFormError(
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to create chore',
      )
    } finally {
      setBusy(false)
    }
  }

  async function submitEdit(e: FormEvent) {
    e.preventDefault()
    if (!editingChore) return
    setBusy(true)
    setFormError(null)
    try {
      const previousAssignee = editingChore.assigned_to
      const newAssignee = form.assigned_to || null
      const payload: Record<string, unknown> = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_date: form.due_date || null,
      }
      if (newAssignee !== previousAssignee) {
        if (newAssignee === null) payload.clear_assignee = true
        else payload.assigned_to = newAssignee
      }
      const res = await api.patch<ApiEnvelope<Chore>>(`/chores/${editingChore.id}`, payload)
      if (res.data.error || !res.data.data) {
        setFormError(res.data.error ?? 'Failed to update chore')
        return
      }
      const updated = res.data.data
      setChores((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      setEditingChore(null)
    } catch (err: unknown) {
      setFormError(
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to update chore',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(chore: Chore) {
    const ok = await confirmDialog({
      title: 'Delete this chore?',
      message: `"${chore.title}" will be removed permanently.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await api.delete<ApiEnvelope<unknown>>(`/chores/${chore.id}`)
      if (res.data.error) {
        toast.error(res.data.error)
        return
      }
      setChores((prev) => prev.filter((c) => c.id !== chore.id))
      toast.success('Chore deleted')
    } catch {
      toast.error('Failed to delete chore')
    }
  }

  async function handleComplete(chore: Chore) {
    try {
      const res = await api.patch<ApiEnvelope<Chore>>(`/chores/${chore.id}/complete`)
      if (res.data.error || !res.data.data) {
        toast.error(res.data.error ?? 'Failed to mark complete')
        return
      }
      const updated = res.data.data
      setChores((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
      toast.success('Nice — marked complete')
    } catch {
      toast.error('Failed to mark complete')
    }
  }

  async function handleAssignRandom() {
    const ok = await confirmDialog({
      title: 'Distribute unassigned chores?',
      message: 'They will be randomly handed out across all roommates.',
      confirmLabel: 'Distribute',
    })
    if (!ok) return
    setBusy(true)
    try {
      const res = await api.post<ApiEnvelope<Chore[]>>('/chores/assign-random')
      if (res.data.error) {
        toast.error(res.data.error)
        return
      }
      const updated = res.data.data ?? []
      if (updated.length === 0) {
        toast.info('No unassigned chores to distribute')
      } else {
        toast.success(`Assigned ${updated.length} chore${updated.length === 1 ? '' : 's'}`)
      }
      const byId = new Map(updated.map((c) => [c.id, c]))
      setChores((prev) => prev.map((c) => byId.get(c.id) ?? c))
    } catch {
      toast.error('Failed to assign')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-600 mb-1">
            Chores
          </p>
          <h1 className="text-3xl font-bold text-gray-900">Household tasks</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleAssignRandom}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-primary-700 bg-white border border-primary-200 hover:bg-primary-50 rounded-lg transition disabled:opacity-50"
          >
            <SparklesIcon className="h-4 w-4" />
            Assign randomly
          </button>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition shadow-sm shadow-primary-200"
          >
            <PlusIcon className="h-4 w-4" />
            Add chore
          </button>
        </div>
      </header>

      <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-xl p-1 w-fit">
        {(['all', 'mine', 'unassigned', 'completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3.5 py-1.5 text-sm font-medium rounded-lg capitalize transition ${
              filter === f ? 'bg-primary-600 text-white' : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <Card>
          <div className="space-y-2">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
        </Card>
      ) : (
        <>
          {filter !== 'completed' && (
            <Card title={`${filteredActive.length} active`}>
              {filteredActive.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircleIcon className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No chores in this view.</p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {filteredActive.map((c) => (
                    <ChoreRow
                      key={c.id}
                      chore={c}
                      currentUserId={user?.id ?? ''}
                      onComplete={() => handleComplete(c)}
                      onEdit={() => openEdit(c)}
                      onDelete={() => handleDelete(c)}
                    />
                  ))}
                </ul>
              )}
            </Card>
          )}

          {(filter === 'completed' || (filter === 'all' && completed.length > 0)) && (
            <Card>
              <button
                onClick={() => setShowCompleted((s) => !s)}
                className="flex items-center justify-between w-full"
              >
                <span className="text-sm font-semibold text-gray-700">
                  Completed · {completed.length}
                </span>
                {showCompleted ? (
                  <ChevronUpIcon className="h-4 w-4 text-gray-400" />
                ) : (
                  <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                )}
              </button>
              {(showCompleted || filter === 'completed') && (
                <ul className="space-y-2 mt-4">
                  {completed.map((c) => (
                    <li
                      key={c.id}
                      className="flex items-start justify-between gap-3 p-3 rounded-lg bg-gray-50"
                    >
                      <div>
                        <p className="text-sm text-gray-700 line-through">{c.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Done by {c.completer_name ?? 'someone'}
                          {c.completed_at && ` · ${formatDateTime(c.completed_at)}`}
                        </p>
                      </div>
                      <CheckSolid className="h-5 w-5 text-accent-500 shrink-0" />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}
        </>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New chore"
        footer={
          <>
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="px-3.5 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="chore-create-form"
              disabled={busy || !form.title.trim()}
              className="px-3.5 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 rounded-lg shadow-sm shadow-primary-200"
            >
              {busy ? 'Saving…' : 'Add chore'}
            </button>
          </>
        }
      >
        <ChoreForm
          id="chore-create-form"
          form={form}
          setForm={setForm}
          members={members}
          onSubmit={submitCreate}
          error={formError}
        />
      </Modal>

      <Modal
        open={!!editingChore}
        onClose={() => setEditingChore(null)}
        title="Edit chore"
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditingChore(null)}
              className="px-3.5 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="chore-edit-form"
              disabled={busy || !form.title.trim()}
              className="px-3.5 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 rounded-lg shadow-sm shadow-primary-200"
            >
              {busy ? 'Saving…' : 'Save changes'}
            </button>
          </>
        }
      >
        <ChoreForm
          id="chore-edit-form"
          form={form}
          setForm={setForm}
          members={members}
          onSubmit={submitEdit}
          error={formError}
        />
      </Modal>
    </div>
  )
}

function ChoreRow({
  chore,
  currentUserId,
  onComplete,
  onEdit,
  onDelete,
}: {
  chore: Chore
  currentUserId: string
  onComplete: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const canEdit = chore.assigned_by === currentUserId || chore.assigned_to === currentUserId
  const canDelete = chore.assigned_by === currentUserId
  const canComplete = !chore.assigned_to || chore.assigned_to === currentUserId
  const due = formatDate(chore.due_date)
  return (
    <li className="flex items-start gap-3 p-3.5 rounded-lg border border-gray-100 hover:border-primary-200 transition">
      <button
        onClick={onComplete}
        disabled={!canComplete}
        title={canComplete ? 'Mark complete' : 'Only the assignee can complete'}
        className={`mt-0.5 shrink-0 transition ${
          canComplete
            ? 'text-gray-300 hover:text-accent-500'
            : 'text-gray-200 cursor-not-allowed'
        }`}
      >
        <CheckCircleIcon className="h-6 w-6" />
      </button>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 text-sm">{chore.title}</p>
        {chore.description && (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{chore.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
          {chore.assigned_to ? (
            <span className="inline-flex items-center gap-1.5">
              <Avatar
                displayName={chore.assignee_name ?? '?'}
                avatarUrl={chore.assignee_avatar}
                size="sm"
              />
              <span className="font-medium text-gray-700">
                {chore.assigned_to === currentUserId ? 'You' : chore.assignee_name}
              </span>
            </span>
          ) : (
            <span className="italic text-gray-400">Unassigned</span>
          )}
          {due && (
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="h-3.5 w-3.5" />
              {due}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {canEdit && (
          <button
            onClick={onEdit}
            className="p-1.5 text-gray-400 hover:text-primary-600 rounded-md hover:bg-primary-50 transition"
            title="Edit"
          >
            <PencilSquareIcon className="h-4 w-4" />
          </button>
        )}
        {canDelete && (
          <button
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition"
            title="Delete"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  )
}

function ChoreForm({
  id,
  form,
  setForm,
  members,
  onSubmit,
  error,
}: {
  id: string
  form: ChoreFormState
  setForm: (f: ChoreFormState) => void
  members: GroupMember[]
  onSubmit: (e: FormEvent) => void
  error: string | null
}) {
  return (
    <form id={id} onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
        <input
          required
          maxLength={200}
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
          placeholder="Take out the trash"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">
          Description <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <textarea
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition resize-none"
          placeholder="Notes, location, etc."
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Due date</label>
          <input
            type="date"
            value={form.due_date}
            onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Assign to</label>
          <select
            value={form.assigned_to}
            onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}
            className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
    </form>
  )
}
