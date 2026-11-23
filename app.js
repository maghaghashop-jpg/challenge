const DEFAULT_SUPABASE_URL = "https://fkejujiwmjrbeqfovdbg.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_r1XsNTmAoNJKCeR9zgnjkg_NjvO2uJ1";
const CONFIG_KEY = "savings100k_supabase_config";
const LOCAL_PROGRESS_KEY = "savings100k_completed_days";
const START_DATE = new Date("2026-10-01T00:00:00Z");
const TOTAL_TARGET = 100000;

const monthNames = ["أكتوبر", "نوفمبر", "ديسمبر", "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر"];
const stages = ["بداية هادئة", "تثبيت العادة", "زيادة بسيطة", "انتظام", "رفع المستوى", "منتصف الطريق", "ثبات أقوى", "نمو مستمر", "دفعة إضافية", "اقتراب الهدف", "مستوى متقدم", "اللمسة الأخيرة"];
const monthDays = [31, 30, 31, 31, 28, 31, 30, 31, 30, 31, 31, 30];
const monthTargets = [4450, 5000, 5800, 6500, 6600, 8100, 8600, 9650, 10100, 11200, 12000, 12000];
const weekdayNames = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const elements = {
  progressRing: document.querySelector("#progressRing"),
  progressPercent: document.querySelector("#progressPercent"),
  savedAmount: document.querySelector("#savedAmount"),
  remainingAmount: document.querySelector("#remainingAmount"),
  completedDays: document.querySelector("#completedDays"),
  daysMessage: document.querySelector("#daysMessage"),
  syncStatus: document.querySelector("#syncStatus"),
  monthlyRoadmap: document.querySelector("#monthlyRoadmap"),
  tableBody: document.querySelector("#daysTableBody"),
  emptyState: document.querySelector("#emptyState"),
  monthFilter: document.querySelector("#monthFilter"),
  statusFilter: document.querySelector("#statusFilter"),
  settingsModal: document.querySelector("#settingsModal"),
  settingsForm: document.querySelector("#settingsForm"),
  supabaseUrl: document.querySelector("#supabaseUrl"),
  supabaseKey: document.querySelector("#supabaseKey"),
  settingsMessage: document.querySelector("#settingsMessage"),
  disconnectButton: document.querySelector("#disconnectButton"),
  authModal: document.querySelector("#authModal"),
  authForm: document.querySelector("#authForm"),
  emailInput: document.querySelector("#emailInput"),
  authMessage: document.querySelector("#authMessage"),
  authButton: document.querySelector("#authButton"),
  connectionBanner: document.querySelector("#connectionBanner"),
  toast: document.querySelector("#toast"),
};

let completed = loadLocalProgress();
let supabase = null;
let currentUser = null;
let authSubscription = null;
let toastTimer = null;

function buildMonthSequence(dayCount, targetAmount, previousUnit, monthIndex) {
  const targetUnits = targetAmount / 50;
  const average = targetUnits / dayCount;
  const minUnit = Math.max(1, Math.floor(average) - 2);
  const maxUnit = Math.ceil(average) + 2;
  const wave = [-1.6, 0.7, -0.5, 1.5, 0.2, -1.1, 1.9, -0.1, 1.0, -1.9];
  const memo = new Set();

  function search(position, remaining, previous, output) {
    if (position === dayCount) return remaining === 0 ? [...output] : null;
    const daysLeft = dayCount - position - 1;
    const cacheKey = `${position}|${remaining}|${previous}`;
    if (memo.has(cacheKey)) return null;
    const desired = average + wave[(position + monthIndex * 3) % wave.length];
    const candidates = Array.from({ length: maxUnit - minUnit + 1 }, (_, index) => minUnit + index)
      .sort((a, b) => Math.abs(a - desired) - Math.abs(b - desired) || a - b);

    for (const unit of candidates) {
      if (unit === previous) continue;
      const next = remaining - unit;
      if (next < daysLeft * minUnit || next > daysLeft * maxUnit) continue;
      output.push(unit);
      const result = search(position + 1, next, unit, output);
      if (result) return result;
      output.pop();
    }
    memo.add(cacheKey);
    return null;
  }

  const result = search(0, targetUnits, previousUnit, []);
  if (!result) throw new Error(`تعذر إنشاء مبالغ الشهر ${monthIndex + 1}`);
  return result.map((unit) => unit * 50);
}

function buildSchedule() {
  const amounts = [];
  const monthIndexes = [];
  let previousUnit = null;
  monthDays.forEach((days, monthIndex) => {
    const values = buildMonthSequence(days, monthTargets[monthIndex], previousUnit, monthIndex);
    values.forEach((amount) => {
      amounts.push(amount);
      monthIndexes.push(monthIndex);
    });
    previousUnit = values.at(-1) / 50;
  });

  let cumulative = 0;
  const schedule = amounts.map((amount, index) => {
    cumulative += amount;
    const date = new Date(START_DATE.getTime() + index * 86400000);
    return {
      dayNo: index + 1,
      amount,
      cumulative,
      date,
      weekday: weekdayNames[date.getUTCDay()],
      monthIndex: monthIndexes[index],
      stage: stages[monthIndexes[index]],
    };
  });

  const sum = schedule.reduce((total, day) => total + day.amount, 0);
  const hasRepeat = schedule.some((day, index) => index > 0 && day.amount === schedule[index - 1].amount);
  if (schedule.length !== 365 || sum !== TOTAL_TARGET || hasRepeat) throw new Error("بيانات التحدي غير صحيحة");
  return schedule;
}

const schedule = buildSchedule();

function formatMoney(value) {
  return `${new Intl.NumberFormat("ar-EG").format(value)} جنيه`;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function loadLocalProgress() {
  try {
    const values = JSON.parse(localStorage.getItem(LOCAL_PROGRESS_KEY) || "[]");
    return new Set(values.filter((value) => Number.isInteger(value) && value >= 1 && value <= 365));
  } catch {
    return new Set();
  }
}

function saveLocalProgress() {
  localStorage.setItem(LOCAL_PROGRESS_KEY, JSON.stringify([...completed].sort((a, b) => a - b)));
}

function getSavedAmount() {
  return schedule.reduce((total, day) => total + (completed.has(day.dayNo) ? day.amount : 0), 0);
}

function renderSummary() {
  const saved = getSavedAmount();
  const percent = Math.min(100, (saved / TOTAL_TARGET) * 100);
  elements.progressRing.style.setProperty("--progress", `${percent * 3.6}deg`);
  elements.progressPercent.textContent = `${percent.toFixed(percent > 0 && percent < 10 ? 1 : 0)}%`;
  elements.savedAmount.textContent = formatMoney(saved);
  elements.remainingAmount.textContent = formatMoney(TOTAL_TARGET - saved);
  elements.completedDays.textContent = new Intl.NumberFormat("ar-EG").format(completed.size);
  const left = 365 - completed.size;
  elements.daysMessage.textContent = completed.size === 365 ? "تم إنجاز التحدي بالكامل" : `متبقي ${new Intl.NumberFormat("ar-EG").format(left)} يوم`;
}

function renderRoadmap() {
  const maxAverage = Math.max(...monthTargets.map((target, index) => target / monthDays[index]));
  elements.monthlyRoadmap.innerHTML = monthNames.map((month, index) => {
    const average = monthTargets[index] / monthDays[index];
    const height = Math.round(48 + (average / maxAverage) * 150);
    return `
      <article class="month-column" title="${formatMoney(monthTargets[index])} خلال الشهر">
        <small>${formatMoney(Math.round(average))} / يوم</small>
        <div class="month-bar" style="height:${height}px"></div>
        <strong>${month}</strong>
      </article>`;
  }).join("");
}

function renderFilters() {
  elements.monthFilter.innerHTML = `<option value="all">كل الشهور</option>${monthNames.map((name, index) => `<option value="${index}">${name}</option>`).join("")}`;
}

function getFilteredSchedule() {
  const month = elements.monthFilter.value;
  const status = elements.statusFilter.value;
  return schedule.filter((day) => {
    const monthMatches = month === "all" || day.monthIndex === Number(month);
    const done = completed.has(day.dayNo);
    const statusMatches = status === "all" || (status === "done" && done) || (status === "open" && !done);
    return monthMatches && statusMatches;
  });
}

function renderTable() {
  const visibleDays = getFilteredSchedule();
  elements.emptyState.hidden = visibleDays.length > 0;
  elements.tableBody.innerHTML = visibleDays.map((day) => {
    const done = completed.has(day.dayNo);
    return `
      <tr class="${done ? "done-row" : ""}">
        <td><div class="day-number"><span class="day-dot">${new Intl.NumberFormat("ar-EG").format(day.dayNo)}</span><span>اليوم ${new Intl.NumberFormat("ar-EG").format(day.dayNo)}</span></div></td>
        <td class="date-cell">${formatDate(day.date)}<small>${day.weekday}</small></td>
        <td><span class="stage-chip">${day.stage}</span></td>
        <td class="amount-cell"><strong>${formatMoney(day.amount)}</strong><small>مضاعفات 50</small></td>
        <td class="amount-cell"><strong>${formatMoney(day.cumulative)}</strong><small>حتى هذا اليوم</small></td>
        <td><button class="complete-button ${done ? "done" : ""}" data-day="${day.dayNo}" type="button">${done ? "تم الإنجاز" : "علّم كمكتمل"}</button></td>
      </tr>`;
  }).join("");
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = setTimeout(() => elements.toast.classList.remove("visible"), 3200);
}

function setFormMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function readConfig() {
  try {
    const config = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
    if (config?.url && config?.key) return config;
  } catch { /* local config is optional */ }
  return { url: DEFAULT_SUPABASE_URL, key: DEFAULT_SUPABASE_KEY };
}

function updateConnectionUI() {
  if (!supabase) {
    elements.connectionBanner.classList.remove("connected", "hidden");
    elements.syncStatus.textContent = "الحفظ محلي على هذا الجهاز";
    elements.authButton.textContent = "تسجيل الدخول";
    return;
  }
  elements.connectionBanner.classList.add("connected");
  elements.connectionBanner.querySelector("strong").textContent = currentUser ? "التقدم متزامن مع Supabase" : "تم ربط Supabase بنجاح";
  elements.connectionBanner.querySelector("p").textContent = currentUser ? `تم تسجيل الدخول باسم ${currentUser.email}` : "سجّل الدخول بالبريد لحفظ التقدم على كل أجهزتك.";
  elements.connectionBanner.querySelector("#bannerConnectButton").textContent = "تعديل الإعدادات";
  elements.syncStatus.textContent = currentUser ? "مزامنة Supabase مفعلة" : "Supabase متصل، سجّل الدخول للمزامنة";
  elements.authButton.textContent = currentUser ? "تسجيل الخروج" : "تسجيل الدخول";
}

async function createSupabaseClient(config) {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  return createClient(config.url, config.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
}

async function connectSupabase(config, { test = false } = {}) {
  const client = await createSupabaseClient(config);
  if (test) {
    const { error } = await client.from("challenge_progress").select("day_no").limit(1);
    if (error) throw error;
  }
  if (authSubscription) authSubscription.unsubscribe();
  supabase = client;
  const { data } = await supabase.auth.getSession();
  currentUser = data.session?.user || null;
  const listener = supabase.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    updateConnectionUI();
    if (currentUser) await syncProgressFromDatabase();
  });
  authSubscription = listener.data.subscription;
  updateConnectionUI();
  if (currentUser) await syncProgressFromDatabase();
}

async function syncProgressFromDatabase() {
  if (!supabase || !currentUser) return;
  const localDays = [...completed];
  const { data, error } = await supabase
    .from("challenge_progress")
    .select("day_no, completed")
    .eq("user_id", currentUser.id);
  if (error) {
    showToast(`تعذر تحميل التقدم: ${error.message}`);
    return;
  }
  const remoteDays = new Set((data || []).filter((row) => row.completed).map((row) => row.day_no));
  completed = new Set([...localDays, ...remoteDays]);
  saveLocalProgress();
  if (localDays.length) {
    const rows = localDays.map((dayNo) => ({
      user_id: currentUser.id,
      day_no: dayNo,
      amount: schedule[dayNo - 1].amount,
      completed: true,
      completed_at: new Date().toISOString(),
    }));
    const { error: uploadError } = await supabase.from("challenge_progress").upsert(rows, { onConflict: "user_id,day_no" });
    if (uploadError) showToast(`تم التحميل، لكن تعذر رفع بعض البيانات: ${uploadError.message}`);
  }
  renderSummary();
  renderTable();
}

async function toggleDay(dayNo) {
  const wasDone = completed.has(dayNo);
  if (wasDone) completed.delete(dayNo); else completed.add(dayNo);
  saveLocalProgress();
  renderSummary();
  renderTable();

  if (!supabase || !currentUser) {
    showToast(wasDone ? "تم إلغاء اليوم، والحفظ محلي" : "تم تسجيل اليوم محليًا");
    return;
  }

  const day = schedule[dayNo - 1];
  const { error } = await supabase.from("challenge_progress").upsert({
    user_id: currentUser.id,
    day_no: dayNo,
    amount: day.amount,
    completed: !wasDone,
    completed_at: wasDone ? null : new Date().toISOString(),
  }, { onConflict: "user_id,day_no" });

  if (error) {
    if (wasDone) completed.add(dayNo); else completed.delete(dayNo);
    saveLocalProgress();
    renderSummary();
    renderTable();
    showToast(`لم يتم الحفظ في Supabase: ${error.message}`);
  } else {
    showToast(wasDone ? "تم إلغاء اليوم ومزامنة التغيير" : "تم حفظ اليوم في Supabase");
  }
}

function openSettings() {
  const config = readConfig();
  elements.supabaseUrl.value = config?.url || DEFAULT_SUPABASE_URL;
  elements.supabaseKey.value = config?.key || DEFAULT_SUPABASE_KEY;
  setFormMessage(elements.settingsMessage, "");
  elements.settingsModal.showModal();
}

async function initialize() {
  renderFilters();
  renderRoadmap();
  renderSummary();
  renderTable();
  elements.supabaseUrl.value = DEFAULT_SUPABASE_URL;
  elements.supabaseKey.value = DEFAULT_SUPABASE_KEY;
  const config = readConfig();
  if (config) {
    try {
      await connectSupabase(config);
    } catch (error) {
      console.error(error);
      showToast("تعذر الاتصال بـ Supabase. راجع الإعدادات.");
    }
  }
  updateConnectionUI();
}

document.querySelectorAll("#settingsButton, #heroConnectButton, #bannerConnectButton").forEach((button) => {
  button.addEventListener("click", openSettings);
});

elements.monthFilter.addEventListener("change", renderTable);
elements.statusFilter.addEventListener("change", renderTable);
elements.tableBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-day]");
  if (button) toggleDay(Number(button.dataset.day));
});

elements.settingsForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const url = elements.supabaseUrl.value.trim().replace(/\/$/, "");
  const key = elements.supabaseKey.value.trim();
  if (!url || !key) {
    setFormMessage(elements.settingsMessage, "أدخل رابط المشروع ومفتاح anon public key.", true);
    return;
  }
  setFormMessage(elements.settingsMessage, "جاري اختبار الاتصال...");
  try {
    await connectSupabase({ url, key }, { test: true });
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ url, key }));
    setFormMessage(elements.settingsMessage, "تم الاتصال بنجاح.");
    setTimeout(() => elements.settingsModal.close(), 500);
    showToast("تم ربط Supabase بنجاح");
  } catch (error) {
    setFormMessage(elements.settingsMessage, `تعذر الاتصال: ${error.message}`, true);
  }
});

elements.disconnectButton.addEventListener("click", async () => {
  if (supabase) await supabase.auth.signOut();
  localStorage.removeItem(CONFIG_KEY);
  supabase = null;
  currentUser = null;
  if (authSubscription) authSubscription.unsubscribe();
  authSubscription = null;
  elements.supabaseKey.value = "";
  updateConnectionUI();
  elements.settingsModal.close();
  showToast("تمت إزالة إعدادات Supabase من هذا الجهاز");
});

elements.authButton.addEventListener("click", async () => {
  if (!supabase) {
    openSettings();
    return;
  }
  if (currentUser) {
    await supabase.auth.signOut();
    currentUser = null;
    updateConnectionUI();
    showToast("تم تسجيل الخروج");
  } else {
    setFormMessage(elements.authMessage, "");
    elements.authModal.showModal();
  }
});

elements.authForm.addEventListener("submit", async (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  if (!supabase) return;
  const email = elements.emailInput.value.trim();
  setFormMessage(elements.authMessage, "جاري إرسال رابط الدخول...");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
  });
  if (error) {
    setFormMessage(elements.authMessage, error.message, true);
  } else {
    setFormMessage(elements.authMessage, "تم إرسال الرابط. راجع بريدك الإلكتروني.");
  }
});

initialize();
