import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type Job = { id: string; name: string; wage: number; regularHours?: number; tierOneHours?: number; tierOne: number; tierTwo: number; color: string; defaultStart?: string; defaultEnd?: string; defaultBreakMinutes?: number; payDay?: number; regularCutoffDay?: number; overtimeCutoffDay?: number };
type Shift = { id: string; date: string; jobId: string; start: string; end: string; breakMinutes: number; fatigue: number; note: string; regularHours?: number; overtimeHours?: number; types?: string[]; isOvertime?: boolean };
type RepeatMode = "none" | "weekly" | "interval";
type SavedData = { version: 1; jobs: Job[]; shifts: Shift[] };
type Page = "home" | "calendar" | "jobs";

const STORAGE_KEY = "shift-ledger-data-v1";
const COLORS = ["#B4C1D0", "#BDCDBA", "#DDCED5", "#E9DDD7", "#DFC1C6"];
const CHART_COLORS = ["#B4C1D0", "#BDCDBA", "#DDCED5", "#E9DDD7", "#DFC1C6"];
const dateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const currentMonth = () => dateKey().slice(0, 7);
const makeId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const money = (value: number) => new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(Math.round(value));
const monthLabel = (value: string) => { const [y, m] = value.split("-"); return `${y} 年 ${Number(m)} 月`; };
const dateLabel = (value: string) => new Intl.DateTimeFormat("zh-TW", { month: "long", day: "numeric", weekday: "short" }).format(new Date(`${value}T12:00:00`));
const moveMonth = (value: string, amount: number) => { const [y, m] = value.split("-").map(Number); const d = new Date(y, m - 1 + amount, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
const addDays = (value: string, amount: number) => { const date = new Date(`${value}T12:00:00`); date.setDate(date.getDate() + amount); return dateKey(date); };
const monthEnd = (value: string) => { const [y, m] = value.split("-").map(Number); return dateKey(new Date(y, m, 0)); };
const dateAtDay = (month: string, day: number) => { const [y, m] = month.split("-").map(Number); return dateKey(new Date(y, m - 1, Math.min(Math.max(1, day), new Date(y, m, 0).getDate()))); };
const payPeriod = (month: string, cutoffDay: number) => ({ start: addDays(dateAtDay(moveMonth(month, -1), cutoffDay), 1), end: dateAtDay(month, cutoffDay) });
const inPeriod = (date: string, period: { start: string; end: string }) => date >= period.start && date <= period.end;
const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];
const hoursBetween = (start: string, end: string, breakMinutes: number) => {
  const [sh, sm] = start.split(":").map(Number); const [eh, em] = end.split(":").map(Number);
  let minutes = eh * 60 + em - sh * 60 - sm; if (minutes < 0) minutes += 1440;
  return Math.max(0, minutes - breakMinutes) / 60;
};
const normalizeTime = (value: string) => {
  const input = value.trim().replace("：", ":");
  let hours: number;
  let minutes: number;
  if (/^\d{1,2}$/.test(input)) {
    hours = Number(input);
    minutes = 0;
  } else if (/^\d{3,4}$/.test(input)) {
    const digits = input.padStart(4, "0");
    hours = Number(digits.slice(0, 2));
    minutes = Number(digits.slice(2));
  } else {
    const match = input.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!match) return null;
    hours = Number(match[1]);
    minutes = Number(match[2]);
  }
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
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
const regularHoursFor = (job: Job) => Math.max(0, job.regularHours ?? 8);
const tierOneHoursFor = (job: Job) => Math.max(0, job.tierOneHours ?? 2);
const payDayFor = (job: Job) => Math.min(31, Math.max(1, job.payDay ?? 5));
const regularCutoffFor = (job: Job) => Math.min(31, Math.max(1, job.regularCutoffDay ?? 31));
const overtimeCutoffFor = (job: Job) => Math.min(31, Math.max(1, job.overtimeCutoffDay ?? 25));
const jobScheduleLabel = (job: Job) => {
  const start = job.defaultStart ?? "09:00";
  const end = job.defaultEnd ?? "17:00";
  const breakMinutes = job.defaultBreakMinutes ?? 0;
  return `${start}–${end} · ${hoursBetween(start, end, breakMinutes).toFixed(1)} 小時`;
};
const defaultHourSplit = (job: Job, start: string, end: string, breakMinutes: number) => {
  const hours = hoursBetween(start, end, breakMinutes);
  const regularHours = Math.min(hours, regularHoursFor(job));
  return { regularHours, overtimeHours: Math.max(0, hours - regularHours) };
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
  const [resumeShiftAfterJob, setResumeShiftAfterJob] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [jobForm, setJobForm] = useState({ name: "", wage: 0, regularHours: 8, tierOneHours: 2, tierOne: 1.34, tierTwo: 1.67, color: COLORS[0], defaultStart: "09:00", defaultEnd: "17:00", defaultBreakMinutes: 0, payDay: 5, regularCutoffDay: 31, overtimeCutoffDay: 25 });
  const [shiftForm, setShiftForm] = useState({ date: dateKey(), jobId: "", start: "09:00", end: "17:00", breakMinutes: 0, regularHours: 8, overtimeHours: 0, fatigue: 3, note: "", repeatMode: "none" as RepeatMode, repeatUntil: monthEnd(dateKey()), repeatWeekdays: [new Date().getDay()], repeatEveryDays: 7 });

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, jobs, shifts } satisfies SavedData)), [jobs, shifts]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 3500); return () => clearTimeout(timer); }, [notice]);

  const calculated = useMemo(() => shifts.flatMap((shift) => {
    const job = jobs.find((item) => item.id === shift.jobId); if (!job) return [];
    const hours = hoursBetween(shift.start, shift.end, shift.breakMinutes);
    const regularLimit = regularHoursFor(job);
    const tierOneLimit = tierOneHoursFor(job);
    const regular = shift.regularHours ?? Math.min(hours, regularLimit);
    const overtime = shift.overtimeHours ?? Math.max(hours - regularLimit, 0);
    const overtimeOne = Math.min(overtime, tierOneLimit);
    const overtimeTwo = Math.max(overtime - tierOneLimit, 0);
    const income = regular * job.wage + overtimeOne * job.wage * job.tierOne + overtimeTwo * job.wage * job.tierTwo;
    return [{ ...shift, job, hours, regular, overtimeOne, overtimeTwo, income }];
  }), [jobs, shifts]);
  const calendarMonthly = useMemo(() => calculated.filter((shift) => shift.date.startsWith(month)), [calculated, month]);
  const payroll = useMemo(() => calculated.flatMap((shift) => {
    const regularPeriod = payPeriod(month, regularCutoffFor(shift.job));
    const overtimePeriod = payPeriod(month, overtimeCutoffFor(shift.job));
    const regular = inPeriod(shift.date, regularPeriod) ? shift.regular : 0;
    const overtimeOne = inPeriod(shift.date, overtimePeriod) ? shift.overtimeOne : 0;
    const overtimeTwo = inPeriod(shift.date, overtimePeriod) ? shift.overtimeTwo : 0;
    if (!regular && !overtimeOne && !overtimeTwo) return [];
    const regularPay = regular * shift.job.wage;
    const overtimeOnePay = overtimeOne * shift.job.wage * shift.job.tierOne;
    const overtimeTwoPay = overtimeTwo * shift.job.wage * shift.job.tierTwo;
    return [{ ...shift, regular, overtimeOne, overtimeTwo, hours: regular + overtimeOne + overtimeTwo, income: regularPay + overtimeOnePay + overtimeTwoPay }];
  }), [calculated, month]);
  const totals = useMemo(() => payroll.reduce((sum, shift) => ({
    income: sum.income + shift.income, hours: sum.hours + shift.hours,
    regular: sum.regular + shift.regular, regularPay: sum.regularPay + shift.regular * shift.job.wage,
    overtimeOne: sum.overtimeOne + shift.overtimeOne, overtimeOnePay: sum.overtimeOnePay + shift.overtimeOne * shift.job.wage * shift.job.tierOne,
    overtimeTwo: sum.overtimeTwo + shift.overtimeTwo, overtimeTwoPay: sum.overtimeTwoPay + shift.overtimeTwo * shift.job.wage * shift.job.tierTwo,
  }), { income: 0, hours: 0, regular: 0, regularPay: 0, overtimeOne: 0, overtimeOnePay: 0, overtimeTwo: 0, overtimeTwoPay: 0 }), [payroll]);
  const jobTotals = jobs.map((job) => ({ ...job, value: payroll.filter((s) => s.jobId === job.id).reduce((sum, s) => sum + s.income, 0) })).filter((job) => job.value > 0);
  const payrollShiftCount = new Set(payroll.map((shift) => shift.id)).size;
  const selectedDayShifts = selectedDate
    ? calculated.filter((shift) => shift.date === selectedDate).sort((a, b) => a.start.localeCompare(b.start))
    : [];
  const shiftJobName = jobs.find((job) => job.id === shiftForm.jobId)?.name ?? "班次";
  let cursor = 0;
  const donut = totals.income ? jobTotals.map((job, index) => { const start = cursor; cursor += job.value / totals.income * 100; return `${CHART_COLORS[index % CHART_COLORS.length]} ${start}% ${cursor}%`; }).join(",") : "#E9DDD7 0 100%";
  const [year, monthNumber] = month.split("-").map(Number);
  const dayCount = new Date(year, monthNumber, 0).getDate();
  const offset = (new Date(year, monthNumber - 1, 1).getDay() + 6) % 7;

  const openJob = (job?: Job, returnToShift = false) => {
    setEditingJob(job?.id ?? null);
    setJobForm(job ? { name: job.name, wage: job.wage, regularHours: regularHoursFor(job), tierOneHours: tierOneHoursFor(job), tierOne: job.tierOne, tierTwo: job.tierTwo, color: job.color, defaultStart: job.defaultStart ?? "09:00", defaultEnd: job.defaultEnd ?? "17:00", defaultBreakMinutes: job.defaultBreakMinutes ?? 0, payDay: payDayFor(job), regularCutoffDay: regularCutoffFor(job), overtimeCutoffDay: overtimeCutoffFor(job) } : { name: "", wage: 0, regularHours: 8, tierOneHours: 2, tierOne: 1.34, tierTwo: 1.67, color: COLORS[jobs.length % COLORS.length], defaultStart: "09:00", defaultEnd: "17:00", defaultBreakMinutes: 0, payDay: 5, regularCutoffDay: 31, overtimeCutoffDay: 25 });
    setResumeShiftAfterJob(returnToShift);
    if (returnToShift) setShiftModal(false);
    setJobModal(true);
  };
  const closeJobModal = () => {
    setJobModal(false);
    if (resumeShiftAfterJob && jobs.length) setShiftModal(true);
    setResumeShiftAfterJob(false);
  };
  const openShift = (date = dateKey(), shift?: Shift) => {
    if (!jobs.length) { setNotice("請先新增一份工作，再記錄班次。"); openJob(undefined, true); return; }
    const defaultJob = jobs.find((job) => job.id === shift?.jobId) ?? jobs[0];
    const start = shift?.start ?? defaultJob.defaultStart ?? "09:00";
    const end = shift?.end ?? defaultJob.defaultEnd ?? "17:00";
    const breakMinutes = shift?.breakMinutes ?? defaultJob.defaultBreakMinutes ?? 0;
    const split = shift && (shift.regularHours !== undefined || shift.overtimeHours !== undefined)
      ? { regularHours: shift.regularHours ?? 0, overtimeHours: shift.overtimeHours ?? 0 }
      : defaultHourSplit(defaultJob, start, end, breakMinutes);
    setEditingShift(shift?.id ?? null);
    setShiftForm({ date: shift?.date ?? date, jobId: shift?.jobId ?? defaultJob.id, start, end, breakMinutes, ...split, fatigue: shift?.fatigue ?? 3, note: shift?.note ?? "", repeatMode: "none" as RepeatMode, repeatUntil: shift?.date ?? monthEnd(date), repeatWeekdays: [new Date(`${shift?.date ?? date}T12:00:00`).getDay()], repeatEveryDays: 7 });
    setShiftModal(true);
  };
  const selectShiftJob = (jobId: string) => {
    const job = jobs.find((item) => item.id === jobId);
    setShiftForm((form) => {
      const start = job?.defaultStart ?? form.start;
      const end = job?.defaultEnd ?? form.end;
      const breakMinutes = job?.defaultBreakMinutes ?? form.breakMinutes;
      return { ...form, jobId, start, end, breakMinutes, ...(job ? defaultHourSplit(job, start, end, breakMinutes) : {}) };
    });
  };
  const setRepeatMode = (repeatMode: RepeatMode) => {
    const weekday = new Date(`${shiftForm.date}T12:00:00`).getDay();
    setShiftForm((form) => ({ ...form, repeatMode, repeatUntil: form.repeatUntil < form.date ? monthEnd(form.date) : form.repeatUntil, repeatWeekdays: form.repeatWeekdays.length ? form.repeatWeekdays : [weekday] }));
  };
  const toggleRepeatWeekday = (weekday: number) => setShiftForm((form) => ({ ...form, repeatWeekdays: form.repeatWeekdays.includes(weekday) ? form.repeatWeekdays.filter((day) => day !== weekday) : [...form.repeatWeekdays, weekday] }));
  const openShiftFromDay = (shift?: Shift) => {
    const date = shift?.date ?? selectedDate;
    if (!date) return;
    setSelectedDate(null);
    openShift(date, shift);
  };
  const saveJob = (event: FormEvent) => {
    event.preventDefault(); const name = jobForm.name.trim();
    if (!name || jobForm.wage <= 0) { setNotice("請填寫工作名稱與正確時薪。"); return; }
    if (jobForm.regularHours < 0 || jobForm.tierOneHours < 0 || jobForm.tierOne < 1 || jobForm.tierTwo < 1) { setNotice("請填寫正確的工時與加班倍率。"); return; }
    if ([jobForm.payDay, jobForm.regularCutoffDay, jobForm.overtimeCutoffDay].some((day) => day < 1 || day > 31)) { setNotice("發薪日與結算日請填 1～31。"); return; }
    const defaultStart = normalizeTime(jobForm.defaultStart);
    const defaultEnd = normalizeTime(jobForm.defaultEnd);
    if (!defaultStart || !defaultEnd) { setNotice("請填寫有效的預設工作時間。"); return; }
    const savedJobForm = { ...jobForm, defaultStart, defaultEnd, defaultBreakMinutes: Math.max(0, jobForm.defaultBreakMinutes) };
    if (editingJob) {
      setJobs((list) => list.map((job) => job.id === editingJob ? { ...job, ...savedJobForm, name } : job));
      setJobModal(false); setNotice("工作設定已更新。");
      return;
    }
    const nextJob = { id: makeId(), ...savedJobForm, name };
    setJobs((list) => [...list, nextJob]);
    setJobModal(false);
    if (resumeShiftAfterJob) {
      setShiftForm((form) => ({ ...form, jobId: nextJob.id }));
      setResumeShiftAfterJob(false);
      setShiftModal(true);
    }
    setNotice("工作已新增。");
  };
  const saveShift = (event: FormEvent) => {
    event.preventDefault(); if (!shiftForm.date || !shiftForm.jobId) return;
    const start = normalizeTime(shiftForm.start);
    const end = normalizeTime(shiftForm.end);
    if (!start || !end) { setNotice("請輸入有效的 24 小時制時間，例如 20:00。"); return; }
    const totalHours = hoursBetween(start, end, Math.max(0, shiftForm.breakMinutes));
    if (shiftForm.regularHours < 0 || shiftForm.overtimeHours < 0) { setNotice("正常與加班時數不能小於 0。"); return; }
    if (Math.abs(shiftForm.regularHours + shiftForm.overtimeHours - totalHours) > 0.01) { setNotice(`正常與加班時數合計需為 ${totalHours.toFixed(1)} 小時。`); return; }
    setShiftForm((form) => ({ ...form, start, end }));
    if (!editingShift && shiftForm.repeatMode !== "none" && shiftForm.repeatUntil < shiftForm.date) { setNotice("重複結束日期不能早於開始日期。"); return; }
    if (!editingShift && shiftForm.repeatMode === "weekly" && !shiftForm.repeatWeekdays.length) { setNotice("請至少選擇一個星期幾。"); return; }
    const dates: string[] = [];
    if (editingShift || shiftForm.repeatMode === "none") {
      dates.push(shiftForm.date);
    } else if (shiftForm.repeatMode === "weekly") {
      let cursorDate = shiftForm.date;
      for (let count = 0; cursorDate <= shiftForm.repeatUntil && count < 730; count += 1) {
        if (shiftForm.repeatWeekdays.includes(new Date(`${cursorDate}T12:00:00`).getDay())) dates.push(cursorDate);
        cursorDate = addDays(cursorDate, 1);
      }
    } else {
      let cursorDate = shiftForm.date;
      const interval = Math.max(1, shiftForm.repeatEveryDays);
      for (let count = 0; cursorDate <= shiftForm.repeatUntil && count < 730; count += 1) {
        dates.push(cursorDate);
        cursorDate = addDays(cursorDate, interval);
      }
    }
    const candidates: Shift[] = dates.map((date, index) => ({ id: editingShift ?? `${makeId()}-${index}`, date, jobId: shiftForm.jobId, start, end, breakMinutes: Math.max(0, shiftForm.breakMinutes), regularHours: shiftForm.regularHours, overtimeHours: shiftForm.overtimeHours, fatigue: shiftForm.fatigue, note: shiftForm.note }));
    const newCandidates = candidates.filter((candidate) => !shifts.some((shift) => shift.id !== editingShift && shift.jobId === candidate.jobId && shift.date === candidate.date && shift.start === candidate.start && shift.end === candidate.end));
    const duplicateCount = candidates.length - newCandidates.length;
    if (!newCandidates.length) { setNotice("這些班次都已存在，沒有重複新增。"); return; }
    const conflicts = newCandidates.filter((candidate) => shifts.some((shift) => shift.id !== editingShift && shiftsOverlap(candidate, shift)));
    if (conflicts.length && !confirm(`有 ${conflicts.length} 筆班次與既有工作時間重疊。仍要儲存嗎？`)) return;
    setShifts((list) => editingShift ? list.map((shift) => shift.id === editingShift ? newCandidates[0] : shift) : [...list, ...newCandidates]);
    const firstDate = newCandidates[0].date;
    setMonth(firstDate.slice(0, 7)); setSelectedDate(firstDate); setShiftModal(false); setPage("calendar");
    const createdText = editingShift ? "班次已更新。" : `已新增 ${newCandidates.length} 筆班次${duplicateCount ? `，略過 ${duplicateCount} 筆重複資料` : ""}。`;
    setNotice(conflicts.length ? `${createdText} 請留意時間重疊。` : createdText);
  };
  const removeJob = (job: Job) => {
    const relatedShiftCount = shifts.filter((shift) => shift.jobId === job.id).length;
    const message = relatedShiftCount
      ? `確定刪除「${job.name}」及行事曆中的 ${relatedShiftCount} 筆班次？此操作無法復原。`
      : `確定刪除「${job.name}」？此操作無法復原。`;
    if (!confirm(message)) return;
    setJobs((list) => list.filter((item) => item.id !== job.id));
    setShifts((list) => list.filter((shift) => shift.jobId !== job.id));
    setSelectedDate(null);
    setNotice(relatedShiftCount ? `工作與 ${relatedShiftCount} 筆班次已刪除。` : "工作已刪除。");
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

  return <main className="min-h-screen bg-[#FCF7ED] text-[#282C34]">
    <div className="mx-auto min-h-screen max-w-[1440px] px-4 py-4 sm:px-7 lg:px-10 lg:py-8">
      <header className="flex items-center justify-between border-b-2 border-[#B4C1D0] pb-4 lg:pb-6">
        <button onClick={() => setPage("home")} className="flex items-center gap-3 text-left"><span className="logo">✦</span><span><small className="eyebrow text-[#52625a]">你的工作帳本</small><strong className="font-display block text-xl">班次帳</strong></span></button>
        <button onClick={() => openShift()} className="primary-pill">+ 新增班次</button>
      </header>
      <div className="grid lg:grid-cols-[190px_1fr] lg:gap-10">
        <nav className="flex gap-2 overflow-x-auto py-5 lg:flex-col lg:pt-10" aria-label="主要功能">
          {[["home", "▣", "總覽"], ["calendar", "□", "月曆"], ["jobs", "♢", "我的工作"]].map(([id, icon, label]) => <button key={id} onClick={() => setPage(id as Page)} className={`nav-button ${page === id ? "active" : ""}`}><span>{icon}</span>{label}</button>)}
          <div className="hidden border-t border-[#DDCED5] pt-6 lg:block"><small className="eyebrow text-[#52625a]">{page === "calendar" ? monthLabel(month) : `${monthLabel(month)}發薪`}</small><p className="mt-2 font-display text-2xl font-bold">{page === "calendar" ? calendarMonthly.length : payrollShiftCount} 個班次</p><p className="font-mono text-xs text-[#52625a]">{(page === "calendar" ? calendarMonthly.reduce((sum, shift) => sum + shift.hours, 0) : totals.hours).toFixed(1)} 小時</p></div>
        </nav>

        {page === "home" && <section className="page-section">
          <div className="section-heading"><div><small className="eyebrow text-[#A6655F]">發薪總覽 / {monthLabel(month)}</small><h2>這次會領多少？</h2></div><div><small className="picker-label">選擇發薪月份</small><MonthPicker value={month} onChange={setMonth} /></div></div>
          {!jobs.length ? <Empty title="先建立你的第一份工作" text="填入工作名稱、時薪與加班倍率，接著就能記錄真實班次。這裡不會放入任何示範資料。" action="+ 新增工作" onClick={() => openJob()} /> : <>
            <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
              <article className="income-card"><small className="eyebrow text-[#282C34]">預計發薪總額</small><p className="mt-5 font-display text-5xl font-bold tracking-[-.06em] sm:text-6xl">{money(totals.income)}</p><div className="income-stats"><span><b>{totals.hours.toFixed(1)}</b>計薪小時</span><span><b>{payrollShiftCount}</b>相關班次</span><span><b>{money(payrollShiftCount ? totals.income / payrollShiftCount : 0)}</b>平均每班</span></div></article>
              <article className="paper-card"><small className="eyebrow text-[#52625a]">本次薪資涵蓋範圍</small><div className="pay-period-list">{jobs.map((job) => { const regular = payPeriod(month, regularCutoffFor(job)); const overtime = payPeriod(month, overtimeCutoffFor(job)); return <div key={job.id}><strong>{job.name} · {dateAtDay(month, payDayFor(job)).slice(5).replace("-", "/")} 發薪</strong><p>正常 {regular.start.slice(5).replace("-", "/")}～{regular.end.slice(5).replace("-", "/")}<br />加班 {overtime.start.slice(5).replace("-", "/")}～{overtime.end.slice(5).replace("-", "/")}</p></div>; })}</div></article>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["全部工時", totals.hours, totals.income, "#B4C1D0", "#282C34"], ["一般工時", totals.regular, totals.regularPay, "#BDCDBA", "#282C34"], ["加班第一階段", totals.overtimeOne, totals.overtimeOnePay, "#DDCED5", "#282C34"], ["加班第二階段", totals.overtimeTwo, totals.overtimeTwoPay, "#DFC1C6", "#282C34"]].map(([label, hours, pay, bg, color]) => <article key={String(label)} className="summary-card" style={{ background: String(bg), color: String(color) }}><small className="eyebrow">{label}</small><p className="mt-5 font-display text-3xl font-bold">{Number(hours).toFixed(1)} h</p><p className="font-mono text-xs">{money(Number(pay))}</p></article>)}</div>
          </>}
        </section>}

        {page === "calendar" && <section className="page-section">
          <div className="section-heading"><div><small className="eyebrow text-[#A6655F]">每個班次，一眼掌握</small><h2>{monthLabel(month)}</h2></div><MonthPicker value={month} onChange={(value) => { setMonth(value); setSelectedDate(null); }} /></div>
          <div className="calendar"><div className="calendar-head">{"一 二 三 四 五 六 日".split(" ").map((day) => <span key={day}>{day}</span>)}</div><div className="calendar-grid">{Array.from({ length: offset }).map((_, index) => <i key={`e${index}`} />)}{Array.from({ length: dayCount }, (_, index) => index + 1).map((day) => { const date = `${month}-${String(day).padStart(2, "0")}`; const records = calendarMonthly.filter((s) => s.date === date); return <button key={day} className={date === selectedDate ? "selected" : ""} aria-pressed={date === selectedDate} onClick={() => setSelectedDate(date)}><b className={date === dateKey() ? "today" : ""}>{day}</b>{records.length > 0 && <><span className="dots">{records.slice(0, 3).map((s) => <i key={s.id} style={{ background: s.job.color }} />)}</span><small>正 {records.reduce((sum, s) => sum + s.regular, 0).toFixed(1)}h<br />加 {records.reduce((sum, s) => sum + s.overtimeOne + s.overtimeTwo, 0).toFixed(1)}h</small></>}</button>; })}</div></div>
        </section>}

        {page === "jobs" && <section className="page-section">
          <div className="section-heading"><div><small className="eyebrow text-[#A6655F]">設定你的實際費率</small><h2>我的工作</h2></div><button onClick={() => openJob()} className="dark-pill">+ 新增工作</button></div>
          <div className="space-y-3">{!jobs.length && <Empty compact title="尚未建立工作" text="新增後即可開始記錄班次。" />}{jobs.map((job) => <article key={job.id} className="job-row"><i style={{ background: job.color }} /><div><h3>{job.name}</h3><p>{shifts.filter((shift) => shift.jobId === job.id).length} 筆班次 · 每月 {payDayFor(job)} 日發薪 · 正常 {regularCutoffFor(job)} 日結／加班 {overtimeCutoffFor(job)} 日結</p></div><span><small>基本時薪</small><b>{money(job.wage)}</b></span><span><small>加班設定</small><b>前 {tierOneHoursFor(job)}h ×{job.tierOne} / 後續 ×{job.tierTwo}</b></span><div><button onClick={() => openJob(job)}>編輯</button><button className="danger" onClick={() => removeJob(job)}>刪除</button></div></article>)}</div>
          <div className="backup-card"><div><h3>備份此裝置的資料</h3><p>匯出 JSON 後可在其他瀏覽器或裝置重新匯入。</p></div><div><input ref={importRef} type="file" accept=".json,application/json" hidden onChange={(event) => event.target.files?.[0] && importData(event.target.files[0])} /><button onClick={() => importRef.current?.click()} className="secondary-pill">↑ 匯入</button><button onClick={exportData} className="yellow-pill">↓ 匯出</button></div></div>
        </section>}
      </div>
    </div>

    {notice && <div role="status" className="toast">{notice}</div>}
    {selectedDate && <Modal eyebrow="當日工作" title={dateLabel(selectedDate)} onClose={() => setSelectedDate(null)}><div className="day-shift-panel"><button onClick={() => openShiftFromDay()} className="secondary-pill">+ 新增班次</button><div className="space-y-3">{!selectedDayShifts.length && <Empty compact title="當天尚無班次" text="可從上方新增一筆班次，開始記錄當天工作。" />}{selectedDayShifts.map((shift) => { const overtime = shift.overtimeOne + shift.overtimeTwo; return <article key={shift.id} className="shift-row day-shift-row selectable" role="button" tabIndex={0} onClick={() => openShiftFromDay(shift)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openShiftFromDay(shift); }}><i style={{ background: shift.job.color }} /><div><h4>{shift.job.name}</h4><p>{shift.start}–{shift.end} · 休息 {shift.breakMinutes} 分鐘 · 一般 {shift.regular.toFixed(1)} 小時{overtime > 0 ? ` · 加班 ${overtime.toFixed(1)} 小時` : ""}</p>{shift.note && <p>{shift.note}</p>}</div><span><b>{money(shift.income)}</b>{shift.hours.toFixed(1)} 小時</span><div><button onClick={(event) => { event.stopPropagation(); openShiftFromDay(shift); }}>編輯</button><button className="danger" onClick={(event) => { event.stopPropagation(); removeShift(shift); }}>刪除</button></div></article>; })}</div></div></Modal>}
    {jobModal && <Modal title={editingJob ? "編輯工作" : "新增工作"} onClose={closeJobModal}><form onSubmit={saveJob} className="form-grid">
      <Field label="工作名稱"><input autoFocus value={jobForm.name} onChange={(e) => setJobForm({ ...jobForm, name: e.target.value })} placeholder="例如：咖啡店晚班" /></Field>
      <Field label="基本時薪（新台幣）"><input type="number" min="1" value={jobForm.wage || ""} onChange={(e) => setJobForm({ ...jobForm, wage: Number(e.target.value) })} /></Field>
      <div className="schedule-defaults"><strong>工時與加班倍率</strong><p>每筆班次會先自動拆分，也可以在日曆中依實際情況調整。</p>
        <Field label="一般工時上限（小時）"><input type="number" min="0" step="0.5" value={jobForm.regularHours} onChange={(e) => setJobForm({ ...jobForm, regularHours: Number(e.target.value) })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="加班前段時數"><input type="number" min="0" step="0.5" value={jobForm.tierOneHours} onChange={(e) => setJobForm({ ...jobForm, tierOneHours: Number(e.target.value) })} /></Field><Field label="前段倍率"><input type="number" min="1" step="0.01" value={jobForm.tierOne} onChange={(e) => setJobForm({ ...jobForm, tierOne: Number(e.target.value) })} /></Field></div>
        <Field label="超過前段時數後的倍率"><input type="number" min="1" step="0.01" value={jobForm.tierTwo} onChange={(e) => setJobForm({ ...jobForm, tierTwo: Number(e.target.value) })} /></Field>
        <small>計算方式：前 {jobForm.regularHours || 0} 小時為一般工時，接著 {jobForm.tierOneHours || 0} 小時 ×{jobForm.tierOne || 0}，之後 ×{jobForm.tierTwo || 0}。</small>
      </div>
      <div className="schedule-defaults"><strong>發薪與結算週期</strong><p>總覽會依發薪月份，分別抓取正常與加班時數。</p>
        <Field label="每月發薪日"><input type="number" min="1" max="31" value={jobForm.payDay} onChange={(e) => setJobForm({ ...jobForm, payDay: Number(e.target.value) })} /></Field>
        <div className="grid grid-cols-2 gap-3"><Field label="正常工時結算日"><input type="number" min="1" max="31" value={jobForm.regularCutoffDay} onChange={(e) => setJobForm({ ...jobForm, regularCutoffDay: Number(e.target.value) })} /></Field><Field label="加班工時結算日"><input type="number" min="1" max="31" value={jobForm.overtimeCutoffDay} onChange={(e) => setJobForm({ ...jobForm, overtimeCutoffDay: Number(e.target.value) })} /></Field></div>
        <small>範例：正常填 31、加班填 25，7 月發薪即計入正常 7/1～7/31、加班 6/26～7/25；不足 31 日的月份會自動取月底。</small>
      </div>
      <div className="schedule-defaults"><strong>預設工作時間</strong><p>新增這份工作的班次時會自動帶入，之後仍可個別修改。</p>
        <div className="grid grid-cols-2 gap-3"><Field label="預設開始"><input type="text" inputMode="numeric" value={jobForm.defaultStart} onChange={(e) => setJobForm({ ...jobForm, defaultStart: e.target.value })} onBlur={() => { const value = normalizeTime(jobForm.defaultStart); if (value) setJobForm((form) => ({ ...form, defaultStart: value })); }} /></Field><Field label="預設結束"><input type="text" inputMode="numeric" value={jobForm.defaultEnd} onChange={(e) => setJobForm({ ...jobForm, defaultEnd: e.target.value })} onBlur={() => { const value = normalizeTime(jobForm.defaultEnd); if (value) setJobForm((form) => ({ ...form, defaultEnd: value })); }} /></Field></div>
        <Field label="預設休息分鐘數"><input type="number" min="0" step="5" value={jobForm.defaultBreakMinutes} onChange={(e) => setJobForm({ ...jobForm, defaultBreakMinutes: Number(e.target.value) })} /></Field>
        <small>預設工作時長：{hoursBetween(jobForm.defaultStart, jobForm.defaultEnd, jobForm.defaultBreakMinutes).toFixed(1)} 小時</small>
      </div>
      <Field label="識別顏色"><input type="color" value={jobForm.color} onChange={(e) => setJobForm({ ...jobForm, color: e.target.value })} /></Field><button className="form-submit">儲存工作 →</button>
    </form></Modal>}
    {shiftModal && <Modal eyebrow={editingShift ? "編輯班次" : "新增班次"} title={shiftJobName} onClose={() => setShiftModal(false)}><form onSubmit={saveShift} className="form-grid">
      <Field label="開始日期"><input type="date" value={shiftForm.date} onChange={(e) => setShiftForm((form) => ({ ...form, date: e.target.value, repeatUntil: form.repeatUntil < e.target.value ? monthEnd(e.target.value) : form.repeatUntil }))} /></Field>
      {!editingShift && <div className="repeat-panel"><strong>重複排程</strong><div className="repeat-mode" role="group" aria-label="重複方式"><button type="button" className={shiftForm.repeatMode === "none" ? "active" : ""} onClick={() => setRepeatMode("none")}>不重複</button><button type="button" className={shiftForm.repeatMode === "weekly" ? "active" : ""} onClick={() => setRepeatMode("weekly")}>每週指定日</button><button type="button" className={shiftForm.repeatMode === "interval" ? "active" : ""} onClick={() => setRepeatMode("interval")}>每隔幾天</button></div>
        {shiftForm.repeatMode === "weekly" && <div><small>選擇星期幾</small><div className="weekday-picker">{weekdayLabels.map((label, weekday) => <button type="button" key={label} className={shiftForm.repeatWeekdays.includes(weekday) ? "active" : ""} aria-pressed={shiftForm.repeatWeekdays.includes(weekday)} onClick={() => toggleRepeatWeekday(weekday)}>{label}</button>)}</div></div>}
        {shiftForm.repeatMode === "interval" && <Field label="間隔天數"><div className="interval-field">每 <input type="number" min="1" max="365" value={shiftForm.repeatEveryDays} onChange={(e) => setShiftForm({ ...shiftForm, repeatEveryDays: Math.max(1, Number(e.target.value)) })} /> 天一次</div></Field>}
        {shiftForm.repeatMode !== "none" && <Field label="重複至"><input type="date" min={shiftForm.date} value={shiftForm.repeatUntil} onChange={(e) => setShiftForm({ ...shiftForm, repeatUntil: e.target.value })} /></Field>}
      </div>}
      <Field label="工作"><div className="work-picker"><select value={shiftForm.jobId} onChange={(e) => selectShiftJob(e.target.value)}>{jobs.map((job) => <option key={job.id} value={job.id}>{job.name}（{jobScheduleLabel(job)}）</option>)}</select><button type="button" onClick={() => openJob(undefined, true)}>+ 新增工作</button></div></Field>
      <div className="grid grid-cols-2 gap-3"><Field label="開始時間"><input type="text" inputMode="numeric" maxLength={5} autoComplete="off" value={shiftForm.start} onChange={(e) => setShiftForm((form) => ({ ...form, start: e.target.value }))} onBlur={() => { const value = normalizeTime(shiftForm.start); if (value) setShiftForm((form) => ({ ...form, start: value })); }} /></Field><Field label="結束時間"><input type="text" inputMode="numeric" maxLength={5} autoComplete="off" value={shiftForm.end} onChange={(e) => setShiftForm((form) => ({ ...form, end: e.target.value }))} onBlur={() => { const value = normalizeTime(shiftForm.end); if (value) setShiftForm((form) => ({ ...form, end: value })); }} /></Field></div>
      <Field label="休息分鐘數"><input type="number" min="0" step="5" value={shiftForm.breakMinutes} onChange={(e) => setShiftForm({ ...shiftForm, breakMinutes: Number(e.target.value) })} /></Field>
      <div className="hour-allocation"><div><strong>這一天如何分配？</strong><small>兩者合計需等於實際 {hoursBetween(shiftForm.start, shiftForm.end, shiftForm.breakMinutes).toFixed(1)} 小時</small></div><div className="grid grid-cols-2 gap-3"><Field label="正常工時"><input type="number" min="0" step="0.5" value={shiftForm.regularHours} onChange={(e) => setShiftForm({ ...shiftForm, regularHours: Number(e.target.value) })} /></Field><Field label="加班工時"><input type="number" min="0" step="0.5" value={shiftForm.overtimeHours} onChange={(e) => setShiftForm({ ...shiftForm, overtimeHours: Number(e.target.value) })} /></Field></div><button type="button" onClick={() => { const job = jobs.find((item) => item.id === shiftForm.jobId); if (job) setShiftForm((form) => ({ ...form, ...defaultHourSplit(job, form.start, form.end, form.breakMinutes) })); }}>依時間自動分配</button></div>
      <Field label="疲勞程度"><div className="fatigue">{[1, 2, 3, 4, 5].map((level) => <button type="button" key={level} onClick={() => setShiftForm({ ...shiftForm, fatigue: level })} className={shiftForm.fatigue >= level ? "active" : ""} aria-label={`疲勞程度 ${level}`}>✦</button>)}</div></Field><Field label="備註（選填）"><textarea rows={3} value={shiftForm.note} onChange={(e) => setShiftForm({ ...shiftForm, note: e.target.value })} placeholder="例如：代班" /></Field><button className="form-submit">{editingShift ? "儲存班次" : shiftForm.repeatMode === "none" ? "儲存班次" : "批次新增班次"} →</button>
    </form></Modal>}
  </main>;
}

function Empty({ title, text, action, onClick, compact = false }: { title: string; text: string; action?: string; onClick?: () => void; compact?: boolean }) {
  return <div className={`empty ${compact ? "compact" : ""}`}><div><span>✦</span><h3>{title}</h3><p>{text}</p>{action && <button onClick={onClick}>{action}</button>}</div></div>;
}
function Modal({ eyebrow = "資料設定", title, onClose, children }: { eyebrow?: string; title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal-card"><header><div><small className="eyebrow text-[#A6655F]">{eyebrow}</small><h2>{title}</h2></div><button onClick={onClose} aria-label="關閉">×</button></header>{children}</div></div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
