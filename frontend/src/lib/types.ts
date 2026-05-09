export interface ApiEnvelope<T> {
  data: T | null
  error: string | null
}

export interface Profile {
  id: string
  email: string | null
  display_name: string
  avatar_url: string | null
  group_id: string | null
}

export interface Group {
  id: string
  name: string
  invite_code: string
  created_by: string | null
  created_at: string | null
}

export interface GroupMember {
  id: string
  display_name: string
  avatar_url: string | null
}

export interface GroupWithMembers {
  group: Group
  members: GroupMember[]
}

export interface ChoreLite {
  id: string
  title: string
  due_date: string | null
  assignee_id: string | null
  assignee_name: string | null
}

export interface RoommateStatus {
  user_id: string
  display_name: string
  avatar_url: string | null
  active_chores: number
}

export interface StrikeSummary {
  user_id: string
  display_name: string
  strike_count: number
  active_punishment: string | null
}

export interface Complaint {
  id: string
  group_id: string
  filed_by: string
  filed_by_name: string | null
  filed_by_avatar: string | null
  filed_against: string
  filed_against_name: string | null
  filed_against_avatar: string | null
  reason: string
  created_at: string | null
}

export interface StrikeCount {
  user_id: string
  display_name: string
  avatar_url: string | null
  strike_count: number
}

export interface Punishment {
  id: string
  user_id: string
  user_name: string | null
  user_avatar: string | null
  description: string
  assigned_at: string | null
  is_completed: boolean
  completed_at: string | null
}

export interface GroupPunishmentItem {
  id: string
  description: string
}

export interface BillSplit {
  id: string
  bill_id: string
  user_id: string
  user_name: string | null
  user_avatar: string | null
  amount_owed: number
  is_paid: boolean
  paid_at: string | null
}

export interface Bill {
  id: string
  group_id: string
  title: string
  amount: number
  paid_by: string
  payer_name: string | null
  payer_avatar: string | null
  note: string | null
  receipt_url: string | null
  created_at: string | null
  splits: BillSplit[]
}

export interface Message {
  id: string
  group_id: string
  sender_id: string
  sender_name: string | null
  sender_avatar: string | null
  content: string
  created_at: string | null
}

export interface Chore {
  id: string
  group_id: string
  title: string
  description: string | null
  assigned_to: string | null
  assignee_name: string | null
  assignee_avatar: string | null
  assigned_by: string | null
  creator_name: string | null
  is_completed: boolean
  completed_at: string | null
  completed_by: string | null
  completer_name: string | null
  due_date: string | null
  created_at: string | null
}

export interface DashboardData {
  group_name: string
  group_invite_code: string
  my_chores: ChoreLite[]
  roommate_chores: ChoreLite[]
  i_owe: number
  owed_to_me: number
  roommate_status: RoommateStatus[]
  strikes: StrikeSummary[]
}
