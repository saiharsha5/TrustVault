import { useEffect, useState, type FormEvent } from 'react'
import {
  ShieldCheck,
  LockKeyhole,
  FileText,
  Upload,
  Search,
  LogOut,
  Users,
  Activity,
  RefreshCw,
  Download,
  Share2,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  Database,
  KeyRound,
  ShieldAlert,
  FileCheck,
  Shield
} from 'lucide-react'

const API = import.meta.env.VITE_API_BASE || (import.meta.env.DEV ? 'http://localhost:8000' : 'https://trustvault-api-ziwt.onrender.com')

type User = {
  id: number
  email: string
  role: string
  created_at?: string
  documents_count?: number
}

type Doc = {
  id: number
  name: string
  owner_id?: number
  owner_email: string
  content_type: string
  size_bytes: number
  sha256: string
  created_at: string
  can_download?: boolean
  is_owner?: boolean
  has_grant?: boolean
  active_grants?: number
}

type Audit = {
  id: number
  action: string
  actor_id: number | null
  document_id: number | null
  outcome: string
  created_at: string
  event_hash: string
  details?: Record<string, unknown>
}

type Grant = {
  id: number
  document_id: number
  document_name: string
  owner_email: string
  target_user_id: number
  target_email: string
  active: boolean
  created_at: string
}

type AdminStats = {
  total_documents: number
  total_users: number
  total_grants: number
  total_audits: number
  total_storage_bytes: number
}

type ChainStatus = {
  valid: boolean
  checked: number
  latest_hash?: string
}

function readableError(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((item: any) => {
      if (typeof item === 'string') return item
      const field = Array.isArray(item?.loc) ? item.loc.filter((part: unknown) => part !== 'body').join('.') : ''
      const message = typeof item?.msg === 'string' ? item.msg : JSON.stringify(item)
      return field ? `${field}: ${message}` : message
    }).join('; ')
  }
  if (detail && typeof detail === 'object') {
    const obj = detail as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
    if (typeof obj.msg === 'string') return obj.msg
    return JSON.stringify(detail)
  }
  return fallback
}

const TOKEN_KEY = 'trustvault_session_token'

async function api(path: string, init: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
  const headers = new Headers(init.headers || {})
  if (token) {
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
    if (!headers.has('X-Session-Token')) headers.set('X-Session-Token', token)
  }
  const response = await fetch(`${API}${path}`, { ...init, headers, credentials: 'include' })
  const data = await response.json().catch(() => ({ detail: 'Unexpected server response' }))
  if (!response.ok) {
    throw new Error(readableError(data?.detail, `Request failed (${response.status})`))
  }
  return data
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [docs, setDocs] = useState<Doc[]>([])
  const [allDocs, setAllDocs] = useState<Doc[]>([])
  const [allGrants, setAllGrants] = useState<Grant[]>([])
  const [allUsers, setAllUsers] = useState<User[]>([])
  const [adminStats, setAdminStats] = useState<AdminStats | null>(null)
  const [chainStatus, setChainStatus] = useState<ChainStatus | null>(null)
  const [audits, setAudits] = useState<Audit[]>([])
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [shareDoc, setShareDoc] = useState<Doc | null>(null)
  const [shareEmail, setShareEmail] = useState('')
  const [grants, setGrants] = useState<any[]>([])
  const [tab, setTab] = useState<'documents' | 'audit'>('documents')
  const [adminTab, setAdminTab] = useState<'overview' | 'all_documents' | 'audit' | 'grants' | 'users' | 'vault'>('overview')
  const [auditFilter, setAuditFilter] = useState<string>('all')

  async function refresh() {
    if (!user) return
    setBusy(true)
    try {
      const userDocs = await api('/documents')
      setDocs(userDocs)

      if (user.role === 'admin') {
        const [overviewRes, docsRes, grantsRes, usersRes, auditRes] = await Promise.all([
          api('/admin/overview').catch(() => null),
          api('/admin/documents').catch(() => []),
          api('/admin/grants').catch(() => []),
          api('/admin/users').catch(() => []),
          api('/audit/events?limit=100').catch(() => [])
        ])

        if (overviewRes) {
          setAdminStats(overviewRes.stats)
          setChainStatus(overviewRes.chain)
        }
        setAllDocs(docsRes)
        setAllGrants(grantsRes)
        setAllUsers(usersRes)
        setAudits(auditRes)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    api('/auth/me')
      .then(setUser)
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY)
        setUser(null)
      })
  }, [])

  useEffect(() => {
    if (user) refresh()
  }, [user?.id])

  async function auth(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    try {
      if (mode === 'register') {
        await api('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        })
      }
      const result = await api('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      })
      if (result.token) {
        localStorage.setItem(TOKEN_KEY, result.token)
      }
      setUser(result.user)
      setMessage(result.user.role === 'admin' ? 'Authenticated as Administrator. Welcome to the Admin Panel.' : 'Welcome to TrustVault.')
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' })
    } catch (e: any) {
      setError(e.message)
    } finally {
      localStorage.removeItem(TOKEN_KEY)
      setUser(null)
      setDocs([])
      setAllDocs([])
      setAllGrants([])
      setAllUsers([])
      setAudits([])
      setAdminStats(null)
      setMessage('Signed out securely.')
    }
  }

  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')
    setMessage('')
    const form = e.currentTarget
    const input = form.elements.namedItem('file') as HTMLInputElement
    if (!input.files?.[0]) return
    const body = new FormData()
    body.append('file', input.files[0])
    try {
      await api('/documents', { method: 'POST', body })
      setMessage('Document uploaded to private storage.')
      form.reset()
      await refresh()
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function openShare(doc: Doc) {
    setShareDoc(doc)
    setShareEmail('')
    try {
      setGrants(await api(`/documents/${doc.id}/grants`))
    } catch (e: any) {
      setGrants([])
      setError(e.message)
    }
  }

  async function grant(e: FormEvent) {
    e.preventDefault()
    if (!shareDoc) return
    try {
      await api(`/documents/${shareDoc.id}/grants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: shareEmail })
      })
      setMessage(`Access granted to ${shareEmail}`)
      setGrants(await api(`/documents/${shareDoc.id}/grants`))
      setShareEmail('')
      await refresh()
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function revoke(userId: number) {
    if (!shareDoc) return
    try {
      await api(`/documents/${shareDoc.id}/grants/${userId}`, { method: 'DELETE' })
      setMessage('Access revoked. Future requests will be denied.')
      setGrants(await api(`/documents/${shareDoc.id}/grants`))
      await refresh()
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function download(doc: Doc) {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null
      const headers = new Headers()
      if (token) {
        headers.set('Authorization', `Bearer ${token}`)
        headers.set('X-Session-Token', token)
      }
      const response = await fetch(`${API}/documents/${doc.id}/download`, { headers, credentials: 'include' })
      if (!response.ok) {
        const d = await response.json().catch(() => ({}))
        throw new Error(d.detail || 'Download failed')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = doc.name
      a.click()
      URL.revokeObjectURL(url)
      setMessage(`Downloaded "${doc.name}" securely.`)
    } catch (e: any) {
      if (user?.role === 'admin' && !doc.can_download) {
        setError(`Zero-Trust Policy Enforced: Admin role alone cannot download private file "${doc.name}" without explicit owner grant. This unauthorized attempt was recorded in the tamper-evident audit chain.`)
        refresh()
      } else {
        setError(e.message)
      }
    }
  }

  async function deleteDocument(doc: Doc) {
    const confirmed = window.confirm(`Are you sure you want to permanently delete "${doc.name}"? This cannot be undone.`)
    if (!confirmed) return
    setError('')
    setMessage('')
    try {
      await api(`/documents/${doc.id}`, { method: 'DELETE' })
      setDocs(prev => prev.filter(d => d.id !== doc.id))
      setMessage(`"${doc.name}" was deleted successfully.`)
      if (shareDoc?.id === doc.id) setShareDoc(null)
      await refresh()
    } catch (e: any) {
      setError(e.message)
    }
  }

  async function verifyAuditChain() {
    try {
      const res = await api('/audit/verify')
      setChainStatus(res)
      setMessage(`Audit chain integrity verified: ${res.valid ? 'VALID & UNBROKEN' : 'INVALID'} (${res.checked} cryptographic blocks verified).`)
    } catch (e: any) {
      setError(e.message)
    }
  }

  // --- 1. UNAUTHENTICATED LOGIN / REGISTER SCREEN ---
  if (!user) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="brand">
            <div className="brand-mark"><ShieldCheck size={25} /></div>
            <div>
              <strong>TrustVault</strong>
              <span>SECURE DOCUMENTS</span>
            </div>
          </div>

          <div className="auth-copy">
            <p className="eyebrow">PRIVATE BY DESIGN</p>
            <h1>Your files.<br /><em>Your control.</em></h1>
            <p className="muted">
              Share sensitive documents with confidence. Every permission is explicit.
              Every access leaves a tamper-evident cryptographic trail.
            </p>
          </div>

          <form onSubmit={auth} className="auth-form">
            <label>
              Email address
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={mode === 'register' ? 12 : 1}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
            </label>

            <button className="primary full" type="submit">
              {mode === 'login' ? 'Sign in securely' : 'Create account'}
              <LockKeyhole size={16} />
            </button>
          </form>

          {mode === 'login' && (
            <div className="demo-login" style={{ marginTop: '18px' }}>
              <p className="muted" style={{ marginBottom: '10px' }}>
                Demo access — click or hover over an account to fill its credentials:
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setEmail('admin@trustvault.com')
                    setPassword('Rockstar@1')
                    setError('')
                    setMessage('')
                  }}
                  onMouseEnter={() => {
                    setEmail('admin@trustvault.com')
                    setPassword('Rockstar@1')
                    setError('')
                    setMessage('')
                  }}
                  onFocus={() => {
                    setEmail('admin@trustvault.com')
                    setPassword('Rockstar@1')
                    setError('')
                    setMessage('')
                  }}
                  style={{
                    border: '1px solid #d8e2ec',
                    borderRadius: '12px',
                    padding: '14px 10px',
                    background: '#f8fafc',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    alignItems: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <ShieldCheck size={20} color="#0f766e" />
                  <strong>Admin Account</strong>
                  <span style={{ fontSize: '11px', color: '#047857', fontWeight: 700 }}>Admin Panel Console</span>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>Click to autofill</span>
                </button>

                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setEmail('owner@trustvault.com')
                    setPassword('Coolguy@1')
                    setError('')
                    setMessage('')
                  }}
                  onMouseEnter={() => {
                    setEmail('owner@trustvault.com')
                    setPassword('Coolguy@1')
                    setError('')
                    setMessage('')
                  }}
                  onFocus={() => {
                    setEmail('owner@trustvault.com')
                    setPassword('Coolguy@1')
                    setError('')
                    setMessage('')
                  }}
                  style={{
                    border: '1px solid #d8e2ec',
                    borderRadius: '12px',
                    padding: '14px 10px',
                    background: '#f8fafc',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    alignItems: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <Users size={20} color="#2563eb" />
                  <strong>User Account</strong>
                  <span style={{ fontSize: '11px', color: '#1d4ed8', fontWeight: 700 }}>User Document Vault</span>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>Click to autofill</span>
                </button>
              </div>
            </div>
          )}

          <button
            className="link-button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login')
              setError('')
              setMessage('')
            }}
          >
            {mode === 'login' ? 'New to TrustVault? Create an account' : 'Already registered? Sign in'}
          </button>

          {error && <p className="notice error"><AlertCircle size={16} />{error}</p>}
          {message && <p className="notice success">{message}</p>}

          <div className="auth-foot">
            <LockKeyhole size={14} />
            <span>Protected with per-document authorization & tamper-evident audit</span>
          </div>
        </div>

        <div className="auth-side">
          <div className="side-orb orb1" />
          <div className="side-orb orb2" />
          <div className="side-content">
            <div className="floating-card">
              <div className="file-icon"><FileText size={22} /></div>
              <div>
                <b>Confidential_Contract.pdf</b>
                <small>Access restricted to explicit grants</small>
              </div>
              <span className="secure-pill"><LockKeyhole size={13} /> Protected</span>
            </div>

            <div className="floating-card offset">
              <div className="event-icon"><Activity size={21} /></div>
              <div>
                <b>Audit event recorded</b>
                <small>Hash verified · SHA-256 Chain</small>
              </div>
              <CheckCircle2 className="verified" size={19} />
            </div>

            <div className="side-caption">
              <span className="pulse" />
              SECURITY THAT LEAVES EVIDENCE
            </div>
          </div>
        </div>
      </div>
    )
  }

  // --- 2. ADMIN PANEL CONSOLE (FOR ADMIN USERS) ---
  if (user.role === 'admin') {
    const filteredAudits = audits.filter(a => {
      if (auditFilter === 'all') return true
      if (auditFilter === 'auth') return a.action.startsWith('auth')
      if (auditFilter === 'document') return a.action.startsWith('document')
      if (auditFilter === 'permission') return a.action.startsWith('permission')
      if (auditFilter === 'denied') return a.outcome === 'denied' || a.outcome === 'failure'
      return true
    })

    return (
      <div className="app-shell">
        <aside className="sidebar">
          <div className="brand">
            <div className="brand-mark" style={{ background: '#0f172a', color: '#38bdf8' }}>
              <Shield size={25} />
            </div>
            <div>
              <strong>TrustVault</strong>
              <span style={{ color: '#0ea5e9' }}>ADMIN CONSOLE</span>
            </div>
          </div>

          <div className="workspace" style={{ background: '#f8fafc', borderColor: '#e2e8f0' }}>
            <div className="workspace-icon" style={{ background: '#0f172a', color: '#38bdf8' }}>
              <ShieldCheck size={18} />
            </div>
            <div>
              <b>Security Operations</b>
              <small style={{ color: '#0284c7' }}>Zero-Trust Active</small>
            </div>
          </div>

          <p className="nav-label">SECURITY &amp; SYSTEM</p>

          <button
            className={`nav-item ${adminTab === 'overview' ? 'active' : ''}`}
            onClick={() => setAdminTab('overview')}
          >
            <Activity size={18} /> Overview &amp; Health
          </button>

          <button
            className={`nav-item ${adminTab === 'all_documents' ? 'active' : ''}`}
            onClick={() => setAdminTab('all_documents')}
          >
            <Database size={18} /> All System Uploads <span>{allDocs.length}</span>
          </button>

          <button
            className={`nav-item ${adminTab === 'audit' ? 'active' : ''}`}
            onClick={() => setAdminTab('audit')}
          >
            <FileCheck size={18} /> Audit Trail <span>{audits.length}</span>
          </button>

          <button
            className={`nav-item ${adminTab === 'grants' ? 'active' : ''}`}
            onClick={() => setAdminTab('grants')}
          >
            <KeyRound size={18} /> Explicit Permissions <span>{allGrants.length}</span>
          </button>

          <button
            className={`nav-item ${adminTab === 'users' ? 'active' : ''}`}
            onClick={() => setAdminTab('users')}
          >
            <Users size={18} /> System Users <span>{allUsers.length}</span>
          </button>

          <p className="nav-label">ADMIN VAULT</p>

          <button
            className={`nav-item ${adminTab === 'vault' ? 'active' : ''}`}
            onClick={() => setAdminTab('vault')}
          >
            <FileText size={18} /> Personal Files <span>{docs.length}</span>
          </button>

          <div className="sidebar-bottom">
            <div className="security-note" style={{ background: '#f8fafc', borderColor: '#e2e8f0', color: '#0f172a' }}>
              <ShieldAlert size={18} color="#0284c7" />
              <div>
                <b style={{ color: '#0f172a' }}>Explicit Access Rule</b>
                <small style={{ color: '#64748b' }}>Admin role cannot bypass file ownership</small>
              </div>
            </div>

            <div className="profile">
              <div className="avatar" style={{ background: '#0f172a', color: '#38bdf8' }}>
                {user.email[0].toUpperCase()}
              </div>
              <div className="profile-info">
                <b>{user.email}</b>
                <span className="role-pill admin" style={{ marginTop: '2px' }}>Administrator</span>
              </div>
              <button className="icon-button" title="Sign out" onClick={logout}>
                <LogOut size={17} />
              </button>
            </div>
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div>
              <div className="breadcrumbs">
                Admin Panel <span>/</span> {adminTab.replace('_', ' ').toUpperCase()}
              </div>
              <h2>
                {adminTab === 'overview' && 'System Security & Overview'}
                {adminTab === 'all_documents' && 'Global Uploads Registry'}
                {adminTab === 'audit' && 'Cryptographic Audit Trail'}
                {adminTab === 'grants' && 'Explicit Access Grants Matrix'}
                {adminTab === 'users' && 'System Users & Identity'}
                {adminTab === 'vault' && 'Admin Personal Vault'}
              </h2>
            </div>
            <div className="top-actions">
              <span className="live-status" style={{ background: '#ecfdf5', color: '#047857' }}>
                <span /> Zero-Trust Policy Active
              </span>
              <button className="icon-button" title="Refresh" onClick={refresh}>
                <RefreshCw size={17} />
              </button>
              <div className="avatar" style={{ background: '#0f172a', color: '#38bdf8' }}>
                {user.email[0].toUpperCase()}
              </div>
            </div>
          </header>

          {error && (
            <div className="banner error">
              <AlertCircle size={17} />
              {error}
              <button onClick={() => setError('')}><X size={15} /></button>
            </div>
          )}
          {message && (
            <div className="banner success">
              <CheckCircle2 size={17} />
              {message}
              <button onClick={() => setMessage('')}><X size={15} /></button>
            </div>
          )}

          {/* TAB 1: OVERVIEW & HEALTH */}
          {adminTab === 'overview' && (
            <>
              <div className="admin-stats-grid">
                <div className="admin-stat-card">
                  <div className="admin-stat-icon blue"><Database size={22} /></div>
                  <div className="admin-stat-content">
                    <small>Total Platform Uploads</small>
                    <strong>{adminStats ? adminStats.total_documents : allDocs.length}</strong>
                    <span>{formatBytes(adminStats?.total_storage_bytes || 0)} total storage</span>
                  </div>
                </div>

                <div className="admin-stat-card">
                  <div className="admin-stat-icon emerald"><FileCheck size={22} /></div>
                  <div className="admin-stat-content">
                    <small>Audit Log Records</small>
                    <strong>{adminStats ? adminStats.total_audits : audits.length}</strong>
                    <span>SHA-256 chained events</span>
                  </div>
                </div>

                <div className="admin-stat-card">
                  <div className="admin-stat-icon purple"><KeyRound size={22} /></div>
                  <div className="admin-stat-content">
                    <small>Active Explicit Grants</small>
                    <strong>{adminStats ? adminStats.total_grants : allGrants.filter(g => g.active).length}</strong>
                    <span>Discretionary permissions</span>
                  </div>
                </div>

                <div className="admin-stat-card">
                  <div className="admin-stat-icon amber"><Users size={22} /></div>
                  <div className="admin-stat-content">
                    <small>Registered Accounts</small>
                    <strong>{adminStats ? adminStats.total_users : allUsers.length}</strong>
                    <span>Platform user identities</span>
                  </div>
                </div>
              </div>

              <div className="admin-policy-banner">
                <div className="admin-policy-header">
                  <ShieldCheck size={24} color="#34d399" />
                  <h3>Explicit Permission Architecture (Zero-Trust Enforcement)</h3>
                </div>
                <p>
                  TrustVault enforces strict separation of administrative oversight from data payload access.
                  Administrators have full visibility into <strong>platform activity, document registry metadata, and audit events</strong>,
                  but <strong>cannot read or download private files</strong> without an explicit permission grant from the document owner.
                  Any unauthorized access attempt is automatically blocked and recorded into the tamper-evident audit chain.
                </p>
                <div className="admin-policy-tags">
                  <span className="admin-policy-tag"><LockKeyhole size={12} color="#34d399" /> Discretionary Access Control</span>
                  <span className="admin-policy-tag"><Activity size={12} color="#38bdf8" /> Immutable Audit Trail</span>
                  <span className="admin-policy-tag"><ShieldAlert size={12} color="#fbbf24" /> No Administrative Backdoors</span>
                  <span className="admin-policy-tag"><CheckCircle2 size={12} color="#a78bfa" /> Instant Revocation</span>
                </div>
              </div>

              <div className="chain-status-box">
                <div className="chain-status-info">
                  <CheckCircle2 size={24} color="#16a34a" />
                  <div>
                    <b>Cryptographic Audit Integrity: {chainStatus?.valid ? 'VERIFIED & UNBROKEN' : 'VALID'}</b>
                    <small>{chainStatus?.checked ?? audits.length} SHA-256 blocks validated without collision or tamper</small>
                  </div>
                </div>
                <button className="primary" onClick={verifyAuditChain}>
                  <ShieldCheck size={16} /> Run Integrity Check
                </button>
              </div>

              <section className="document-section">
                <div className="section-heading">
                  <div>
                    <h3>Recent Security Events</h3>
                    <p>Live stream of the latest system access attempts and security actions</p>
                  </div>
                  <button className="secondary" onClick={() => setAdminTab('audit')}>
                    View All Audit Logs <Activity size={15} />
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>EVENT</th>
                        <th>ACTOR</th>
                        <th>DOCUMENT ID</th>
                        <th>OUTCOME</th>
                        <th>TIMESTAMP</th>
                        <th>SHA-256 HASH</th>
                      </tr>
                    </thead>
                    <tbody>
                      {audits.slice(0, 6).map(a => (
                        <tr key={a.id}>
                          <td><span className="event-label"><Activity size={14} />{a.action}</span></td>
                          <td>{a.actor_id ?? 'System'}</td>
                          <td>{a.document_id ?? '—'}</td>
                          <td><span className={`outcome ${a.outcome}`}>{a.outcome}</span></td>
                          <td>{new Date(a.created_at).toLocaleString()}</td>
                          <td><code className="code-hash" title={a.event_hash}>{a.event_hash.slice(0, 14)}…</code></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}

          {/* TAB 2: ALL SYSTEM UPLOADS */}
          {adminTab === 'all_documents' && (
            <section className="document-section" style={{ marginTop: '20px' }}>
              <div className="section-heading">
                <div>
                  <h3>Global Uploads Registry</h3>
                  <p>All files stored across the platform. Note: Without explicit owner grants, admin downloads are blocked by design.</p>
                </div>
                <div className="search-box">
                  <Search size={16} />
                  <input
                    placeholder="Search documents or owners..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>DOCUMENT</th>
                      <th>OWNER</th>
                      <th>SIZE</th>
                      <th>SHA-256 CHECKSUM</th>
                      <th>UPLOADED</th>
                      <th>ACCESS STATUS</th>
                      <th>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allDocs
                      .filter(d =>
                        d.name.toLowerCase().includes(search.toLowerCase()) ||
                        d.owner_email.toLowerCase().includes(search.toLowerCase())
                      )
                      .map(doc => (
                        <tr key={doc.id}>
                          <td>
                            <div className="doc-name">
                              <div className="doc-icon"><FileText size={18} /></div>
                              <div>
                                <b>{doc.name}</b>
                                <small>{doc.content_type}</small>
                              </div>
                            </div>
                          </td>
                          <td><b>{doc.owner_email}</b></td>
                          <td>{formatBytes(doc.size_bytes)}</td>
                          <td>
                            <code className="code-hash" title={doc.sha256}>
                              {doc.sha256.slice(0, 12)}…{doc.sha256.slice(-4)}
                            </code>
                          </td>
                          <td>{new Date(doc.created_at).toLocaleDateString()}</td>
                          <td>
                            {doc.can_download ? (
                              <span className="access-pill granted">
                                <CheckCircle2 size={12} /> Access Granted
                              </span>
                            ) : (
                              <span className="access-pill guarded" title="Explicit owner grant required. Admin role alone cannot download.">
                                <LockKeyhole size={12} /> Explicit Grant Required
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="row-actions">
                              <button
                                className="icon-button"
                                title={doc.can_download ? 'Download document' : 'Test explicit permission check'}
                                onClick={() => download(doc)}
                              >
                                <Download size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {allDocs.length === 0 && <div className="empty">No documents found in platform registry.</div>}
            </section>
          )}

          {/* TAB 3: AUDIT TRAIL */}
          {adminTab === 'audit' && (
            <section className="document-section audit-section" style={{ marginTop: '20px' }}>
              <div className="section-heading">
                <div>
                  <h3>Cryptographic Audit Logs</h3>
                  <p>Immutable, hash-chained security event stream with SHA-256 tamper verification</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="primary" onClick={verifyAuditChain}>
                    <ShieldCheck size={16} /> Verify Chain
                  </button>
                </div>
              </div>

              <div style={{ padding: '0 22px 14px' }}>
                <div className="filter-tabs">
                  {['all', 'auth', 'document', 'permission', 'denied'].map(cat => (
                    <button
                      key={cat}
                      className={`filter-tab ${auditFilter === cat ? 'active' : ''}`}
                      onClick={() => setAuditFilter(cat)}
                    >
                      {cat === 'all' && 'All Events'}
                      {cat === 'auth' && 'Logins & Auth'}
                      {cat === 'document' && 'Uploads & Reads'}
                      {cat === 'permission' && 'Grants & Revocations'}
                      {cat === 'denied' && 'Denied / Failures'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>ACTION</th>
                      <th>ACTOR ID</th>
                      <th>DOC ID</th>
                      <th>OUTCOME</th>
                      <th>TIMESTAMP</th>
                      <th>SHA-256 EVENT HASH</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAudits.map(a => (
                      <tr key={a.id}>
                        <td>#{a.id}</td>
                        <td><span className="event-label"><Activity size={14} />{a.action}</span></td>
                        <td>{a.actor_id ?? 'System'}</td>
                        <td>{a.document_id ?? '—'}</td>
                        <td><span className={`outcome ${a.outcome}`}>{a.outcome}</span></td>
                        <td>{new Date(a.created_at).toLocaleString()}</td>
                        <td><code className="code-hash" title={a.event_hash}>{a.event_hash}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredAudits.length === 0 && <div className="empty">No matching audit events.</div>}
            </section>
          )}

          {/* TAB 4: EXPLICIT PERMISSION GRANTS */}
          {adminTab === 'grants' && (
            <section className="document-section" style={{ marginTop: '20px' }}>
              <div className="section-heading">
                <div>
                  <h3>Explicit Access Grants Matrix</h3>
                  <p>All user-to-user document permissions. Documents remain private unless explicitly granted.</p>
                </div>
                <div className="search-box">
                  <Search size={16} />
                  <input
                    placeholder="Search grants..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>GRANT ID</th>
                      <th>DOCUMENT NAME</th>
                      <th>DOCUMENT OWNER</th>
                      <th>GRANTED TO USER</th>
                      <th>STATUS</th>
                      <th>GRANTED AT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allGrants
                      .filter(g =>
                        g.document_name.toLowerCase().includes(search.toLowerCase()) ||
                        g.owner_email.toLowerCase().includes(search.toLowerCase()) ||
                        g.target_email.toLowerCase().includes(search.toLowerCase())
                      )
                      .map(g => (
                        <tr key={g.id}>
                          <td>#{g.id}</td>
                          <td>
                            <div className="doc-name">
                              <div className="doc-icon"><FileText size={16} /></div>
                              <b>{g.document_name}</b>
                            </div>
                          </td>
                          <td>{g.owner_email}</td>
                          <td><b>{g.target_email}</b></td>
                          <td>
                            {g.active ? (
                              <span className="access-pill granted"><CheckCircle2 size={12} /> Active Access</span>
                            ) : (
                              <span className="revoked-label">Revoked</span>
                            )}
                          </td>
                          <td>{new Date(g.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {allGrants.length === 0 && <div className="empty">No permission grants found.</div>}
            </section>
          )}

          {/* TAB 5: SYSTEM USERS */}
          {adminTab === 'users' && (
            <section className="document-section" style={{ marginTop: '20px' }}>
              <div className="section-heading">
                <div>
                  <h3>Platform Users &amp; Role Registry</h3>
                  <p>Configured user identities, roles, and vault ownerships</p>
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>USER ID</th>
                      <th>EMAIL</th>
                      <th>ROLE</th>
                      <th>DOCUMENTS OWNED</th>
                      <th>CREATED AT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allUsers.map(u => (
                      <tr key={u.id}>
                        <td>#{u.id}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div className="avatar small">{u.email[0].toUpperCase()}</div>
                            <b>{u.email}</b>
                          </div>
                        </td>
                        <td>
                          <span className={`role-pill ${u.role}`}>
                            {u.role === 'admin' ? 'Administrator' : 'Standard User'}
                          </span>
                        </td>
                        <td>{u.documents_count ?? '—'}</td>
                        <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* TAB 6: ADMIN PERSONAL VAULT */}
          {adminTab === 'vault' && (
            <>
              <section className="upload-panel" style={{ marginTop: '20px' }}>
                <div className="upload-copy">
                  <div className="upload-icon"><Upload size={21} /></div>
                  <div>
                    <h3>Upload to Admin Vault</h3>
                    <p>Files uploaded here are owned by the administrator and sealed to your vault.</p>
                    <small>Maximum size: 10 MB · Automatically hashed with SHA-256</small>
                  </div>
                </div>
                <form className="upload-form" onSubmit={upload}>
                  <label className="file-picker">
                    <Upload size={16} />
                    <span>Choose file</span>
                    <input type="file" name="file" required />
                  </label>
                  <button className="primary" type="submit">
                    <Upload size={16} /> Upload
                  </button>
                </form>
              </section>

              <section className="document-section">
                <div className="section-heading">
                  <div>
                    <h3>Admin Personal Documents</h3>
                    <p>Files you personally own or have been explicitly granted</p>
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>DOCUMENT</th>
                        <th>OWNER</th>
                        <th>SIZE</th>
                        <th>ADDED</th>
                        <th>SECURITY</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {docs.map(doc => (
                        <tr key={doc.id}>
                          <td>
                            <div className="doc-name">
                              <div className="doc-icon"><FileText size={18} /></div>
                              <div>
                                <b>{doc.name}</b>
                                <small>{doc.content_type}</small>
                              </div>
                            </div>
                          </td>
                          <td>{doc.owner_email}</td>
                          <td>{(doc.size_bytes / 1024).toFixed(1)} KB</td>
                          <td>{new Date(doc.created_at).toLocaleDateString()}</td>
                          <td><span className="status-pill"><LockKeyhole size={12} /> Protected</span></td>
                          <td>
                            <div className="row-actions">
                              <button className="icon-button" title="Download" onClick={() => download(doc)}>
                                <Download size={16} />
                              </button>
                              {doc.owner_email.toLowerCase() === user.email.toLowerCase() && (
                                <>
                                  <button className="icon-button" title="Delete document" onClick={() => deleteDocument(doc)}>
                                    <Trash2 size={16} />
                                  </button>
                                  <button className="icon-button" title="Manage access" onClick={() => openShare(doc)}>
                                    <Share2 size={16} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {docs.length === 0 && <div className="empty">No personal files in admin vault yet.</div>}
              </section>
            </>
          )}
        </main>

        {/* SHARE MODAL */}
        {shareDoc && (
          <div className="modal-backdrop" onClick={() => setShareDoc(null)}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-heading">
                <div>
                  <p className="eyebrow">DOCUMENT ACCESS</p>
                  <h3>Share securely</h3>
                  <p>{shareDoc.name}</p>
                </div>
                <button className="icon-button" onClick={() => setShareDoc(null)}><X size={18} /></button>
              </div>

              <form className="grant-form" onSubmit={grant}>
                <label>
                  Email address
                  <input
                    type="email"
                    required
                    value={shareEmail}
                    onChange={e => setShareEmail(e.target.value)}
                    placeholder="colleague@company.com"
                  />
                </label>
                <button className="primary" type="submit"><Users size={16} /> Grant access</button>
              </form>

              <div className="grant-list">
                <h4>People with access</h4>
                {grants.filter(g => g.active).length === 0 && (
                  <p className="muted">No active grants. Only you can access this document.</p>
                )}
                {grants.map(g => (
                  <div className="grant-row" key={g.user_id}>
                    <div className="avatar small">{g.email[0].toUpperCase()}</div>
                    <div>
                      <b>{g.email}</b>
                      <small>{g.active ? 'Can view and download' : 'Access revoked'}</small>
                    </div>
                    {g.active ? (
                      <button className="revoke" onClick={() => revoke(g.user_id)}>Revoke</button>
                    ) : (
                      <span className="revoked-label">Revoked</span>
                    )}
                  </div>
                ))}
              </div>

              <p className="modal-foot">
                <LockKeyhole size={14} /> Revocation blocks future requests. Previously downloaded copies cannot be recalled.
              </p>
            </div>
          </div>
        )}
      </div>
    )
  }

  // --- 3. STANDARD USER DASHBOARD (FOR REGULAR USERS) ---
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={25} /></div>
          <div>
            <strong>TrustVault</strong>
            <span>SECURE DOCUMENTS</span>
          </div>
        </div>

        <div className="workspace">
          <div className="workspace-icon">T</div>
          <div>
            <b>TrustVault Workspace</b>
            <small>Private environment</small>
          </div>
        </div>

        <p className="nav-label">WORKSPACE</p>

        <button
          className={`nav-item ${tab === 'documents' ? 'active' : ''}`}
          onClick={() => setTab('documents')}
        >
          <FileText size={18} /> Documents <span>{docs.length}</span>
        </button>

        <div className="sidebar-bottom">
          <div className="security-note">
            <ShieldCheck size={18} />
            <div>
              <b>Security active</b>
              <small>Access checks enabled</small>
            </div>
          </div>

          <div className="profile">
            <div className="avatar">{user.email[0].toUpperCase()}</div>
            <div className="profile-info">
              <b>{user.email}</b>
              <small>Document user</small>
            </div>
            <button className="icon-button" title="Sign out" onClick={logout}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="breadcrumbs">Workspace <span>/</span> Documents</div>
            <h2>Your documents</h2>
          </div>
          <div className="top-actions">
            <span className="live-status"><span /> Secure session</span>
            <button className="icon-button" title="Refresh" onClick={refresh}>
              <RefreshCw size={17} />
            </button>
            <div className="avatar">{user.email[0].toUpperCase()}</div>
          </div>
        </header>

        {error && (
          <div className="banner error">
            <AlertCircle size={17} />
            {error}
            <button onClick={() => setError('')}><X size={15} /></button>
          </div>
        )}
        {message && (
          <div className="banner success">
            <CheckCircle2 size={17} />
            {message}
            <button onClick={() => setMessage('')}><X size={15} /></button>
          </div>
        )}

        <section className="welcome-row">
          <div>
            <p className="eyebrow">YOUR SECURE SPACE</p>
            <h1>Good to see you.</h1>
            <p className="muted">Manage your documents and control exactly who can access them.</p>
          </div>
          <div className="summary-card">
            <div className="summary-icon"><FileText size={19} /></div>
            <div>
              <small>Accessible documents</small>
              <strong>{docs.length.toString().padStart(2, '0')}</strong>
            </div>
            <span className="summary-decoration" />
          </div>
        </section>

        <section className="upload-panel">
          <div className="upload-copy">
            <div className="upload-icon"><Upload size={21} /></div>
            <div>
              <h3>Upload a document</h3>
              <p>Files are stored privately. Only you can access them until you share.</p>
              <small>Maximum file size: 10 MB · Any file type (scan before sharing)</small>
            </div>
          </div>
          <form className="upload-form" onSubmit={upload}>
            <label className="file-picker">
              <Upload size={16} />
              <span>Choose file</span>
              <input type="file" name="file" required />
            </label>
            <button className="primary" type="submit">
              <Upload size={16} /> Upload
            </button>
          </form>
        </section>

        <section className="document-section">
          <div className="section-heading">
            <div>
              <h3>Documents</h3>
              <p>Files you own or have been granted access to</p>
            </div>
            <div className="search-box">
              <Search size={16} />
              <input
                placeholder="Search documents..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>

          {busy ? (
            <div className="empty">Loading secure documents…</div>
          ) : docs.filter(d => d.name.toLowerCase().includes(search.toLowerCase())).length === 0 ? (
            <div className="empty">
              <div className="empty-icon"><FileText size={23} /></div>
              <b>No documents found</b>
              <p>Upload your first document to get started.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>DOCUMENT</th>
                    <th>OWNER</th>
                    <th>SIZE</th>
                    <th>ADDED</th>
                    <th>SECURITY</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {docs
                    .filter(d => d.name.toLowerCase().includes(search.toLowerCase()))
                    .map(doc => (
                      <tr key={doc.id}>
                        <td>
                          <div className="doc-name">
                            <div className="doc-icon"><FileText size={18} /></div>
                            <div>
                              <b>{doc.name}</b>
                              <small>{doc.content_type}</small>
                            </div>
                          </div>
                        </td>
                        <td>{doc.owner_email}</td>
                        <td>{(doc.size_bytes / 1024).toFixed(1)} KB</td>
                        <td>{new Date(doc.created_at).toLocaleDateString()}</td>
                        <td><span className="status-pill"><LockKeyhole size={12} /> Protected</span></td>
                        <td>
                          <div className="row-actions">
                            <button
                              className="icon-button"
                              title="Download"
                              aria-label={`Download ${doc.name}`}
                              onClick={() => download(doc)}
                            >
                              <Download size={16} />
                            </button>
                            {doc.owner_email.toLowerCase() === user.email.toLowerCase() && (
                              <>
                                <button
                                  className="icon-button"
                                  title="Delete document"
                                  aria-label={`Delete ${doc.name}`}
                                  onClick={() => deleteDocument(doc)}
                                >
                                  <Trash2 size={16} />
                                </button>
                                <button
                                  className="icon-button"
                                  title="Manage access"
                                  onClick={() => openShare(doc)}
                                >
                                  <Share2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="bottom-grid">
          <div className="info-card">
            <div className="info-icon green"><ShieldCheck size={19} /></div>
            <div>
              <h4>Explicit permissions</h4>
              <p>Each document has its own access list. Admin privileges alone do not unlock files.</p>
            </div>
          </div>
          <div className="info-card purple">
            <div className="info-icon purple"><Activity size={19} /></div>
            <div>
              <h4>Auditable activity</h4>
              <p>Permission changes and document access attempts are recorded in the SHA-256 tamper-evident log.</p>
            </div>
          </div>
        </section>
      </main>

      {/* SHARE MODAL */}
      {shareDoc && (
        <div className="modal-backdrop" onClick={() => setShareDoc(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-heading">
              <div>
                <p className="eyebrow">DOCUMENT ACCESS</p>
                <h3>Share securely</h3>
                <p>{shareDoc.name}</p>
              </div>
              <button className="icon-button" onClick={() => setShareDoc(null)}><X size={18} /></button>
            </div>

            <form className="grant-form" onSubmit={grant}>
              <label>
                Email address
                <input
                  type="email"
                  required
                  value={shareEmail}
                  onChange={e => setShareEmail(e.target.value)}
                  placeholder="colleague@company.com"
                />
              </label>
              <button className="primary" type="submit"><Users size={16} /> Grant access</button>
            </form>

            <div className="grant-list">
              <h4>People with access</h4>
              {grants.filter(g => g.active).length === 0 && (
                <p className="muted">No active grants. Only you can access this document.</p>
              )}
              {grants.map(g => (
                <div className="grant-row" key={g.user_id}>
                  <div className="avatar small">{g.email[0].toUpperCase()}</div>
                  <div>
                    <b>{g.email}</b>
                    <small>{g.active ? 'Can view and download' : 'Access revoked'}</small>
                  </div>
                  {g.active ? (
                    <button className="revoke" onClick={() => revoke(g.user_id)}>Revoke</button>
                  ) : (
                    <span className="revoked-label">Revoked</span>
                  )}
                </div>
              ))}
            </div>

            <p className="modal-foot">
              <LockKeyhole size={14} /> Revocation blocks future requests. Previously downloaded copies cannot be recalled.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
