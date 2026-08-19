import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Job = { id: string; name: string; wage: number; tierOne: number; tierTwo: number; color: string };
type Shift = { id: string; date: string; jobId: string; start: string; end: string; breakMinutes: number; fatigue: number; note: string; isOvertime?: boolean };
type SavedData = { version: 1; jobs: Job[]; shifts: Shift[] };
type Page = "home" | "calendar" | "jobs";

const STORAGE_KEY = "shift-ledger-data-v1";
const COLORS = ["#ff7048", "#7a6cf6", "#20a38a", "#f2a93b", "#3d8fd1", "#d95f9f"];
const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const currentMonth = () => dateKey().slice(0, 7);
const makeId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const money = (value: number) => new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(Math.round(value));
const monthLabel = (value: string) => { const [y, m] = value.split("-"); return `${y} 年 ${Number(m)} 月`; };
const dateLabel = (value: string) => new Intl.DateTimeFormat("zh-TW", { month: "long", day: "numeric", weekday: "short" }).format(new Date(`${value}T12:00:00`));
const moveMonth = (value: string, amount: number) => { const [y, m] = value.split("-").map(Number); const d = new Date(y, m - 1 + amount, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const hoursBetween = (start: string, end: string, breakMinutes: number) => {
  const [sh, sm] = start.split(":").map(Number); const [eh, em] = end.split(":").map(Number);
  let minutes = eh * 60 + em - sh * 60 - sm; if (minutes < 0) minutes += 1440;
  return Math.max(0, minutes - breakMinutes) / 60;
};
const shiftInterval = ({ date, start, end }: Pick<Shift, "date" | "start" | "end">) => {
  const startsAt = new Date(`${date}T${start}:00`).getTime();
  let endsAt = new Date(`${date}T${end}:00`).getTime();
  if (endsAt < startsAt) endsAt += 24 * 60 * 60 * 1000;
  return { startsAt, endsAt };
};
const shiftsOverlap = (left: Pick<Shift, "date" | "start" | "end">, right: Pick<Shift, "date" | "start" | "end">) => {
  const leftInterval = shiftInterval(left);
  const rightInterval = shiftInterval(right);
  return leftInterval.startsAt < rightInterval.endsAt && rightInterval.startsAt < leftInterval.endsAt;
};
const loadData = (): SavedData => {
  try { const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<SavedData> | null; if (value?.version === 1 && Array.isArray(value.jobs) && Array.isArray(value.shifts)) return value as SavedData; } catch { /* start empty */ }
  return { version: 1, jobs: [], shifts: [] };
};

function MonthPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="month-picker"><button aria-label="上一個月" onClick={() => onChange(moveMonth(value, -1))}>‹</button><button onClick={() => onChange(currentMonth())}>{monthLabel(value)}</button><button aria-label="下一個月" onClick={() => onChange(moveMonth(value, 1))}>›</button></div>;
}

export default function App() {
  const initial = useMemo(loadData, []);
  const [jobs, setJobs] = useState(initial.jobs);
  const [shifts, setShifts] = useState(initial.shifts);
  const [page, setPage] = useState<Page>("home");
  const [month, setMonth] = useState(currentMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [jobModal, setJobModal] = useState(false);
  const [shiftModal, setShiftModal] = useState(false);
  const [editingJob, setEditingJob] = useState<string | null>(null);
  const [editingShift, setEditingShift] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [jobForm, setJobForm] = useState({ name: "", wage: 0, tierOne: 1.34, tierTwo: 1.67, color: COLORS[0] });
  const [shiftForm, setShiftForm] = useState({ date: dateKey(), jobId: "", start: "09:00", end: "17:00", breakMinutes: 0, fatigue: 3, note: "", isOvertime: false });

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, jobs, shifts } satisfies SavedData)), [jobs, shifts]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(timer); }, [notice]);

  const calculated = useMemo(() => shifts.flatMap((shift) => {
    const job = jobs.find((item) => item.id === shift.jobId); if (!job) return [];
    const hours = hoursBetween(shift.start, shift.end, shift.breakMinutes);
    const legacyCalculation = shift.isOvertime === undefined;
    const regular = legacyCalculation ? Math.min(hours, 8) : shift.isOvertime ? 0 : hours;
    const overtimeOne = legacyCalculation ? Math.min(Math.max(hours - 8, 0), 2) : shift.isOvertime ? Math.min(hours, 2) : 0;
    const overtimeTwo = legacyCalculation ? Math.max(hours - 10, 0) : shift.isOvertime ? Math.max(hours - 2, 0) : 0;
    const income = regular * job.wage + overtimeOne * job.wage * job.tierOne + overtimeTwo * job.wage * job.tierTwo;
    return [{ ...shift, job, hours, regular, overtimeOne, overtimeTwo, income }];
  }), [jobs, shifts]);
  const monthly = useMemo(() => calculated.filter((shift) => shift.date.startsWith(month)), [calculated, month]);
  const totals = useMemo(() => monthly.reduce((sum, shift) => ({
    income: sum.income + shift.income, hours: sum.hours + shift.hours,
    regular: sum.regular + shift.regular, regularPay: sum.regularPay + shift.regular * shift.job.wage,
    overtimeOne: sum.overtimeOne + shift.overtimeOne, overtimeOnePay: sum.overtimeOnePay + shift.overtimeOne * shift.job.wage * shift.job.tierOne,
    overtimeTwo: sum.overtimeTwo + shift.overtimeTwo, overtimeTwoPay: sum.overtimeTwoPay + shift.overtimeTwo * shift.job.wage * shift.job.tierTwo,
  }), { income: 0, hours: 0, regular: 0, regularPay: 0, overtimeOne: 0, overtimeOnePay: 0, overtimeTwo: 0, overtimeTwoPay: 0 }), [monthly]);
  const jobTotals = jobs.map((job) => ({ ...job, value: monthly.filter((s) => s.jobId === job.id).reduce((sum, s) => sum + s.income, 0) })).filter((job) => job.value > 0);
  const selectedDayShifts = selectedDate
    ? calculated.filter((shift) => shift.date === selectedDate).sort((a, b) => a.start.localeCompare(b.start))
    : [];
  const shiftJobName = jobs.find((job) => job.id === shiftForm.jobId)?.name ?? "班次";
  let cursor = 0;
  const donut = totals.income ? jobTotals.map((job) => { const start = cursor; cursor += job.value / totals.income * 100; return `${job.color} ${start}% ${cursor}%`; }).join(",") : "#e8e0d3 0 100%";
  const [year, monthNumber] = month.split("-").map(Number);
  const dayCount = new Date(year, monthNumber, 0).getDate();
  const offset = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;

  const openJob = (job?: Job) => {
    setEditingJob(job?.id ?? null);
    setJobForm(job ? { name: job.name, wage: job.wage, tierOne: job.tierOne, tierTwo: job.tierTwo, color: job.color } : { name: "", wage: 0, tierOne: 1.34, tierTwo: 1.67, color: COLORS[jobs.length % COLORS.length] });
    setJobModal(true);
  };
  const openShift = (date = dateKey(), shift?: Shift) => {
    if (!jobs.length) { setPage("jobs"); setNotice("請先新增一份工作，再記錄班次。"); openJob(); return; }
    setEditingShift(shift?.id ?? null);
    setShiftForm(shift ? { date: shift.date, jobId: shift.jobId, start: shift.start, end: shift.end, breakMinutes: shift.breakMinutes, fatigue: shift.fatigue, note: shift.note, isOvertime: shift.isOvertime ?? false } : { date, jobId: jobs[0].id, start: "09:00", end: "17:00", breakMinutes: 0, fatigue: 3, note: "", isOvertime: false });
    setShiftModal(true);
  };
  const saveJob = (event: FormEvent) => {
    event.preventDefault(); const name = jobForm.name.trim();
    if (!name || jobForm.wage <= 0) { setNotice("請填寫工作名稱與正確時薪。"); return; }
    setJobs((list) => editingJob ? list.map((job) => job.id === editingJob ? { ...job, ...jobForm, name } : job) : [...list, { id: makeId(), ...jobForm, name }]);
    setJobModal(false); setNotice(editingJob ? "工作設定已更新。" : "工作已新增。");
  };
  const saveShift = (event: FormEvent) => {
    event.preventDefault(); if (!shiftForm.date || !shiftForm.jobId) return;
    const next = { id: editingShift ?? makeId(), ...shiftForm };
    const conflict = shifts.find((shift) => shift.id !== editingShift && shiftsOverlap(next, shift));
    if (conflict) {
      const jobName = jobs.find((job) => job.id === conflict.jobId)?.name ?? "既有工作";
      setNotice(`時間與「${jobName}」${dateLabel(conflict.date)} ${conflict.start}–${conflict.end} 的班次重疊，請先調整。`);
      return;
    }
    setShifts((list) => editingShift ? list.map((shift) => shift.id === editingShift ? next : shift) : [...list, next]);
    setMonth(next.date.slice(0, 7)); setSelectedDate(next.date); setShiftModal(false); setPage("calendar"); setNotice(editingShift ? "班次已更新。" : "班次已儲存。");
  };
  const removeJob = (job: Job) => {
    if (shifts.some((shift) => shift.jobId === job.id)) { setNotice("這份工作仍有班次，請先刪除相關班次。"); return; }
    if (confirm(`確定刪除「${job.name}」？`)) setJobs((list) => list.filter((item) => item.id !== job.id));
  };
  const removeShift = (shift: Shift) => { if (confirm(`確定刪除 ${dateLabel(shift.date)} 的班次？`)) { setShifts((list) => list.filter((item) => item.id !== shift.id)); setNotice("班次已刪除。"); } };
  const exportData = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), jobs, shifts }, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `班次帳備份-${dateKey()}.json`; link.click(); URL.revokeObjectURL(url);
  };
  const importData = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Partial<SavedData>;
      if (data.version !== 1 || !Array.isArray(data.jobs) || !Array.isArray(data.shifts)) throw new Error();
      if (confirm(`匯入 ${data.jobs.length} 份工作與 ${data.shifts.length} 筆班次，並取代目前資料？`)) { setJobs(data.jobs); setShifts(data.shifts); setNotice("備份匯入完成。"); }
    } catch { setNotice("無法讀取備份，請確認檔案格式。"); }
    if (importRef.current) importRef.current.value = "";
  };

  return <main className="min-h-screen bg-[#fcf7ed] text-[#171615]">
    <div className="mx-auto min-h-screen max-w-[1440px] px-4 py-4 sm:px-7 lg:px-10 lg:py-8">
      <header className="flex items-center justify-between border-b-2 border-[#171615] pb-4 lg:pb-6">
        <button onClick={() => setPage("home")} className="flex items-center gap-3 text-left"><span className="logo">✦</span><span><small className="eyebrow text-[#716c62]">你的工作帳本</small><strong className="font-display block text-xl">班次帳</strong></span></button>
        <button onClick={() => openShift()} className="primary-pill">+ 新增班次</button>
      </header>
      <div className="grid lg:grid-cols-[190px_1fr] lg:gap-10">
        <nav className="flex gap-2 overflow-x-auto py-5 lg:flex-col lg:pt-10" aria-label="主要功能">
          {[["home", "▣", "總覽"], ["calendar", "□", "月曆"], ["jobs", "♢", "我的工作"]].map(([id, icon, label]) => <button key={id} onClick={() => setPage(id as Page)} className={`nav-button ${page === id ? "active" : ""}`}><span>{icon}</span>{label}</button>)}
          <div className="hidden border-t border-[#d8d0c2] pt-6 lg:block"><small className="eyebrow text-[#8b8479]">{monthLabel(month)}</small><p className="mt-2 font-display text-2xl font-bold">{monthly.length} 個班次</p><p className="font-mono text-xs text-[#716c62]">{totals.hours.toFixed(1)} 小時</p></div>
        </nav>

        {page === "home" && <section className="page-section">
          <div className="section-heading"><div><small className="eyebrow text-[#ff7048]">收入總覽 / {monthLabel(month)}</small><h2>每一分鐘，都值得計算。</h2></div><MonthPicker value={month} onChange={setMonth} /></div>
          {!jobs.length ? <Empty title="先建立你的第一份工作" text="填入工作名稱、時薪與加班倍率，接著就能記錄真實班次。這裡不會放入任何示範資料。" action="+ 新增工作" onClick={() => openJob()} /> : <>
            <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
              <article className="income-card"><small className="eyebrow text-[#ffec6a]">本月總收入</small><p className="mt-5 font-display text-5xl font-bold tracking-[-.06em] sm:text-6xl">{money(totals.income)}</p><div className="income-stats"><span><b>{totals.hours.toFixed(1)}</b>小時</span><span><b>{monthly.length}</b>班次</span><span><b>{money(monthly.length ? totals.income / monthly.length : 0)}</b>平均每班</span></div></article>
              <article className="paper-card"><small className="eyebrow text-[#716c62]">工作收入占比</small><p className="mt-1 text-sm text-[#716c62]">依這個月的實際班次計算。</p><div className="mt-7 flex items-center gap-6"><div className="donut" style={{ background: `conic-gradient(${donut})` }}><span>{jobTotals.length}<br />工作</span></div><div className="min-w-0 flex-1 space-y-3">{!jobTotals.length && <p className="text-sm text-[#716c62]">本月還沒有班次。</p>}{jobTotals.map((job) => <div key={job.id} className="flex gap-2 font-mono text-[11px]"><i style={{ background: job.color }} /><span className="flex-1 truncate">{job.name}</span><b>{Math.round(job.value / totals.income * 100)}%</b></div>)}</div></div></article>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["全部工時", totals.hours, totals.income, "#171615", "#fffaf0"], ["一般工時", totals.regular, totals.regularPay, "#ffec6a", "#171615"], ["加班前 2 小時", totals.overtimeOne, totals.overtimeOnePay, "#d9d4ff", "#171615"], ["加班第 3 小時起", totals.overtimeTwo, totals.overtimeTwoPay, "#bceee1", "#171615"]].map(([label, hours, pay, bg, color]) => <article key={String(label)} className="summary-card" style={{ background: String(bg), color: String(color) }}><small className="eyebrow">{label}</small><p className="mt-5 font-display text-3xl font-bold">{Number(hours).toFixed(1)} h</p><p className="font-mono text-xs">{money(Number(pay))}</p></article>)}</div>
          </>}
        </section>}

        {page === "calendar" && <section className="page-section">
          <div className="section-heading"><div><small className="eyebrow text-[#ff7048]">每個班次，一眼掌握</small><h2>{monthLabel(month)}</h2></div><MonthPicker value={month} onChange={(value) => { setMonth(value); setSelectedDate(null); }} /></div>
          <div className="calendar"><div className="calendar-head">{"一 二 三 四 五 六 日".split(" ").map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{Array.from({ length: offset }).map((_, index) => <i key={`e${index}`} />)}{Array.from({ length: dayCount }, (_, index) => index + 1).map((day) => { const date = `${month}-${String(day).padStart(2, "0")}`; const records = monthly.filter((s) => s.date === date); return <button key={day} className={date === selectedDate ? "selected" : ""} aria-pressed={date === selectedDate} onClick={() => setSelectedDate(date)}><b className={date === dateKey() ? "today" : ""}>{day}</b>{records.length > 0 && <><span className="dots">{records.slice(0, 3).map((s) => <i key={s.id} style={{ background: s.job.color }} />)}</span><small>{money(records.reduce((sum, s) => sum + s.income, 0))}</small></>}</button>; })}</div></div>
          {selectedDate && <div className="mt-7">
            <div className="flex items-center justify-between"><div><small className="eyebrow text-[#ff7048]">當日工作</small><h3 className="font-display text-2xl font-bold">{dateLabel(selectedDate)}</h3></div><button onClick={() => openShift(selectedDate)} className="secondary-pill">+ 新增班次</button></div>
            <div className="mt-3 space-y-3">{!selectedDayShifts.length && <Empty compact title="當天尚無班次" text="可新增一筆班次，開始記錄當天工作。" action="+ 新增班次" onClick={() => openShift(selectedDate)} />}{selectedDayShifts.map((shift) => <article key={shift.id} className="shift-row selectable" role="button" tabIndex={0} onClick={() => openShift(shift.date, shift)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openShift(shift.date, shift); }}><i style={{ background: shift.job.color }} /><div><h4>{shift.job.name}</h4><p>{shift.start}–{shift.end} · 休息 {shift.breakMinutes} 分鐘 · {shift.isOvertime ? "加班班次" : "一般班次"}</p>{shift.note && <p>{shift.note}</p>}</div><span><b>{money(shift.income)}</b>{shift.hours.toFixed(1)} 小時</span><div><button onClick={(event) => { event.stopPropagation(); openShift(shift.date, shift); }}>編輯</button><button className="danger" onClick={(event) => { event.stopPropagation(); removeShift(shift); }}>刪除</button></div></article>)}</div>
          </div>}
        </section>}

        {page === "jobs" && <section className="page-section">
          <div className="section-heading"><div><small className="eyebrow text-[#ff7048]">設定你的實際費率</small><h2>我的工作</h2></div><button onClick={() => openJob()} className="dark-pill">+ 新增工作</button></div>
          <div className="space-y-3">{!jobs.length && <Empty compact title="尚未建立工作" text="新增後即可開始記錄班次。" />}{jobs.map((job) => <article key={job.id} className="job-row"><i style={{ background: job.color }} /><div><h3>{job.name}</h3><p>{shifts.filter((shift) => shift.jobId === job.id).length} 筆班次紀錄</p></div><span><small>基本時薪</small><b>{money(job.wage)}</b></span><span><small>加班倍率</small><b>×{job.tierOne} / ×{job.tierTwo}</b></span><div><button onClick={() => openJob(job)}>編輯</button><button className="danger" onClick={() => removeJob(job)}>刪除</button></div></article>)}</div>
          <div className="backup-card"><div><h3>備份此裝置的資料</h3><p>匯出 JSON 後可在其他瀏覽器或裝置重新匯入。</p></div><div><input ref={importRef} type="file" accept=".json,application/json" hidden onChange={(event) => event.target.files?.[0] && importData(event.target.files[0])} /><button onClick={() => importRef.current?.click()} className="secondary-pill">↑ 匯入</button><button onClick={exportData} className="yellow-pill">↓ 匯出</button></div></div>
        </section>}
      </div>
    </div>

    {notice && <div role="status" className="toast">{notice}</div>}
    {jobModal && <Modal title={editingJob ? "編輯工作" : "新增工作"} onClose={() => setJobModal(false)}><form onSubmit={saveJob} className="form-grid"><Field label="工作名稱"><input autoFocus value={jobForm.name} onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })} placeholder="例如：咖啡店晚班" /></Field><Field label="基本時薪（新台幣）"><input type="number" min="1" value={jobForm.wage || ""} onChange={(e) => setJobForm({ ...jobForm, wage: Number(e.target.value) })} /></Field><div className="grid grid-cols-2 gap-3"><Field label="加班前 2 小時"><input type="number" min="1" step="0.01" value={jobForm.tierOne} onChange={(e) => setJobForm({ ...jobForm, tierOne: Number(e.target.value) })} /></Field><Field label="第 3 小時起"><input type="number" min="1" step="0.01" value={jobForm.tierTwo} onChange={(e) => setJobForm({ ...jobForm, tierTwo: Number(e.target.value) })} /></Field></div><Field label="識別顏色"><input type="color" value={jobForm.color} onChange={(e) => setJobForm({ ...jobForm, color: e.target.value })} /></Field><button className="form-submit">儲存工作 →</button></form></Modal>}
    {shiftModal && <Modal eyebrow={editingShift ? "編輯班次" : "新增班次"} title={shiftJobName} onClose={() => setShiftModal(false)}><form onSubmit={saveShift} className="form-grid"><Field label="日期"><input type="date" value={shiftForm.date} onChange={(e) => setShiftForm({ ...shiftForm, date: e.target.value })} /></Field><Field label="工作"><select value={shiftForm.jobId} onChange={(e) => setShiftForm({ ...shiftForm, jobId: e.target.value })}>{jobs.map((job) => <option key={job.id} value={job.id}>{job.name}</option>)}</select></Field><Field label="班次類型"><div className="shift-type" role="group" aria-label="班次類型"><button type="button" aria-label="一般班次" className={!shiftForm.isOvertime ? "active" : ""} aria-pressed={!shiftForm.isOvertime} onClick={() => setShiftForm({ ...shiftForm, isOvertime: false })}>一般班次</button><button type="button" aria-label="加班班次" className={shiftForm.isOvertime ? "active" : ""} aria-pressed={shiftForm.isOvertime} onClick={() => setShiftForm({ ...shiftForm, isOvertime: true })}>加班班次</button></div></Field><div className="grid grid-cols-2 gap-3"><Field label="開始時間"><input type="time" value={shiftForm.start} onChange={(e) => setShiftForm({ ...shiftForm, start: e.target.value })} /></Field><Field label="結束時間"><input type="time" value={shiftForm.end} onChange={(e) => setShiftForm({ ...shiftForm, end: e.target.value })} /></Field></div><Field label="休息分鐘數"><input type="number" min="0" step="5" value={shiftForm.breakMinutes} onChange={(e) => setShiftForm({ ...shiftForm, breakMinutes: Number(e.target.value) })} /></Field><Field label="疲勞程度"><div className="fatigue">{[1, 2, 3, 4, 5].map((level) => <button type="button" key={level} onClick={() => setShiftForm({ ...shiftForm, fatigue: level })} className={shiftForm.fatigue >= level ? "active" : ""} aria-label={`疲勞程度 ${level}`}>✦</button>)}</div></Field><Field label="備註（選填）"><textarea rows={3} value={shiftForm.note} onChange={(e) => setShiftForm({ ...shiftForm, note: e.target.value })} placeholder="例如：代班" /></Field><button className="form-submit">儲存班次 →</button></form></Modal>}
  </main>;
}

function Empty({ title, text, action, onClick, compact = false }: { title: string; text: string; action?: string; onClick?: () => void; compact?: boolean }) {
  return <div className={`empty ${compact ? "compact" : ""}`}><div><span>✦</span><h3>{title}</h3><p>{text}</p>{action && <button onClick={onClick}>{action}</button>}</div></div>;
}
function Modal({ eyebrow = "資料設定", title, onClose, children }: { eyebrow?: string; title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal-card"><header><div><small className="eyebrow text-[#ff7048]">{eyebrow}</small><h2>{title}</h2></div><button onClick={onClose} aria-label="關閉">×</button></header>{children}</div></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
