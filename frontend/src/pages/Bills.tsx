import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  PlusIcon,
  TrashIcon,
  ArrowDownCircleIcon,
  ArrowUpCircleIcon,
  CheckCircleIcon,
  PaperClipIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { CheckCircleIcon as CheckSolid } from '@heroicons/react/24/solid'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { toast } from '../stores/toast'
import { confirmDialog } from '../components/ConfirmDialog'
import type { ApiEnvelope, Bill, GroupMember, GroupWithMembers } from '../lib/types'
import Card from '../components/Card'
import Modal from '../components/Modal'
import Avatar from '../components/Avatar'
import { SkeletonCard } from '../components/Skeleton'

interface AddBillForm {
  title: string
  amount: string
  note: string
  selected: Set<string>
  receipt: File | null
}

function freshForm(memberIds: string[]): AddBillForm {
  return {
    title: '',
    amount: '',
    note: '',
    selected: new Set(memberIds),
    receipt: null,
  }
}

function money(n: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function formatDate(s: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.valueOf())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function Bills() {
  const { user } = useAuthStore()
  const [bills, setBills] = useState<Bill[]>([])
  const [members, setMembers] = useState<GroupMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState<AddBillForm>(freshForm([]))
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [billsRes, groupRes] = await Promise.all([
        api.get<ApiEnvelope<Bill[]>>('/bills'),
        api.get<ApiEnvelope<GroupWithMembers>>('/groups/me'),
      ])
      if (billsRes.data.error) setError(billsRes.data.error)
      else setBills(billsRes.data.data ?? [])
      setMembers(groupRes.data.data?.members ?? [])
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to load bills'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const totals = useMemo(() => {
    if (!user) return { iOwe: 0, owedToMe: 0 }
    let iOwe = 0
    let owedToMe = 0
    for (const b of bills) {
      for (const s of b.splits) {
        if (s.is_paid) continue
        if (s.user_id === user.id) iOwe += s.amount_owed
        else if (b.paid_by === user.id) owedToMe += s.amount_owed
      }
    }
    return { iOwe, owedToMe }
  }, [bills, user])

  function openCreate() {
    setForm(freshForm(members.map((m) => m.id)))
    setFormError(null)
    setCreateOpen(true)
  }

  function toggleMember(id: string) {
    setForm((prev) => {
      const next = new Set(prev.selected)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...prev, selected: next }
    })
  }

  async function submitCreate(e: FormEvent) {
    e.preventDefault()
    const amount = Number(form.amount)
    if (!form.title.trim() || !(amount > 0) || form.selected.size === 0) {
      setFormError('Title, amount, and at least one member are required')
      return
    }
    setBusy(true)
    setFormError(null)
    try {
      const res = await api.post<ApiEnvelope<Bill>>('/bills', {
        title: form.title.trim(),
        amount,
        note: form.note.trim() || null,
        member_ids: Array.from(form.selected),
      })
      if (res.data.error || !res.data.data) {
        setFormError(res.data.error ?? 'Failed to create bill')
        return
      }
      let created = res.data.data

      if (form.receipt) {
        const fd = new FormData()
        fd.append('file', form.receipt)
        try {
          const upRes = await api.post<ApiEnvelope<Bill>>(`/bills/${created.id}/receipt`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
          if (!upRes.data.error && upRes.data.data) {
            created = upRes.data.data
          }
        } catch {
          /* ignore upload failure */
        }
      }

      setBills((prev) => [created, ...prev])
      setCreateOpen(false)
    } catch (err: unknown) {
      setFormError(
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to create bill',
      )
    } finally {
      setBusy(false)
    }
  }

  async function handleMarkPaid(billId: string, splitId: string) {
    try {
      const res = await api.patch<ApiEnvelope<Bill>>(`/bills/${billId}/splits/${splitId}/pay`)
      if (res.data.error || !res.data.data) {
        toast.error(res.data.error ?? 'Failed to mark paid')
        return
      }
      const updated = res.data.data
      setBills((prev) => prev.map((b) => (b.id === updated.id ? updated : b)))
      toast.success('Marked paid')
    } catch {
      toast.error('Failed to mark paid')
    }
  }

  async function handleDelete(bill: Bill) {
    const ok = await confirmDialog({
      title: 'Delete this bill?',
      message: `"${bill.title}" and all its splits will be deleted permanently.`,
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return
    try {
      const res = await api.delete<ApiEnvelope<unknown>>(`/bills/${bill.id}`)
      if (res.data.error) {
        toast.error(res.data.error)
        return
      }
      setBills((prev) => prev.filter((b) => b.id !== bill.id))
      toast.success('Bill deleted')
    } catch {
      toast.error('Failed to delete')
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-600 mb-1">
            Bills
          </p>
          <h1 className="text-3xl font-bold text-gray-900">Shared expenses</h1>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-lg transition shadow-sm shadow-primary-200"
        >
          <PlusIcon className="h-4 w-4" />
          Add bill
        </button>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card eyebrow="You owe" className="bg-gradient-to-br from-rose-50 to-white border-rose-100">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-rose-100 flex items-center justify-center">
              <ArrowUpCircleIcon className="h-6 w-6 text-rose-600" />
            </div>
            <p className="text-3xl font-bold text-gray-900 leading-tight">{money(totals.iOwe)}</p>
          </div>
        </Card>
        <Card eyebrow="Owed to you" className="bg-gradient-to-br from-accent-50 to-white border-accent-100">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-accent-100 flex items-center justify-center">
              <ArrowDownCircleIcon className="h-6 w-6 text-accent-700" />
            </div>
            <p className="text-3xl font-bold text-gray-900 leading-tight">{money(totals.owedToMe)}</p>
          </div>
        </Card>
      </div>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <SkeletonCard rows={2} />
          <SkeletonCard rows={2} />
        </div>
      ) : bills.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <p className="text-sm text-gray-500">No bills yet. Add one to start splitting.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {bills.map((b) => (
            <BillCard
              key={b.id}
              bill={b}
              currentUserId={user?.id ?? ''}
              onMarkPaid={(splitId) => handleMarkPaid(b.id, splitId)}
              onDelete={() => handleDelete(b)}
              onViewReceipt={(url) => setReceiptPreview(url)}
            />
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add a bill"
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
              form="bill-create-form"
              disabled={busy}
              className="px-3.5 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 rounded-lg shadow-sm shadow-primary-200"
            >
              {busy ? 'Saving…' : 'Add bill'}
            </button>
          </>
        }
      >
        <form id="bill-create-form" onSubmit={submitCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Title</label>
            <input
              required
              maxLength={200}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
              placeholder="Internet bill, Costco run, etc."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Amount</label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400">$</span>
              <input
                required
                inputMode="decimal"
                step="0.01"
                min="0.01"
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full pl-7 pr-3.5 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                placeholder="0.00"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Split with{' '}
              <span className="text-gray-400 font-normal">
                ({form.selected.size} selected)
              </span>
            </label>
            <div className="space-y-1.5 border border-gray-100 rounded-lg p-2 max-h-48 overflow-y-auto">
              {members.map((m) => (
                <label
                  key={m.id}
                  className="flex items-center gap-3 px-2.5 py-1.5 rounded-md hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={form.selected.has(m.id)}
                    onChange={() => toggleMember(m.id)}
                    className="h-4 w-4 rounded text-primary-600 focus:ring-primary-500"
                  />
                  <Avatar displayName={m.display_name} avatarUrl={m.avatar_url} size="sm" />
                  <span className="text-sm text-gray-800">
                    {m.display_name}
                    {m.id === user?.id && (
                      <span className="text-[10px] text-gray-400 ml-1.5">you</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
            {form.selected.size > 0 && Number(form.amount) > 0 && (
              <p className="text-xs text-gray-500 mt-1.5">
                Each person owes about {money(Number(form.amount) / form.selected.size)}.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Note <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="w-full px-3.5 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
              placeholder="What was it for?"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Receipt <span className="text-gray-400 font-normal">(optional, jpg/png)</span>
            </label>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => setForm({ ...form, receipt: e.target.files?.[0] ?? null })}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100 cursor-pointer"
            />
          </div>

          {formError && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}
        </form>
      </Modal>

      {receiptPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/80 p-4"
          onClick={() => setReceiptPreview(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setReceiptPreview(null)}
            aria-label="Close"
          >
            <XMarkIcon className="h-7 w-7" />
          </button>
          <img
            src={receiptPreview}
            alt="Receipt"
            className="max-h-[90vh] max-w-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}

function BillCard({
  bill,
  currentUserId,
  onMarkPaid,
  onDelete,
  onViewReceipt,
}: {
  bill: Bill
  currentUserId: string
  onMarkPaid: (splitId: string) => void
  onDelete: () => void
  onViewReceipt: (url: string) => void
}) {
  const isPayer = bill.paid_by === currentUserId
  const totalUnpaid = bill.splits.filter((s) => !s.is_paid).length
  return (
    <article className="bg-white rounded-2xl shadow-sm shadow-gray-200/40 border border-gray-100 p-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-gray-900">{bill.title}</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Paid by{' '}
            <span className="font-medium text-gray-700">
              {isPayer ? 'you' : bill.payer_name}
            </span>{' '}
            · {formatDate(bill.created_at)}
          </p>
          {bill.note && <p className="text-sm text-gray-600 mt-2 italic">"{bill.note}"</p>}
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-gray-900">{money(bill.amount)}</p>
          <p className="text-[11px] text-gray-500 mt-0.5">
            {totalUnpaid === 0 ? 'Settled' : `${totalUnpaid} unpaid`}
          </p>
        </div>
      </header>

      <ul className="mt-4 space-y-1.5">
        {bill.splits.map((s) => {
          const isMe = s.user_id === currentUserId
          return (
            <li
              key={s.id}
              className={`flex items-center justify-between gap-3 px-3 py-2 rounded-lg ${
                s.is_paid ? 'bg-gray-50' : 'bg-rose-50/40 border border-rose-100'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Avatar displayName={s.user_name ?? '?'} avatarUrl={s.user_avatar} size="sm" />
                <span className="text-sm text-gray-800 truncate">
                  {s.user_name}
                  {isMe && <span className="text-[10px] text-gray-400 ml-1.5">you</span>}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-sm font-medium ${s.is_paid ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                  {money(s.amount_owed)}
                </span>
                {s.is_paid ? (
                  <CheckSolid className="h-4 w-4 text-accent-500" />
                ) : isMe ? (
                  <button
                    onClick={() => onMarkPaid(s.id)}
                    className="text-xs font-medium text-primary-700 bg-white border border-primary-200 hover:bg-primary-50 px-2.5 py-1 rounded-md transition"
                  >
                    Mark paid
                  </button>
                ) : (
                  <CheckCircleIcon className="h-4 w-4 text-gray-300" />
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <footer className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
        {bill.receipt_url ? (
          <button
            onClick={() => onViewReceipt(bill.receipt_url!)}
            className="text-xs font-medium text-primary-700 hover:underline inline-flex items-center gap-1"
          >
            <PaperClipIcon className="h-3.5 w-3.5" />
            View receipt
          </button>
        ) : (
          <span className="text-xs text-gray-400">No receipt</span>
        )}
        {isPayer && (
          <button
            onClick={onDelete}
            className="text-xs font-medium text-rose-600 hover:underline inline-flex items-center gap-1"
          >
            <TrashIcon className="h-3.5 w-3.5" />
            Delete
          </button>
        )}
      </footer>
    </article>
  )
}
