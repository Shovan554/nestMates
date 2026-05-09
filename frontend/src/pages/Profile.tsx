import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { CheckIcon, PencilIcon, XMarkIcon, ClipboardIcon } from '@heroicons/react/24/outline'
import { api } from '../lib/api'
import { useAuthStore } from '../stores/auth'
import { toast } from '../stores/toast'
import type { ApiEnvelope, GroupWithMembers, Profile } from '../lib/types'
import Card from '../components/Card'
import Avatar from '../components/Avatar'
import Skeleton from '../components/Skeleton'

export default function ProfilePage() {
  const { user, signOut } = useAuthStore()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [group, setGroup] = useState<GroupWithMembers | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [copied, setCopied] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [meRes, groupRes] = await Promise.all([
        api.get<ApiEnvelope<Profile>>('/me'),
        api.get<ApiEnvelope<GroupWithMembers>>('/groups/me'),
      ])
      if (meRes.data.error) setError(meRes.data.error)
      else setProfile(meRes.data.data)
      setGroup(groupRes.data.data)
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to load profile'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function startEditName() {
    setNameDraft(profile?.display_name ?? '')
    setEditingName(true)
  }

  async function saveName() {
    if (!nameDraft.trim() || nameDraft.trim() === profile?.display_name) {
      setEditingName(false)
      return
    }
    setSavingName(true)
    try {
      const res = await api.patch<ApiEnvelope<Profile>>('/me', {
        display_name: nameDraft.trim(),
      })
      if (res.data.error || !res.data.data) {
        toast.error(res.data.error ?? 'Failed to update name')
        return
      }
      setProfile(res.data.data)
      setEditingName(false)
      toast.success('Name updated')
    } catch {
      toast.error('Failed to update name')
    } finally {
      setSavingName(false)
    }
  }

  function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (!f) return
    setPendingFile(f)
    const url = URL.createObjectURL(f)
    setPreviewUrl(url)
  }

  function cancelAvatar() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null)
    setPendingFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function uploadAvatar() {
    if (!pendingFile) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', pendingFile)
      const res = await api.post<ApiEnvelope<Profile>>('/profile/avatar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      if (res.data.error || !res.data.data) {
        toast.error(res.data.error ?? 'Failed to upload')
        return
      }
      setProfile(res.data.data)
      cancelAvatar()
      toast.success('Avatar updated')
    } catch {
      toast.error('Failed to upload avatar')
    } finally {
      setUploading(false)
    }
  }

  async function copyInvite() {
    if (!group) return
    try {
      await navigator.clipboard.writeText(group.group.invite_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-600 mb-1">
          Profile
        </p>
        <h1 className="text-3xl font-bold text-gray-900">Your account</h1>
      </header>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {profile && (
        <Card>
          <div className="flex flex-col sm:flex-row items-start gap-6">
            <div className="flex flex-col items-center gap-2 mx-auto sm:mx-0">
              <div className="relative">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="h-24 w-24 rounded-full object-cover ring-4 ring-primary-100"
                  />
                ) : (
                  <div className="ring-4 ring-primary-100 rounded-full">
                    <Avatar
                      displayName={profile.display_name}
                      avatarUrl={profile.avatar_url}
                      size="lg"
                    />
                  </div>
                )}
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={pickFile}
                className="hidden"
              />

              {previewUrl ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={uploadAvatar}
                    disabled={uploading}
                    className="text-xs font-semibold text-white bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 px-3 py-1.5 rounded-md inline-flex items-center gap-1"
                  >
                    <CheckIcon className="h-3.5 w-3.5" />
                    {uploading ? 'Uploading…' : 'Save'}
                  </button>
                  <button
                    onClick={cancelAvatar}
                    disabled={uploading}
                    className="text-xs font-medium text-gray-600 hover:text-gray-900 px-3 py-1.5 rounded-md inline-flex items-center gap-1"
                  >
                    <XMarkIcon className="h-3.5 w-3.5" />
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-medium text-primary-700 hover:underline"
                >
                  Change avatar
                </button>
              )}
            </div>

            <div className="flex-1 w-full">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                    Display name
                  </label>
                  {editingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        value={nameDraft}
                        onChange={(e) => setNameDraft(e.target.value)}
                        className="flex-1 px-3.5 py-2 rounded-lg border border-gray-200 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                      />
                      <button
                        onClick={saveName}
                        disabled={savingName}
                        className="p-2 text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:bg-primary-300"
                        aria-label="Save"
                      >
                        <CheckIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditingName(false)}
                        className="p-2 text-gray-500 hover:text-gray-900 rounded-lg"
                        aria-label="Cancel"
                      >
                        <XMarkIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-semibold text-gray-900">{profile.display_name}</p>
                      <button
                        onClick={startEditName}
                        className="p-1 text-gray-400 hover:text-primary-700 rounded-md"
                        aria-label="Edit name"
                      >
                        <PencilIcon className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                    Email
                  </label>
                  <p className="text-sm text-gray-700">{profile.email ?? user?.email}</p>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {group && (
        <Card eyebrow="Household" title={group.group.name}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs text-gray-500">
                {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                Invite code
              </span>
              <div className="flex items-center gap-2">
                <code className="px-3 py-1.5 bg-primary-50 text-primary-700 rounded-lg font-mono font-bold tracking-[0.3em] text-sm border border-primary-100">
                  {group.group.invite_code}
                </code>
                <button
                  onClick={copyInvite}
                  className="px-2.5 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-50 rounded-lg border border-primary-200 transition inline-flex items-center gap-1"
                >
                  <ClipboardIcon className="h-3.5 w-3.5" />
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-5 border-t border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
              Roommates
            </p>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {group.members.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center gap-2.5 p-2.5 rounded-lg bg-gray-50"
                >
                  <Avatar displayName={m.display_name} avatarUrl={m.avatar_url} size="sm" />
                  <span className="text-sm font-medium text-gray-800 truncate">
                    {m.display_name}
                    {m.id === user?.id && (
                      <span className="ml-1.5 text-[10px] text-gray-400 font-normal">you</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <Card>
        <button
          onClick={signOut}
          className="text-sm font-medium text-rose-600 hover:text-rose-700"
        >
          Sign out
        </button>
      </Card>
    </div>
  )
}
