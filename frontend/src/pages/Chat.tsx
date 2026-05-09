import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { PaperAirplaneIcon } from '@heroicons/react/24/solid'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/auth'
import type { ApiEnvelope, GroupMember, GroupWithMembers, Message } from '../lib/types'
import Avatar from '../components/Avatar'

function formatTime(s: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  if (isNaN(d.valueOf())) return ''
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function isSameDay(a: string | null, b: string | null): boolean {
  if (!a || !b) return false
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

function dayLabel(s: string | null): string {
  if (!s) return ''
  const d = new Date(s)
  const today = new Date()
  const yest = new Date()
  yest.setDate(today.getDate() - 1)
  if (isSameDay(d.toISOString(), today.toISOString())) return 'Today'
  if (isSameDay(d.toISOString(), yest.toISOString())) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

export default function Chat() {
  const { user } = useAuthStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [members, setMembers] = useState<GroupMember[]>([])
  const [groupId, setGroupId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const memberById = useMemo(() => {
    const m = new Map<string, GroupMember>()
    members.forEach((member) => m.set(member.id, member))
    return m
  }, [members])

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [groupRes, msgsRes] = await Promise.all([
          api.get<ApiEnvelope<GroupWithMembers>>('/groups/me'),
          api.get<ApiEnvelope<Message[]>>('/messages?limit=50'),
        ])
        if (cancelled) return
        const g = groupRes.data.data
        setGroupId(g?.group.id ?? null)
        setMembers(g?.members ?? [])
        if (msgsRes.data.error) setError(msgsRes.data.error)
        else setMessages(msgsRes.data.data ?? [])
      } catch (err: unknown) {
        if (cancelled) return
        const msg =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Failed to load chat'
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

  useEffect(() => {
    if (!groupId) return

    const channel = supabase
      .channel(`group:${groupId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string
            group_id: string
            sender_id: string
            content: string
            created_at: string
          }
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev
            const sender = memberById.get(row.sender_id) ?? null
            return [
              ...prev,
              {
                id: row.id,
                group_id: row.group_id,
                sender_id: row.sender_id,
                sender_name: sender?.display_name ?? null,
                sender_avatar: sender?.avatar_url ?? null,
                content: row.content,
                created_at: row.created_at,
              },
            ]
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [groupId, memberById])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [messages])

  async function handleSend(e: FormEvent) {
    e.preventDefault()
    const content = input.trim()
    if (!content || sending) return

    setSending(true)
    setInput('')
    try {
      const res = await api.post<ApiEnvelope<Message>>('/messages', { content })
      if (res.data.error || !res.data.data) {
        setError(res.data.error ?? 'Failed to send')
        setInput(content)
        return
      }
      const sent = res.data.data
      setMessages((prev) => (prev.some((m) => m.id === sent.id) ? prev : [...prev, sent]))
    } catch {
      setError('Failed to send')
      setInput(content)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] md:h-[calc(100vh-5rem)]">
      <header className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-600 mb-1">
            Chat
          </p>
          <h1 className="text-2xl font-bold text-gray-900">Household chat</h1>
        </div>
        <div className="flex -space-x-2">
          {members.slice(0, 5).map((m) => (
            <Avatar key={m.id} displayName={m.display_name} avatarUrl={m.avatar_url} size="sm" />
          ))}
        </div>
      </header>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-3">
          {error}
        </div>
      )}

      <div className="flex-1 bg-white rounded-2xl border border-gray-100 flex flex-col overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
          {loading ? (
            <div className="text-gray-400 text-sm text-center py-8">Loading…</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-500">
                No messages yet. Say hello to your roommates 👋
              </p>
            </div>
          ) : (
            messages.map((m, i) => {
              const prev = messages[i - 1]
              const showDay = !prev || !isSameDay(prev.created_at, m.created_at)
              const showHeader =
                !prev || prev.sender_id !== m.sender_id || showDay
              const isMe = m.sender_id === user?.id
              return (
                <div key={m.id}>
                  {showDay && (
                    <div className="flex items-center justify-center my-3">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 bg-gray-50 px-3 py-1 rounded-full">
                        {dayLabel(m.created_at)}
                      </span>
                    </div>
                  )}
                  <div className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''} mt-${showHeader ? 2 : 0.5}`}>
                    <div className="w-8 shrink-0">
                      {showHeader && (
                        <Avatar
                          displayName={m.sender_name ?? '?'}
                          avatarUrl={m.sender_avatar}
                          size="sm"
                        />
                      )}
                    </div>
                    <div className={`max-w-[70%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                      {showHeader && (
                        <span className="text-[11px] text-gray-500 mb-0.5 px-1">
                          {isMe ? 'You' : m.sender_name ?? 'Someone'}{' '}
                          <span className="text-gray-300">· {formatTime(m.created_at)}</span>
                        </span>
                      )}
                      <div
                        className={`px-3.5 py-2 rounded-2xl text-sm break-words whitespace-pre-wrap ${
                          isMe
                            ? 'bg-primary-600 text-white rounded-br-sm'
                            : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                        }`}
                      >
                        {m.content}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>

        <form
          onSubmit={handleSend}
          className="border-t border-gray-100 px-3 py-3 flex items-end gap-2"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend(e as unknown as FormEvent)
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Type a message…"
            className="flex-1 resize-none px-3.5 py-2.5 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition text-sm"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="h-10 w-10 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white flex items-center justify-center transition shrink-0"
            aria-label="Send"
          >
            <PaperAirplaneIcon className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  )
}
