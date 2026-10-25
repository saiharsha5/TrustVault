import { useEffect, useState, type FormEvent } from 'react'
import { ShieldCheck, LockKeyhole, FileText, Upload, Search, LogOut, Users, Activity, RefreshCw, Download, Share2, Trash2, X, CheckCircle2, AlertCircle } from 'lucide-react'

const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000'
type User = { id:number; email:string; role:string }
type Doc = { id:number; name:string; owner_email:string; content_type:string; size_bytes:number; sha256:string; created_at:string }
type Audit = { id:number; action:string; actor_id:number|null; document_id:number|null; outcome:string; created_at:string; event_hash:string }

async function api(path:string, init:RequestInit={}) {
  const response = await fetch(`${API}${path}`, { ...init, credentials:'include' })
  const data = await response.json().catch(()=>({detail:'Unexpected server response'}))
  if (!response.ok) throw new Error(data.detail || `Request failed (${response.status})`)
  return data
}
function App() {
  const [user,setUser] = useState<User|null>(null)
  const [email,setEmail] = useState('')
  const [password,setPassword] = useState('')
  const [mode,setMode] = useState<'login'|'register'>('login')
  const [docs,setDocs] = useState<Doc[]>([])
  const [audits,setAudits] = useState<Audit[]>([])
  const [search,setSearch] = useState('')
  const [message,setMessage] = useState('')
  const [error,setError] = useState('')
  const [busy,setBusy] = useState(false)
  const [shareDoc,setShareDoc] = useState<Doc|null>(null)
  const [shareEmail,setShareEmail] = useState('')
  const [grants,setGrants] = useState<any[]>([])
  const [tab,setTab] = useState<'documents'|'audit'>('documents')

  async function refresh() {
    if (!user) return
    setBusy(true)
    try {
      setDocs(await api('/documents'))
      if (user.role === 'admin') setAudits(await api('/audit/events?limit=100'))
    } catch(e:any) { setError(e.message) } finally { setBusy(false) }
  }
  useEffect(()=>{ api('/auth/me').then(setUser).catch(()=>setUser(null)) },[])
  useEffect(()=>{ if(user) refresh() },[user?.id])
  async function auth(e:FormEvent) {
    e.preventDefault(); setError(''); setMessage('')
    try {
      if(mode==='register') await api('/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})})
      const result = await api('/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})})
      setUser(result.user); setMessage('Welcome to TrustVault.')
    } catch(e:any) { setError(e.message) }
  }
  async function logout() { try { await api('/auth/logout',{method:'POST'}); setUser(null); setDocs([]); setAudits([]); setMessage('Signed out securely.') } catch(e:any) { setError(e.message) } }
  async function upload(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(''); setMessage('')
    const form = e.currentTarget
    const input = form.elements.namedItem('file') as HTMLInputElement
    if(!input.files?.[0]) return
    const body = new FormData(); body.append('file',input.files[0])
    try { await api('/documents',{method:'POST',body}); setMessage('Document uploaded to private storage.'); form.reset(); await refresh() } catch(e:any) { setError(e.message) }
  }
  async function openShare(doc:Doc) {
    setShareDoc(doc); setShareEmail('')
    try { setGrants(await api(`/documents/${doc.id}/grants`)) } catch(e:any) { setGrants([]); setError(e.message) }
  }
  async function grant(e:FormEvent) {
    e.preventDefault(); if(!shareDoc) return
    try { await api(`/documents/${shareDoc.id}/grants`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:shareEmail})}); setMessage(`Access granted to ${shareEmail}`); setGrants(await api(`/documents/${shareDoc.id}/grants`)); setShareEmail('') } catch(e:any) { setError(e.message) }
  }
  async function revoke(userId:number) {
    if(!shareDoc) return
    try { await api(`/documents/${shareDoc.id}/grants/${userId}`,{method:'DELETE'}); setMessage('Access revoked. Future requests will be denied.'); setGrants(await api(`/documents/${shareDoc.id}/grants`)) } catch(e:any) { setError(e.message) }
  }
  async function download(doc:Doc) {
    try {
      const response = await fetch(`${API}/documents/${doc.id}/download`,{credentials:'include'})
      if(!response.ok) { const d=await response.json().catch(()=>({})); throw new Error(d.detail || 'Download failed') }
      const blob = await response.blob(); const url = URL.createObjectURL(blob)
      const a = document.createElement('a'); a.href=url; a.download=doc.name; a.click(); URL.revokeObjectURL(url)
    } catch(e:any) { setError(e.message) }
  }
  async function deleteDocument(doc:Doc) {
    const confirmed = window.confirm(`Are you sure you want to permanently delete "${doc.name}"? This cannot be undone.`)
    if (!confirmed) return
    setError(''); setMessage('')
    try {
      await api(`/documents/${doc.id}`, {method:'DELETE'})
      setDocs(current => current.filter(item => item.id !== doc.id))
      setMessage(`"${doc.name}" was deleted successfully.`)
      if (shareDoc?.id === doc.id) setShareDoc(null)
    } catch(e:any) { setError(e.message) }
  }
if (!user) {
  return (
  <div className="auth-shell">
    <div className="auth-card">
      <div className="brand">
        <div className="brand-mark">
          <ShieldCheck size={25}/>
        </div>
        <div>
          <strong>TrustVault</strong>
          <span>SECURE DOCUMENTS</span>
        </div>
      </div>

      <div className="auth-copy">
        <p className="eyebrow">PRIVATE BY DESIGN</p>
        <h1>Your files.<br/><em>Your control.</em></h1>
        <p className="muted">
          Share sensitive documents with confidence. Every permission is explicit.
          Every access leaves a trail.
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
          <LockKeyhole size={16}/>
        </button>
      </form>

      {mode === 'login' && (
        <div className="demo-login" style={{ marginTop: '18px' }}>
          <p className="muted" style={{ marginBottom: '10px' }}>
            Demo access — hover over an account to fill its credentials
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
            <button
              type="button"
              className="link-button"
              onMouseEnter={() => {
                setEmail('admin@trustvault.local')
                setPassword('Rockstar@1')
                setError('')
                setMessage('')
              }}
              onFocus={() => {
                setEmail('admin@trustvault.local')
                setPassword('Rockstar@1')
                setError('')
                setMessage('')
              }}
              style={{ border: '1px solid #d8e2ec', borderRadius: '12px', padding: '14px 10px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center', cursor: 'pointer' }}
            >
              <ShieldCheck size={20} />
              <strong>Admin Account</strong>
              <span style={{ fontSize: '12px' }}>Admin ID &amp; password</span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>Hover to autofill</span>
            </button>
            <button
              type="button"
              className="link-button"
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
              style={{ border: '1px solid #d8e2ec', borderRadius: '12px', padding: '14px 10px', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'center', cursor: 'pointer' }}
            >
              <Users size={20} />
              <strong>User Account</strong>
              <span style={{ fontSize: '12px' }}>User ID &amp; password</span>
              <span style={{ fontSize: '11px', color: '#64748b' }}>Hover to autofill</span>
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
        {mode === 'login'
          ? 'New to TrustVault? Create an account'
          : 'Already registered? Sign in'}
      </button>

      {error && (
        <p className="notice error">
          <AlertCircle size={16}/>{error}
        </p>
      )}

      {message && (
        <p className="notice success">{message}</p>
      )}

      <div className="auth-foot">
        <LockKeyhole size={14}/>
        Protected with per-document authorization
      </div>
    </div>

    <div className="auth-side">
      <div className="side-orb orb1"/>
      <div className="side-orb orb2"/>

      <div className="side-content">
        <div className="floating-card">
          <div className="file-icon"><FileText size={22}/></div>
          <div>
            <b>Confidential.pdf</b>
            <small>Access restricted</small>
          </div>
          <span className="secure-pill">
            <LockKeyhole size={13}/> Protected
          </span>
        </div>

        <div className="floating-card offset">
          <div className="event-icon"><Activity size={21}/></div>
          <div>
            <b>Audit event recorded</b>
            <small>Hash verified · SHA-256</small>
          </div>
          <CheckCircle2 className="verified" size={19}/>
        </div>

        <div className="side-caption">
          <span className="pulse"/> SECURITY THAT LEAVES EVIDENCE
        </div>
      </div>
    </div>
  </div>
)
}

return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-mark"><ShieldCheck size={25}/></div><div><strong>TrustVault</strong><span>SECURE DOCUMENTS</span></div></div><div className="workspace"><div className="workspace-icon">T</div><div><b>TrustVault Workspace</b><small>Private environment</small></div></div><p className="nav-label">WORKSPACE</p><button className={`nav-item ${tab==='documents'?'active':''}`} onClick={()=>setTab('documents')}><FileText size={18}/> Documents <span>{docs.length}</span></button>{user.role==='admin'&&<button className={`nav-item ${tab==='audit'?'active':''}`} onClick={()=>setTab('audit')}><Activity size={18}/> Audit trail</button>}<div className="sidebar-bottom"><div className="security-note"><ShieldCheck size={18}/><div><b>Security active</b><small>Access checks enabled</small></div></div><div className="profile"><div className="avatar">{user.email[0].toUpperCase()}</div><div className="profile-info"><b>{user.email}</b><small>{user.role==='admin'?'Administrator':'Document user'}</small></div><button className="icon-button" title="Sign out" onClick={logout}><LogOut size={17}/></button></div></div></aside><main className="main"><header className="topbar"><div><div className="breadcrumbs">Workspace <span>/</span> {tab==='documents'?'Documents':'Audit trail'}</div><h2>{tab==='documents'?'Your documents':'Security audit trail'}</h2></div><div className="top-actions"><span className="live-status"><span/> Secure session</span><button className="icon-button" title="Refresh" onClick={refresh}><RefreshCw size={17}/></button><div className="avatar">{user.email[0].toUpperCase()}</div></div></header>{error&&<div className="banner error"><AlertCircle size={17}/>{error}<button onClick={()=>setError('')}><X size={15}/></button></div>}{message&&<div className="banner success"><CheckCircle2 size={17}/>{message}<button onClick={()=>setMessage('')}><X size={15}/></button></div>}{tab==='documents'?<><section className="welcome-row"><div><p className="eyebrow">YOUR SECURE SPACE</p><h1>Good to see you.</h1><p className="muted">Manage your documents and control exactly who can access them.</p></div><div className="summary-card"><div className="summary-icon"><FileText size={19}/></div><div><small>Accessible documents</small><strong>{docs.length.toString().padStart(2,'0')}</strong></div><span className="summary-decoration"/></div></section><section className="upload-panel"><div className="upload-copy"><div className="upload-icon"><Upload size={21}/></div><div><h3>Upload a document</h3><p>Files are stored privately. Only you can access them until you share.</p><small>Maximum file size: 10 MB · Any file type (scan before sharing)</small></div></div><form className="upload-form" onSubmit={upload}><label className="file-picker"><Upload size={16}/><span>Choose file</span><input type="file" name="file" required/></label><button className="primary" type="submit"><Upload size={16}/> Upload</button></form></section><section className="document-section"><div className="section-heading"><div><h3>Documents</h3><p>Files you own or have been granted access to</p></div><div className="search-box"><Search size={16}/><input placeholder="Search documents..." value={search} onChange={e=>setSearch(e.target.value)}/></div></div>{busy?<div className="empty">Loading secure documents…</div>:docs.filter(d=>d.name.toLowerCase().includes(search.toLowerCase())).length===0?<div className="empty"><div className="empty-icon"><FileText size={23}/></div><b>No documents found</b><p>Upload your first document to get started.</p></div>:<div className="table-wrap"><table><thead><tr><th>DOCUMENT</th><th>OWNER</th><th>SIZE</th><th>ADDED</th><th>SECURITY</th><th></th></tr></thead><tbody>{docs.filter(d=>d.name.toLowerCase().includes(search.toLowerCase())).map(doc=><tr key={doc.id}><td><div className="doc-name"><div className="doc-icon"><FileText size={18}/></div><div><b>{doc.name}</b><small>{doc.content_type}</small></div></div></td><td>{doc.owner_email}</td><td>{(doc.size_bytes/1024).toFixed(1)} KB</td><td>{new Date(doc.created_at).toLocaleDateString()}</td><td><span className="status-pill"><LockKeyhole size={12}/> Protected</span></td><td><div className="row-actions"><button className="icon-button" title="Download" aria-label={`Download ${doc.name}`} onClick={()=>download(doc)}><Download size={16}/></button>{doc.owner_email.toLowerCase()===user.email.toLowerCase()&&<><button className="icon-button" title="Delete document" aria-label={`Delete ${doc.name}`} onClick={()=>deleteDocument(doc)}><Trash2 size={16}/></button><button className="icon-button" title="Manage access" onClick={()=>openShare(doc)}><Share2 size={16}/></button></>}</div></td></tr>)}</tbody></table></div>}</section><section className="bottom-grid"><div className="info-card"><div className="info-icon green"><ShieldCheck size={19}/></div><div><h4>Explicit permissions</h4><p>Each document has its own access list. Admin privileges alone do not unlock files.</p></div></div><div className="info-card"><div className="info-icon purple"><Activity size={19}/></div><div><h4>Auditable activity</h4><p>Permission changes and document access attempts are recorded for review.</p></div></div></section></>:<section className="document-section audit-section"><div className="section-heading"><div><h3>Recent security events</h3><p>Hash-chained events · SHA-256</p></div><button className="secondary" onClick={()=>api('/audit/verify').then(r=>setMessage(`Audit chain ${r.valid?'valid':'INVALID'} — ${r.checked} records checked.`)).catch(e=>setError(e.message))}><ShieldCheck size={16}/> Verify chain</button></div><div className="table-wrap"><table><thead><tr><th>EVENT</th><th>ACTOR ID</th><th>DOCUMENT ID</th><th>OUTCOME</th><th>TIMESTAMP</th><th>HASH</th></tr></thead><tbody>{audits.map(a=><tr key={a.id}><td><span className="event-label"><Activity size={14}/>{a.action}</span></td><td>{a.actor_id??'System'}</td><td>{a.document_id??'—'}</td><td><span className={`outcome ${a.outcome}`}>{a.outcome}</span></td><td>{new Date(a.created_at).toLocaleString()}</td><td><code title={a.event_hash}>{a.event_hash.slice(0,12)}…</code></td></tr>)}</tbody></table></div>{audits.length===0&&<div className="empty">No audit events yet.</div>}</section>}</main>{shareDoc&&<div className="modal-backdrop" onClick={()=>setShareDoc(null)}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">DOCUMENT ACCESS</p><h3>Share securely</h3><p>{shareDoc.name}</p></div><button className="icon-button" onClick={()=>setShareDoc(null)}><X size={18}/></button></div><form className="grant-form" onSubmit={grant}><label>Email address<input type="email" required value={shareEmail} onChange={e=>setShareEmail(e.target.value)} placeholder="colleague@company.com"/></label><button className="primary" type="submit"><Users size={16}/> Grant access</button></form><div className="grant-list"><h4>People with access</h4>{grants.filter(g=>g.active).length===0&&<p className="muted">No active grants. Only you can access this document.</p>}{grants.map(g=><div className="grant-row" key={g.user_id}><div className="avatar small">{g.email[0].toUpperCase()}</div><div><b>{g.email}</b><small>{g.active?'Can view and download':'Access revoked'}</small></div>{g.active?<button className="revoke" onClick={()=>revoke(g.user_id)}>Revoke</button>:<span className="revoked-label">Revoked</span>}</div>)}</div><p className="modal-foot"><LockKeyhole size={14}/> Revocation blocks future requests. Previously downloaded copies cannot be recalled.</p></div></div>}</div>
}
export default App