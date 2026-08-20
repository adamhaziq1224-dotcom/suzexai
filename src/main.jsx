import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CalendarDays, CheckCircle2, ChevronDown, CircleDollarSign, ClipboardList, Eye, LayoutDashboard, LoaderCircle, Pencil, Plus, ReceiptText, Sparkles, Target, Trash2, Users, WalletCards, X } from 'lucide-react'
import './styles.css'
import './actions.css'
import './event-theme.css'
import './targets.css'

const emptyEvent = { name: '', starts_on: '', ends_on: '', venue: '' }
const emptyVendor = { company_name: '', contact_name: '', email: '', business_type: '', fee_amount: '', payment_status: 'pending', tent_rental: false, deposit_amount: '', deposit_status: 'not_required', deposit_returned: false, vendor_status: 'active' }
const emptyVolunteer = { full_name: '', email: '', role_name: '', shift_label: '' }
const emptyTask = { title: '', scope: '', due_date: '', status: 'todo', assignee_name: '', volunteer_role: '', volunteer_name: '', cost_of_sales: '', sales_revenue: '' }
const emptyExpense = { item_name: '', expense_date: '', category: 'Logistics', amount: '', payment_status: 'paid', receipt_path: '' }
const storageKey = 'suzexAi-local-workspace-v1'
const emptyDatabase = { events: [], vendors: [], volunteers: [], tasks: [], expenses: [], monthly_targets: [] }

function readDatabase() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
    return saved ? { ...emptyDatabase, ...saved } : { ...emptyDatabase }
  } catch { return { ...emptyDatabase } }
}
function writeDatabase(data) { localStorage.setItem(storageKey, JSON.stringify(data)) }
function newId() { return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}` }
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function sanitizeNumeric(values, fields) {
  return fields.reduce((cleaned, field) => ({ ...cleaned, [field]: values[field] === '' || values[field] === null || values[field] === undefined ? 0 : Number(values[field]) }), { ...values })
}
function sanitizeOptionalDates(values, fields) {
  return fields.reduce((cleaned, field) => ({ ...cleaned, [field]: values[field] === '' ? null : values[field] }), { ...values })
}
function eventDateLabel(event) {
  if (!event?.starts_on) return 'Pick or create an event workspace'
  const format = (date) => new Date(`${date}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return event.ends_on && event.ends_on !== event.starts_on ? `${format(event.starts_on)} – ${format(event.ends_on)}` : format(event.starts_on)
}

function App() {
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [workspace, setWorkspace] = useState({ events: [], vendors: [], volunteers: [], tasks: [], expenses: [] })
  const [targetMonth, setTargetMonth] = useState(new Date().toISOString().slice(0, 7))
  const [monthlyTarget, setMonthlyTarget] = useState(null)
  const [activeEvent, setActiveEvent] = useState(null)
  const [view, setView] = useState('overview')
  const [modal, setModal] = useState(null)
  const [editing, setEditing] = useState(null)
  const [eventMenuOpen, setEventMenuOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadWorkspace().finally(() => setLoading(false))
  }, [])

  useEffect(() => { if (activeEvent) loadMonthlyTarget() }, [activeEvent?.id, targetMonth])

  const eventId = activeEvent?.id
  async function loadWorkspace() {
    setLoading(true)
    const database = readDatabase()
    const events = [...database.events].sort((a, b) => (a.starts_on || '').localeCompare(b.starts_on || ''))
    setWorkspace({ events: events || [], vendors: [], volunteers: [], tasks: [], expenses: [] })
    const current = events?.find((event) => event.id === activeEvent?.id) || events?.[0] || null
    setActiveEvent(current)
    if (current) await loadEventData(current.id)
    setLoading(false)
  }
  async function loadEventData(id) {
    const database = readDatabase()
    const forEvent = (table, sortBy, direction = 1) => database[table].filter((record) => record.event_id === id).sort((a, b) => direction * String(a[sortBy] || '').localeCompare(String(b[sortBy] || '')))
    setWorkspace((current) => ({ ...current, vendors: forEvent('vendors', 'company_name'), volunteers: forEvent('volunteers', 'full_name'), tasks: forEvent('tasks', 'due_date'), expenses: forEvent('expenses', 'expense_date', -1) }))
  }
  async function loadMonthlyTarget() {
    const target = readDatabase().monthly_targets.find((record) => record.event_id === eventId && record.target_month === `${targetMonth}-01`)
    setMonthlyTarget(target || null)
  }
  async function saveMonthlyTarget(values) {
    setSaving(true); setNotice('')
    const cleaned = sanitizeNumeric(values, ['vendor_fee_target', 'volunteer_target', 'task_target'])
    const database = readDatabase()
    const index = database.monthly_targets.findIndex((record) => record.event_id === eventId && record.target_month === `${targetMonth}-01`)
    const target = { id: index >= 0 ? database.monthly_targets[index].id : newId(), event_id: eventId, target_month: `${targetMonth}-01`, ...cleaned }
    if (index >= 0) database.monthly_targets[index] = target; else database.monthly_targets.push(target)
    writeDatabase(database)
    setSaving(false)
    await loadMonthlyTarget()
  }
  async function chooseEvent(event) { setActiveEvent(event); setEventMenuOpen(false); await loadEventData(event.id); setView('overview') }
  function openCreate(type) { setEditing(null); setModal(type) }
  function openEdit(type, record) { setEditing(record); setModal(type) }
  async function saveRecord(table, values) {
    setSaving(true); setNotice('')
    const { receiptFile, ...recordValues } = values
    let cleaned = table === 'vendors' ? sanitizeNumeric(recordValues, ['fee_amount', 'deposit_amount']) : table === 'expenses' ? sanitizeOptionalDates(sanitizeNumeric(recordValues, ['amount']), ['expense_date']) : table === 'tasks' ? sanitizeOptionalDates(sanitizeNumeric(recordValues, ['cost_of_sales', 'sales_revenue']), ['due_date']) : sanitizeOptionalDates(recordValues, table === 'events' ? ['starts_on', 'ends_on'] : [])
    if (table === 'expenses' && receiptFile) {
      try { cleaned = { ...cleaned, receipt_url: await fileToDataUrl(receiptFile), receipt_path: '' } }
      catch { setSaving(false); setNotice('The receipt could not be saved locally.'); return }
    }
    const database = readDatabase()
    if (editing) database[table] = database[table].map((record) => record.id === editing.id ? { ...record, ...cleaned } : record)
    else database[table].push({ id: newId(), ...(table === 'events' ? cleaned : { ...cleaned, event_id: eventId }) })
    writeDatabase(database)
    setSaving(false)
    setModal(null); setEditing(null); await loadWorkspace()
  }
  async function removeRecord(table, record, label) {
    if (!window.confirm(`Remove ${label}? This cannot be undone.`)) return
    setNotice('')
    const database = readDatabase()
    database[table] = database[table].filter((item) => item.id !== record.id)
    if (table === 'events') ['vendors', 'volunteers', 'tasks', 'expenses', 'monthly_targets'].forEach((key) => { database[key] = database[key].filter((item) => item.event_id !== record.id) })
    writeDatabase(database)
    if (table === 'events') setActiveEvent(null)
    await loadWorkspace()
  }
  async function completeTask(task) {
    const database = readDatabase()
    database.tasks = database.tasks.map((item) => item.id === task.id ? { ...item, status: item.status === 'done' ? 'todo' : 'done' } : item)
    writeDatabase(database)
    loadEventData(eventId)
  }
  const metrics = useMemo(() => {
    const collected = workspace.vendors.filter((v) => v.payment_status === 'paid').reduce((sum, v) => sum + Number(v.fee_amount || 0), 0)
    const total = workspace.vendors.reduce((sum, v) => sum + Number(v.fee_amount || 0), 0)
    const expenses = workspace.expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0)
    const committeeRevenue = workspace.tasks.reduce((sum, task) => sum + Number(task.sales_revenue || 0), 0)
    const committeeCosts = workspace.tasks.reduce((sum, task) => sum + Number(task.cost_of_sales || 0), 0)
    const committeeProfit = committeeRevenue - committeeCosts
    return { collected, total, expenses, committeeRevenue, committeeCosts, committeeProfit, netBalance: collected - expenses + committeeProfit, openTasks: workspace.tasks.filter((t) => t.status !== 'done').length }
  }, [workspace])

  if (loading) return <div className="loading"><LoaderCircle className="spin" /> Loading suzexAi…</div>
  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark" />suzexAi</div><div className="event-picker"><div className="picker-label">Your events</div><div className="event-picker-actions"><button className="event-switcher" onClick={() => setEventMenuOpen(!eventMenuOpen)}><span>{activeEvent?.name || 'Choose an event'}</span><ChevronDown size={15} /></button><button className="new-event" onClick={() => openCreate('event')} aria-label="Create a new event"><Plus size={17} /></button></div>{eventMenuOpen && <EventMenu events={workspace.events} activeEvent={activeEvent} onChoose={chooseEvent} onCreate={() => { setEventMenuOpen(false); openCreate('event') }} onEdit={(event) => { setEventMenuOpen(false); openEdit('event', event) }} onDelete={(event) => { setEventMenuOpen(false); removeRecord('events', event, event.name) }} />}</div><p className="event-date">{eventDateLabel(activeEvent)}</p><nav>{[['overview', LayoutDashboard, 'Overview'], ['vendors', CircleDollarSign, 'Vendor fees'], ['volunteers', Users, 'Volunteers'], ['tasks', ClipboardList, 'Committee work'], ['targets', Target, 'Monthly targets'], ['expenses', WalletCards, 'Expenses']].map(([id, Icon, label]) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}><Icon size={17} />{label}</button>)}</nav><div className="sidebar-bottom"><div className="user">L</div><span>Local workspace</span></div></aside>
    <main className="content"><header><div><p className="eyebrow"><Sparkles size={13} /> Event operations</p><h1>{activeEvent ? activeEvent.name : 'Your calm event workspace'}</h1><p className="subhead">{activeEvent?.venue || 'Create an event to begin managing the details.'}</p></div>{activeEvent && <button className="primary" onClick={() => openCreate(view === 'vendors' ? 'vendor' : view === 'volunteers' ? 'volunteer' : view === 'expenses' ? 'expense' : 'task')}><Plus size={16} /> Add {view === 'vendors' ? 'vendor' : view === 'volunteers' ? 'volunteer' : view === 'expenses' ? 'expense' : 'task'}</button>}</header>
      {notice && <div className="notice">{notice}<button onClick={() => setNotice('')}>×</button></div>}
      {!activeEvent ? <EmptyState onCreate={() => openCreate('event')} /> : view === 'targets' ? <TargetPage target={monthlyTarget} month={targetMonth} setMonth={setTargetMonth} onSave={saveMonthlyTarget} saving={saving} /> : <WorkspaceView view={view} workspace={workspace} metrics={metrics} monthlyTarget={monthlyTarget} onComplete={completeTask} onAdd={() => openCreate(view === 'vendors' ? 'vendor' : view === 'volunteers' ? 'volunteer' : view === 'expenses' ? 'expense' : 'task')} onEdit={openEdit} onRemove={removeRecord} />}
    </main>
    {modal && <Modal type={modal} record={editing} volunteers={workspace.volunteers} saving={saving} onClose={() => { setModal(null); setEditing(null) }} onSubmit={(values) => saveRecord(modal === 'event' ? 'events' : `${modal}s`, values)} />}
  </div>
}

function EmptyState({ onCreate }) { return <div className="empty"><CalendarDays size={34} /><h2>Start with your next event.</h2><p>Create a workspace, then keep its fees, people, and work moving from one place.</p><button className="primary" onClick={onCreate}><Plus size={16} /> Create event workspace</button></div> }
function EventMenu({ events, activeEvent, onChoose, onCreate, onEdit, onDelete }) {
  const today = new Date().toISOString().slice(0, 10)
  const upcoming = events.filter((event) => !event.starts_on || (event.ends_on || event.starts_on) >= today)
  const previous = events.filter((event) => event.starts_on && (event.ends_on || event.starts_on) < today).reverse()
  const group = (label, list, empty) => <div className="event-group"><p>{label}</p>{list.length ? list.map((event) => <button className={`event-option ${event.id === activeEvent?.id ? 'selected' : ''}`} key={event.id} onClick={() => onChoose(event)}><span>{event.name}</span><small>{eventDateLabel(event)}</small></button>) : <span className="empty-event-group">{empty}</span>}</div>
  return <div className="event-menu">{group('Upcoming events', upcoming, 'No upcoming events yet.')}{group('Previous events', previous, 'No previous events yet.')}{activeEvent && <div className="event-crud"><button onClick={() => onEdit(activeEvent)}><Pencil size={13} /> Edit selected</button><button className="danger" onClick={() => onDelete(activeEvent)}><Trash2 size={13} /> Delete</button></div>}<button className="create-event-link" onClick={onCreate}><Plus size={14} /> New event workspace</button></div>
}
function WorkspaceView({ view, workspace, metrics, monthlyTarget, onComplete, onAdd, onEdit, onRemove }) {
  if (view === 'vendors') return <section className="data-section"><SectionTitle title="Vendor fee report" count={workspace.vendors.length} action="Add vendor" onAdd={onAdd} /><div className="table"><div className="row row-head vendor-row"><span>Vendor</span><span>Business & tent</span><span>Fee & deposit</span><span>Vendor status</span><span>Manage</span></div>{workspace.vendors.map((v) => <div className="row vendor-row" key={v.id}><div><strong>{v.company_name}</strong><small>{v.contact_name || v.email || '—'}</small></div><div><b>{v.business_type || 'Type not set'}</b><small>Tent: {v.tent_rental ? 'Yes' : 'No'}</small></div><div><b>${Number(v.fee_amount || 0).toLocaleString()}</b><small>Deposit: {v.deposit_status} · Return: {v.deposit_returned ? 'Yes' : 'No'}{Number(v.deposit_amount || 0) ? ` ($${Number(v.deposit_amount).toLocaleString()})` : ''}</small></div><span className={`status ${v.vendor_status || 'active'}`}>{v.vendor_status || 'active'}</span><RowActions onEdit={() => onEdit('vendor', v)} onRemove={() => onRemove('vendors', v, v.company_name)} /></div>)}{!workspace.vendors.length && <Nothing label="No vendors added yet." onAdd={onAdd} />}</div></section>
  if (view === 'volunteers') return <section className="data-section"><SectionTitle title="Volunteer crew" count={workspace.volunteers.length} action="Add volunteer" onAdd={onAdd} /><div className="people-grid">{workspace.volunteers.map((v) => <article className="person" key={v.id}><span className="avatar">{v.full_name.slice(0, 1)}</span><div><strong>{v.full_name}</strong><p>{v.role_name || 'Unassigned role'} · {v.shift_label || 'Shift not set'}</p></div><RowActions onEdit={() => onEdit('volunteer', v)} onRemove={() => onRemove('volunteers', v, v.full_name)} /></article>)}{!workspace.volunteers.length && <Nothing label="No volunteers added yet." onAdd={onAdd} />}</div></section>
  if (view === 'tasks') return <section className="data-section"><div className="committee-summary"><div><span>Total committee profit</span><strong className={metrics.committeeProfit < 0 ? 'loss' : ''}>${metrics.committeeProfit.toLocaleString()}</strong></div><p>${metrics.committeeRevenue.toLocaleString()} revenue − ${metrics.committeeCosts.toLocaleString()} costs</p></div><SectionTitle title="Committee work" count={workspace.tasks.length} action="Add task" onAdd={onAdd} /><div className="tasks">{workspace.tasks.map((t) => <Task task={t} key={t.id} onComplete={onComplete} onEdit={() => onEdit('task', t)} onRemove={() => onRemove('tasks', t, t.title)} />)}{!workspace.tasks.length && <Nothing label="No committee work added yet." onAdd={onAdd} />}</div></section>
  if (view === 'expenses') return <section className="data-section"><SectionTitle title="Expenses" count={workspace.expenses.length} action="Add expense" onAdd={onAdd} /><div className="table expense-table"><div className="row row-head expense-row"><span>Item</span><span>Date</span><span>Category</span><span>Amount</span><span>Status</span><span>Receipt</span><span>Manage</span></div>{workspace.expenses.map((expense) => <ExpenseRow expense={expense} key={expense.id} onEdit={() => onEdit('expense', expense)} onRemove={() => onRemove('expenses', expense, expense.item_name)} />)}{!workspace.expenses.length && <Nothing label="No expenses recorded yet." onAdd={onAdd} />}</div></section>
  return <><section className="metric-grid overview-metrics"><Metric label="Vendor fees collected" value={`$${metrics.collected.toLocaleString()}`} note={`of $${metrics.total.toLocaleString()} expected`} icon={<CircleDollarSign />} /><Metric label="Volunteer crew" value={workspace.volunteers.length} note="people ready to help" icon={<Users />} /><Metric label="Open tasks" value={metrics.openTasks} note={`${workspace.tasks.filter((t) => t.status === 'done').length} completed`} icon={<ClipboardList />} /><Metric label="Total expenses" value={`$${metrics.expenses.toLocaleString()}`} note="recorded liabilities" icon={<ReceiptText />} /><Metric label="Committee profit" value={`$${metrics.committeeProfit.toLocaleString()}`} note={`${metrics.committeeProfit < 0 ? 'loss' : 'profit'} from committee activity`} icon={<CircleDollarSign />} /><MonthlyTargetSummary target={monthlyTarget} /></section><div className={`net-balance ${metrics.netBalance < 0 ? 'negative' : ''}`}><span>Net profit</span><strong>${metrics.netBalance.toLocaleString()}</strong><p>Vendor fees + committee profit − expenses</p></div><section className="overview-grid"><div className="panel"><SectionTitle title="Today’s priorities" action="Add task" onAdd={onAdd} />{workspace.tasks.slice(0, 5).map((t) => <Task task={t} key={t.id} onComplete={onComplete} onEdit={() => onEdit('task', t)} onRemove={() => onRemove('tasks', t, t.title)} />)}{!workspace.tasks.length && <Nothing label="A clear scope starts here." onAdd={onAdd} />}</div><div className="panel fee-summary"><p className="eyebrow">FEE REPORT</p><strong>${metrics.collected.toLocaleString()}</strong><span>collected so far</span><div className="progress"><i style={{ width: `${metrics.total ? Math.round((metrics.collected / metrics.total) * 100) : 0}%` }} /></div><p>{metrics.total ? Math.round((metrics.collected / metrics.total) * 100) : 0}% of expected vendor income is in.</p></div></section></>
}
function Metric({ label, value, note, icon }) { return <article className="metric"><div>{icon}</div><p>{label}</p><strong>{value}</strong><span>{note}</span></article> }
function MonthlyTargetSummary({ target }) { return <article className="metric monthly-summary"><div><Target size={20} /></div><p>Monthly targets</p><strong>{target ? 'On plan' : 'Not set'}</strong><span>{target ? `$${Number(target.vendor_fee_target || 0).toLocaleString()} fees · ${target.volunteer_target || 0} volunteers · ${target.task_target || 0} tasks` : 'Set targets from Monthly targets'}</span></article> }
function ExpenseRow({ expense, onEdit, onRemove }) { const receiptUrl = expense.receipt_url || null; return <div className="row expense-row"><strong>{expense.item_name}</strong><span>{expense.expense_date ? new Date(`${expense.expense_date}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span><span>{expense.category}</span><strong>${Number(expense.amount || 0).toLocaleString()}</strong><span className={`status ${expense.payment_status === 'paid' ? 'active' : 'pending'}`}>{expense.payment_status === 'paid' ? 'Paid' : 'Pending claim'}</span>{receiptUrl ? <a className="receipt-link" href={receiptUrl} target="_blank" rel="noreferrer" aria-label={`View receipt for ${expense.item_name}`}><Eye size={16} /> View</a> : <span className="no-receipt">—</span>}<RowActions onEdit={onEdit} onRemove={onRemove} /></div> }
function SectionTitle({ title, count, action, onAdd }) { return <div className="section-title"><div><h2>{title}</h2>{count !== undefined && <span>{count} total</span>}</div><button className="text-button" onClick={onAdd}>{action} <Plus size={14} /></button></div> }
function RowActions({ onEdit, onRemove }) { return <div className="row-actions"><button className="icon-button" onClick={onEdit} aria-label="Edit"><Pencil size={14} /></button><button className="icon-button remove" onClick={onRemove} aria-label="Remove"><Trash2 size={14} /></button></div> }
function TargetPage({ target, month, setMonth, onSave, saving }) {
  const [values, setValues] = useState({ vendor_fee_target: '', volunteer_target: '', task_target: '' })
  useEffect(() => setValues({ vendor_fee_target: target?.vendor_fee_target ?? '', volunteer_target: target?.volunteer_target ?? '', task_target: target?.task_target ?? '' }), [target?.id, month])
  const targetField = (name, label, hint, prefix = '') => <label className="target-card"><span>{label}</span><small>{hint}</small><div className="target-input"><i>{prefix}</i><input type="number" min="0" step={name === 'vendor_fee_target' ? '0.01' : '1'} value={values[name]} onChange={(e) => setValues({ ...values, [name]: e.target.value })} placeholder="0" /></div></label>
  return <section className="target-page"><div className="target-hero"><div><p className="eyebrow">MONTHLY PLAN</p><h2>Set a clear finish line.</h2><p>Keep fee collection, crew growth, and committee work moving together.</p></div><label className="month-picker">Target month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label></div><form onSubmit={(e) => { e.preventDefault(); onSave(values) }}><div className="target-grid">{targetField('vendor_fee_target', 'Vendor fees', 'Fee collection goal', '$')}{targetField('volunteer_target', 'Volunteer crew', 'People to recruit')}{targetField('task_target', 'Committee work', 'Tasks to complete')}</div><button className="primary target-save" disabled={saving}>{saving ? 'Saving…' : 'Save monthly targets'} <span>→</span></button></form></section>
}
function Task({ task, onComplete, onEdit, onRemove }) { const assignment = task.volunteer_name ? `${task.volunteer_name}${task.volunteer_role ? ` · ${task.volunteer_role}` : ''}` : task.volunteer_role || task.assignee_name || 'Unassigned'; const profit = Number(task.sales_revenue || 0) - Number(task.cost_of_sales || 0); return <div className={`task ${task.status === 'done' ? 'done' : ''}`}><button onClick={() => onComplete(task)} aria-label="Toggle task"><CheckCircle2 size={19} /></button><div><strong>{task.title}</strong><p>{assignment}{task.due_date ? ` · due ${new Date(`${task.due_date}T00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}</p><span className={`profit-badge ${profit < 0 ? 'loss' : profit > 0 ? 'gain' : ''}`}>Profit: {profit < 0 ? '-' : ''}${Math.abs(profit).toLocaleString()}</span></div><span className="task-status">{task.status === 'done' ? 'Done' : 'Open'}</span><RowActions onEdit={onEdit} onRemove={onRemove} /></div> }
function Nothing({ label, onAdd }) { return <div className="nothing"><p>{label}</p><button className="text-button" onClick={onAdd}>Add your first one <Plus size={14} /></button></div> }
function Modal({ type, record, volunteers = [], onClose, onSubmit, saving }) {
  const defaults = type === 'event' ? emptyEvent : type === 'vendor' ? emptyVendor : type === 'volunteer' ? emptyVolunteer : type === 'expense' ? emptyExpense : emptyTask
  const [values, setValues] = useState({ ...defaults, ...(record || {}) })
  const title = record ? `Edit ${type}` : type === 'event' ? 'Create event workspace' : `Add ${type}`
  const field = (name, label, input = 'text', extra = {}) => <label>{label}<input type={input} value={values[name] ?? ''} onChange={(e) => setValues({ ...values, [name]: e.target.value })} {...extra} /></label>
  const select = (name, label, options, onChange) => <label>{label}<select value={values[name] ?? ''} onChange={(e) => onChange ? onChange(e.target.value) : setValues({ ...values, [name]: e.target.value })}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
  const roles = [...new Set(volunteers.map((volunteer) => volunteer.role_name).filter(Boolean))]
  const roleVolunteers = values.volunteer_role ? volunteers.filter((volunteer) => volunteer.role_name === values.volunteer_role) : volunteers
  const taskProfit = Number(values.sales_revenue || 0) - Number(values.cost_of_sales || 0)
  return <div className="modal-backdrop" role="dialog" aria-modal="true"><form className="modal" onSubmit={(e) => { e.preventDefault(); onSubmit(values) }}><button type="button" className="close" onClick={onClose}><X size={18} /></button><h2>{title}</h2>{type === 'event' && <>{field('name', 'Event name', 'text', { required: true })}{field('venue', 'Venue')}{field('starts_on', 'Start date', 'date')}{field('ends_on', 'End date', 'date', { min: values.starts_on || undefined })}</>}{type === 'vendor' && <>{field('company_name', 'Business name', 'text', { required: true })}{field('contact_name', 'Contact name')}{field('email', 'Email', 'email')}{field('business_type', 'Type of sale / business')}{select('tent_rental', 'Rent a tent?', [['false', 'No'], ['true', 'Yes']], (value) => setValues({ ...values, tent_rental: value === 'true' }))}{field('fee_amount', 'Vendor fee amount', 'number', { min: '0', step: '0.01' })}{select('payment_status', 'Vendor fee payment status', [['pending', 'Pending'], ['paid', 'Paid'], ['overdue', 'Overdue']])}{field('deposit_amount', 'Deposit amount', 'number', { min: '0', step: '0.01' })}{select('deposit_status', 'Deposit payment status', [['not_required', 'Not required'], ['pending', 'Pending'], ['paid', 'Paid']])}{select('deposit_returned', 'Deposit return', [['false', 'No'], ['true', 'Yes']], (value) => setValues({ ...values, deposit_returned: value === 'true' }))}{select('vendor_status', 'Vendor status', [['active', 'Active'], ['pending', 'Pending'], ['cancelled', 'Cancelled']])}</>}{type === 'expense' && <>{field('item_name', 'Item name', 'text', { required: true })}{field('expense_date', 'Date', 'date')}{select('category', 'Category', [['Logistics', 'Logistics'], ['F&B', 'F&B'], ['Equipment', 'Equipment'], ['Marketing', 'Marketing'], ['Others', 'Others']])}{field('amount', 'Amount', 'number', { min: '0', step: '0.01' })}{select('payment_status', 'Payment status', [['paid', 'Paid'], ['pending_claim', 'Pending claim']])}<label>Receipt upload<input type="file" accept="image/*,application/pdf" onChange={(e) => setValues({ ...values, receiptFile: e.target.files?.[0] || null })} /></label>{record?.receipt_path && <p className="receipt-note">Leave the upload empty to keep the current receipt.</p>}</>}{type === 'volunteer' && <>{field('full_name', 'Full name', 'text', { required: true })}{field('email', 'Email', 'email')}{field('role_name', 'Role')}{field('shift_label', 'Shift')}</>}{type === 'task' && <>{field('title', 'Task title', 'text', { required: true })}{field('scope', 'Job scope')}{select('volunteer_role', 'Volunteer role responsible', [['', 'Choose a role'], ...roles.map((role) => [role, role])], (role) => setValues({ ...values, volunteer_role: role, volunteer_name: '', assignee_name: '' }))}{select('volunteer_name', 'Volunteer assigned', [['', roleVolunteers.length ? 'Choose a volunteer' : 'No volunteer in this role'], ...roleVolunteers.map((volunteer) => [volunteer.full_name, volunteer.full_name])], (name) => setValues({ ...values, volunteer_name: name, assignee_name: name }))}<fieldset className="financials"><legend>Financials</legend>{field('cost_of_sales', 'Cost of Sales (Kos Jualan)', 'number', { min: '0', step: '0.01' })}{field('sales_revenue', 'Sales Revenue (Hasil Jualan)', 'number', { min: '0', step: '0.01' })}<label>Profit (Keuntungan)<input value={`$${taskProfit.toLocaleString()}`} disabled readOnly /></label></fieldset>{field('due_date', 'Due date', 'date')}</>}<button className="primary full" disabled={saving}>{saving ? 'Saving…' : record ? 'Save changes' : 'Save'} <span>→</span></button></form></div>
}

createRoot(document.getElementById('root')).render(<App />)

