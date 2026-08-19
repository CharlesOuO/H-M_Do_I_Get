import { useMemo, useState } from "react";

type Shift = {
  id: number;
  date: string;
  job: string;
  start: string;
  end: string;
  multiplier: number;
  fatigue: number;
  color: string;
};

type Job = { name: string; wage: number; tierOne: number; tierTwo: number; color: string };

const initialJobs: Job[] = [
  { name: "小燈咖啡館", wage: 185, tierOne: 1.34, tierTwo: 1.67, color: "#ff7048" },
  { name: "海苔書店", wage: 170, tierOne: 1.34, tierTwo: 1.67, color: "#7a6cf6" },
  { name: "十七號工作室", wage: 210, tierOne: 1.5, tierTwo: 2, color: "#20a38a" },
];

const initialShifts: Shift[] = [
  { id: 1, date: "2025-04-02", job: "小燈咖啡館", start: "09:00", end: "17:30", multiplier: 1.34, fatigue: 3, color: "#ff7048" },
  { id: 2, date: "2025-04-04", job: "海苔書店", start: "12:00", end: "20:00", multiplier: 1.34, fatigue: 2, color: "#7a6cf6" },
  { id: 3, date: "2025-04-08", job: "小燈咖啡館", start: "10:00", end: "21:30", multiplier: 1.34, fatigue: 5, color: "#ff7048" },
  { id: 4, date: "2025-04-11", job: "十七號工作室", start: "13:00", end: "19:00", multiplier: 1.5, fatigue: 2, color: "#20a38a" },
  { id: 5, date: "2025-04-15", job: "小燈咖啡館", start: "08:00", end: "18:00", multiplier: 1.34, fatigue: 4, color: "#ff7048" },
  { id: 6, date: "2025-04-18", job: "海苔書店", start: "11:30", end: "20:30", multiplier: 1.34, fatigue: 3, color: "#7a6cf6" },
  { id: 7, date: "2025-04-22", job: "小燈咖啡館", start: "09:00", end: "22:00", multiplier: 1.67, fatigue: 5, color: "#ff7048" },
  { id: 8, date: "2025-04-26", job: "十七號工作室", start: "10:00", end: "16:30", multiplier: 1.5, fatigue: 2, color: "#20a38a" },
];

const timeToHours = (start: string, end: string) => {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  return minutes / 60;
};

const formatMoney = (n: number) => `¥${Math.round(n).toLocaleString("zh-TW")}`;

function Logo() {
  return <div className="grid size-10 place-items-center rounded-[14px] bg-[#111111] text-xl text-[#ffec6a] shadow-[3px_3px_0_#ff7048]">✦</div>;
}

export default function App() {
  const [active, setActive] = useState<"home" | "calendar" | "jobs">("home");
  const [shifts, setShifts] = useState(initialShifts);
  const [jobs, setJobs] = useState(initialJobs);
  const [showModal, setShowModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState("2025-04-29");
  const [form, setForm] = useState({ job: "小燈咖啡館", start: "09:00", end: "17:00", multiplier: "1.34", fatigue: 3 });

  const calculations = useMemo(() => shifts.map((shift) => {
    const job = jobs.find((item) => item.name === shift.job) ?? jobs[0];
    const hours = timeToHours(shift.start, shift.end);
    const basic = Math.min(hours, 8);
    const tier1 = Math.min(Math.max(hours - 8, 0), 2);
    const tier2 = Math.max(hours - 10, 0);
    const money = basic * job.wage + tier1 * job.wage * shift.multiplier + tier2 * job.wage * Math.max(shift.multiplier, job.tierTwo);
    return { ...shift, hours, basic, tier1, tier2, money };
  }), [jobs, shifts]);

  const totals = useMemo(() => calculations.reduce((acc, shift) => ({
    income: acc.income + shift.money, basicHours: acc.basicHours + shift.basic, basicMoney: acc.basicMoney + shift.basic * (jobs.find(j => j.name === shift.job)?.wage ?? 0),
    tier1Hours: acc.tier1Hours + shift.tier1, tier1Money: acc.tier1Money + shift.tier1 * (jobs.find(j => j.name === shift.job)?.wage ?? 0) * shift.multiplier,
    tier2Hours: acc.tier2Hours + shift.tier2, tier2Money: acc.tier2Money + shift.tier2 * (jobs.find(j => j.name === shift.job)?.wage ?? 0) * Math.max(shift.multiplier, jobs.find(j => j.name === shift.job)?.tierTwo ?? 1),
  }), { income: 0, basicHours: 0, basicMoney: 0, tier1Hours: 0, tier1Money: 0, tier2Hours: 0, tier2Money: 0 }), [calculations, jobs]);

  const addShift = () => {
    const job = jobs.find((item) => item.name === form.job)!;
    setShifts((current) => [...current, { id: Date.now(), date: selectedDate, job: form.job, start: form.start, end: form.end, multiplier: Number(form.multiplier), fatigue: form.fatigue, color: job.color }]);
    setShowModal(false);
    setActive("calendar");
  };

  const addJob = () => setJobs((current) => [...current, { name: `新兼職工作 ${current.length + 1}`, wage: 180, tierOne: 1.34, tierTwo: 1.67, color: "#f2a93b" }]);

  const openDate = (day: number) => { setSelectedDate(`2025-04-${String(day).padStart(2, "0")}`); setShowModal(true); };
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  const startOffset = 2;
  const jobTotals = jobs.map(job => ({ ...job, value: calculations.filter(s => s.job === job.name).reduce((sum, s) => sum + s.money, 0) }));
  const donut = jobTotals.reduce((acc, item) => `${item.color} ${acc}% ${acc + (item.value / totals.income) * 100}%`, "");

  return (
    <main className="min-h-screen bg-[#fcf7ed] text-[#171615] selection:bg-[#ffec6a]">
      <div className="mx-auto min-h-screen max-w-[1440px] px-4 py-4 sm:px-7 lg:px-10 lg:py-8">
        <header className="flex items-center justify-between border-b-2 border-[#171615] pb-4 lg:pb-6">
          <div className="flex items-center gap-3"><Logo /><div><p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#716c62]">你的工作帳本</p><h1 className="font-display text-xl font-bold tracking-tight">班次帳</h1></div></div>
          <div className="flex items-center gap-3"><button className="hidden rounded-full border border-[#171615] px-4 py-2 font-mono text-[11px] font-bold sm:block">⌁ 離線可用</button><button onClick={() => setShowModal(true)} className="rounded-full bg-[#ff7048] px-4 py-2.5 font-mono text-xs font-black shadow-[3px_3px_0_#171615] transition hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none">+ 新增班次</button></div>
        </header>

        <div className="grid lg:grid-cols-[190px_1fr] lg:gap-10">
          <nav className="flex gap-2 overflow-x-auto py-5 lg:flex-col lg:pt-10">
            {[["home", "▣", "總覽"], ["calendar", "□", "月曆"], ["jobs", "♢", "我的工作"]].map(([id, icon, label]) => <button key={id} onClick={() => setActive(id as typeof active)} className={`flex shrink-0 items-center gap-3 rounded-full px-4 py-2.5 text-left font-mono text-xs font-bold transition lg:rounded-xl ${active === id ? "bg-[#171615] text-[#fffaf0]" : "hover:bg-[#f0e9dc]"}`}><span className="text-base">{icon}</span>{label}</button>)}
            <div className="hidden border-t border-[#d8d0c2] pt-6 lg:block"><p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[#8b8479]">2025 年 4 月</p><p className="mt-2 font-display text-2xl font-bold">12 個班次</p><p className="font-mono text-xs text-[#716c62]">83.5 小時</p></div>
          </nav>

          {active === "home" && <section className="py-3 lg:py-10">
            <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="font-mono text-[11px] font-bold uppercase tracking-[.14em] text-[#ff7048]">收入儀表板 / 4 月 1–30 日</p><h2 className="mt-1 font-display text-4xl font-bold tracking-[-.05em] sm:text-5xl">每一分鐘，都值得計算。</h2></div><div className="flex rounded-full border border-[#cfc6b5] p-1 font-mono text-[11px] font-bold"><button className="rounded-full bg-[#ffec6a] px-3 py-2">本月</button><button className="px-3 py-2 text-[#716c62]">自訂</button></div></div>
            <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
              <div className="overflow-hidden rounded-[28px] bg-[#171615] p-6 text-[#fffaf0] shadow-[5px_5px_0_#ff7048] sm:p-8"><p className="font-mono text-[11px] font-bold uppercase tracking-[.16em] text-[#ffec6a]">本月總收入</p><div className="mt-5 flex items-end justify-between gap-3"><h3 className="font-display text-5xl font-bold tracking-[-.06em] sm:text-6xl">{formatMoney(totals.income)}</h3><span className="mb-2 rounded-full bg-[#20a38a] px-3 py-1 font-mono text-[10px] font-bold text-[#071c18]">↑ 14.2%</span></div><div className="mt-10 grid grid-cols-3 border-t border-white/20 pt-4 font-mono text-xs"><span><b className="block text-lg text-[#fffaf0]">{(totals.basicHours + totals.tier1Hours + totals.tier2Hours).toFixed(1)}</b>小時</span><span><b className="block text-lg text-[#fffaf0]">12</b>班次</span><span><b className="block text-lg text-[#fffaf0]">{formatMoney(totals.income / 12)}</b>平均每班</span></div></div>
              <div className="rounded-[28px] border border-[#d7cebd] bg-[#fffaf0] p-6 sm:p-8"><div className="flex items-start justify-between"><div><p className="font-mono text-[11px] font-bold uppercase tracking-[.16em] text-[#716c62]">工作收入占比</p><p className="mt-1 text-sm text-[#716c62]">看看收入從哪裡來。</p></div><span className="text-xl">↗</span></div><div className="mt-7 flex items-center gap-6"><div className="grid size-32 shrink-0 place-items-center rounded-full" style={{ background: `conic-gradient(${donut})` }}><div className="grid size-20 place-items-center rounded-full bg-[#fffaf0] text-center font-mono text-[10px] font-bold leading-tight">3<br/>工作</div></div><div className="min-w-0 space-y-3">{jobTotals.map(job => <div key={job.name} className="flex items-center gap-2 font-mono text-[11px]"><span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: job.color }}></span><span className="min-w-0 flex-1 truncate">{job.name}</span><b>{Math.round(job.value / totals.income * 100)}%</b></div>)}</div></div></div>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["All 小時", `${(totals.basicHours + totals.tier1Hours + totals.tier2Hours).toFixed(1)} h`, formatMoney(totals.income), "#171615"], ["Under 8 小時", `${totals.basicHours.toFixed(1)} h`, formatMoney(totals.basicMoney), "#ffec6a"], ["加班第 1 級", `${totals.tier1Hours.toFixed(1)} h`, formatMoney(totals.tier1Money), "#d9d4ff"], ["加班第 2 級", `${totals.tier2Hours.toFixed(1)} h`, formatMoney(totals.tier2Money), "#bceee1"]].map(([label, 小時, money, color]) => <article key={label} className="rounded-2xl border border-[#d7cebd] p-5" style={{ backgroundColor: color }}><p className="font-mono text-[10px] font-bold uppercase tracking-[.13em]">{label}</p><p className="mt-5 font-display text-3xl font-bold">{小時}</p><p className="font-mono text-xs">{money}</p></article>)}</div>
          </section>}

          {active === "calendar" && <section className="py-3 lg:py-10"><div className="mb-7 flex items-end justify-between"><div><p className="font-mono text-[11px] font-bold uppercase tracking-[.14em] text-[#ff7048]">這個月，一眼掌握</p><h2 className="mt-1 font-display text-4xl font-bold tracking-[-.05em]">2025 年 4 月</h2></div><button className="rounded-full border border-[#171615] px-4 py-2 font-mono text-xs font-bold">‹  今天  ›</button></div><div className="overflow-hidden rounded-[24px] border border-[#d7cebd] bg-[#fffaf0]"><div className="grid grid-cols-7 border-b border-[#d7cebd]">{"一 二 三 四 五 六 日".split(" ").map(day => <div key={day} className="p-3 text-center font-mono text-[10px] font-bold tracking-widest text-[#716c62]">{day}</div>)}</div><div className="grid grid-cols-7">{Array.from({ length: startOffset }).map((_, i) => <div key={`empty-${i}`} className="min-h-24 border-b border-r border-[#e8e0d3] bg-[#faf5eb]" />)}{days.map(day => { const key = `2025-04-${String(day).padStart(2, "0")}`; const records = calculations.filter(s => s.date === key); const amount = records.reduce((sum, s) => sum + s.money, 0); return <button onClick={() => openDate(day)} key={day} className="group min-h-24 border-b border-r border-[#e8e0d3] p-2 text-left transition hover:bg-[#ffec6a] sm:p-3"><span className={`grid size-6 place-items-center rounded-full font-mono text-xs font-bold ${day === 29 ? "bg-[#171615] text-white" : ""}`}>{day}</span>{records.length > 0 && <div className="mt-3"><div className="flex -space-x-1">{records.slice(0, 3).map((r, i) => <span key={i} className="size-2.5 rounded-full border border-white" style={{ backgroundColor: r.color }} />)}</div><p className="mt-1 font-mono text-[10px] font-bold">{formatMoney(amount)}</p></div>}</button>})}</div></div><p className="mt-4 font-mono text-xs text-[#716c62]">點選任意日期即可新增班次。彩色圓點代表工作類型，金額已包含加班費。</p></section>}

          {active === "jobs" && <section className="py-3 lg:py-10"><div className="mb-7 flex items-end justify-between"><div><p className="font-mono text-[11px] font-bold uppercase tracking-[.14em] text-[#ff7048]">你設定費率，我們精準計算</p><h2 className="mt-1 font-display text-4xl font-bold tracking-[-.05em]">我的工作</h2></div><button onClick={addJob} className="rounded-full bg-[#171615] px-4 py-2.5 font-mono text-xs font-bold text-white">+ 新增工作</button></div><div className="space-y-3">{jobs.map((job, index) => <article key={job.name} className="grid items-center gap-4 rounded-2xl border border-[#d7cebd] bg-[#fffaf0] p-5 sm:grid-cols-[auto_1fr_auto_auto_auto]"><span className="size-10 rounded-xl" style={{ backgroundColor: job.color }}></span><div><h3 className="font-display text-2xl font-bold">{job.name}</h3><p className="font-mono text-[11px] text-[#716c62]">使用中 · {calculations.filter(s => s.job === job.name).length} 個本月班次</p></div><div className="font-mono text-xs"><span className="block text-[#716c62]">基本時薪</span><b className="text-base">{formatMoney(job.wage)}</b></div><div className="font-mono text-xs"><span className="block text-[#716c62]">加班 A / B</span><b className="text-base">×{job.tierOne} / ×{job.tierTwo}</b></div><button onClick={() => setJobs(current => current.map((j, i) => i === index ? { ...j, wage: j.wage + 5 } : j))} className="rounded-full border border-[#171615] px-3 py-2 font-mono text-[10px] font-bold">編輯</button></article>)}</div><div className="mt-7 rounded-2xl border-2 border-dashed border-[#cfc6b5] p-5 sm:flex sm:items-center sm:justify-between"><div><p className="font-display text-xl font-bold">資料完全由你掌握。</p><p className="mt-1 text-sm text-[#716c62]">隨時匯出 JSON 備份，換裝置也不怕。</p></div><button className="mt-4 rounded-full bg-[#ffec6a] px-4 py-2.5 font-mono text-xs font-bold sm:mt-0">↓ 匯出備份</button></div></section>}
        </div>
      </div>

      {showModal && <div className="fixed inset-0 z-20 grid place-items-end bg-[#171615]/50 p-0 backdrop-blur-sm sm:place-items-center sm:p-6"><div className="w-full max-w-lg rounded-t-[28px] bg-[#fffaf0] p-6 shadow-2xl sm:rounded-[28px]"><div className="flex items-start justify-between"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[.14em] text-[#ff7048]">新增班次</p><h2 className="font-display text-3xl font-bold">{selectedDate.replace("2025-", "")}</h2></div><button onClick={() => setShowModal(false)} className="grid size-9 place-items-center rounded-full border border-[#171615] text-lg">×</button></div><div className="mt-6 grid gap-4"><label className="font-mono text-[11px] font-bold">選擇工作<select value={form.job} onChange={e => setForm({ ...form, job: e.target.value })} className="mt-1.5 w-full rounded-xl border border-[#cfc6b5] bg-white px-3 py-3 font-sans text-sm">{jobs.map(job => <option key={job.name}>{job.name}</option>)}</select></label><div className="grid grid-cols-2 gap-3"><label className="font-mono text-[11px] font-bold">開始時間<input type="time" value={form.start} onChange={e => setForm({ ...form, start: e.target.value })} className="mt-1.5 w-full rounded-xl border border-[#cfc6b5] bg-white px-3 py-3 font-sans text-sm" /></label><label className="font-mono text-[11px] font-bold">結束時間<input type="time" value={form.end} onChange={e => setForm({ ...form, end: e.target.value })} className="mt-1.5 w-full rounded-xl border border-[#cfc6b5] bg-white px-3 py-3 font-sans text-sm" /></label></div><label className="font-mono text-[11px] font-bold">當日加成倍率<input type="number" min="1" step="0.01" value={form.multiplier} onChange={e => setForm({ ...form, multiplier: e.target.value })} className="mt-1.5 w-full rounded-xl border border-[#cfc6b5] bg-white px-3 py-3 font-sans text-sm" /></label><div><p className="font-mono text-[11px] font-bold">疲勞程度</p><div className="mt-2 flex gap-2">{[1, 2, 3, 4, 5].map(n => <button key={n} onClick={() => setForm({ ...form, fatigue: n })} className={`grid size-10 place-items-center rounded-full text-lg ${form.fatigue >= n ? "bg-[#ffec6a]" : "bg-[#f0e9dc]"}`}>✦</button>)}</div></div><button onClick={addShift} className="mt-2 rounded-xl bg-[#ff7048] py-4 font-mono text-xs font-black shadow-[3px_3px_0_#171615]">儲存班次 →</button></div></div></div>}
    </main>
  );
}
