// Dashboard Application

let currentDate = new Date().toISOString().slice(0, 10);
let dashboardData = null;

// ============ INITIALIZATION ============

let lastWorkflowCompletion = null;

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  loadDates();
  loadData(currentDate);
  initModal();
  startWorkflowPolling();
  initVerificationSection();

  document.getElementById('refreshBtn').addEventListener('click', () => loadData(currentDate));
  document.getElementById('dateSelector').addEventListener('change', (e) => {
    if (e.target.value) {
      currentDate = e.target.value;
      loadData(currentDate);
    }
  });

  // Monthly check handlers are set up inside updateMonthlyCheck()

  // Filter handlers for Daily Output
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      filterTickerCards(e.target.dataset.filter);
    });
  });


  // Content validation handler - now just refreshes from D1
  document.getElementById('runContentValidation')?.addEventListener('click', () => {
    loadData(currentDate); // Refresh to get latest verification from D1
  });
});

// ============ TABS ============

function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  const contents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      contents.forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      document.getElementById(tab.dataset.tab).classList.add('active');
    });
  });
}

// ============ MODAL ============

function initModal() {
  const modal = document.getElementById('reportModal');
  const closeBtn = modal.querySelector('.modal-close');

  closeBtn.addEventListener('click', () => modal.classList.remove('show'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('show');
  });
}

function showReportModal(title, content) {
  const modal = document.getElementById('reportModal');
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').textContent = content;
  modal.classList.add('show');
}

// ============ DATA LOADING ============

async function loadDates() {
  try {
    const res = await fetch('/api/dates');
    const data = await res.json();

    const selector = document.getElementById('dateSelector');
    selector.innerHTML = '<option value="">Select Date</option>';

    data.dates.forEach(date => {
      const option = document.createElement('option');
      option.value = date;
      option.textContent = date;
      if (date === currentDate) option.selected = true;
      selector.appendChild(option);
    });
  } catch (err) {
    console.error('Error loading dates:', err);
  }
}

async function loadData(date) {
  try {
    const res = await fetch(`/api/dashboard/${date}`);
    dashboardData = await res.json();

    // Check if D1 returned an error
    if (dashboardData.error) {
      console.error('[D1 ERROR]', dashboardData.error);
      showD1Error(dashboardData);
      return;
    }

    // Check for partial errors
    if (dashboardData.errors && dashboardData.errors.length > 0) {
      console.warn('[D1 WARNINGS]', dashboardData.errors);
      showD1Warnings(dashboardData.errors);
    }

    updateOverview();
    updateValidation();
    updateDailyOutput();
    updateMacroTab();
    updatePortfolioTab();
    updateMonthlyCheck();
    updateVerificationFromD1(); // Load AI verification results from D1

    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
    document.getElementById('logFile').textContent = dashboardData.validation?.logFile || `D1:${date}`;

    // Show data source indicator
    const sourceIndicator = document.getElementById('dataSource');
    if (sourceIndicator) {
      sourceIndicator.textContent = dashboardData.source || 'D1';
      sourceIndicator.className = 'source-badge d1';
    }
  } catch (err) {
    console.error('Error loading data:', err);
    showD1Error({ error: err.message, hint: 'Check if the worker API is accessible' });
  }
}

// Show D1 database error
function showD1Error(errorData) {
  const errorHtml = `
    <div class="d1-error-banner">
      <h3>Database Error</h3>
      <p><strong>Error:</strong> ${errorData.error}</p>
      ${errorData.hint ? `<p><strong>Hint:</strong> ${errorData.hint}</p>` : ''}
      ${errorData.errors ? `<p><strong>Failed endpoints:</strong> ${errorData.errors.map(e => e.endpoint).join(', ')}</p>` : ''}
      <p style="margin-top: 1rem; font-size: 0.875rem; color: var(--text-secondary);">
        Run <code>npm run pipeline</code> to populate the database with data.
      </p>
    </div>
  `;

  // Show error in main content areas
  const overviewTab = document.getElementById('overview');
  if (overviewTab) {
    overviewTab.innerHTML = errorHtml + overviewTab.innerHTML;
  }

  // Update health indicators to show error state
  const healthEl = document.getElementById('ingestionHealth');
  if (healthEl) {
    healthEl.textContent = 'ERR';
    healthEl.className = 'health-value error';
  }

  document.getElementById('processingHealth')?.setAttribute('textContent', 'ERR');
  document.getElementById('freshness')?.setAttribute('textContent', '--');
}

// Show D1 partial warnings
function showD1Warnings(errors) {
  const warningHtml = `
    <div class="d1-warning-banner">
      <strong>Partial Data:</strong> Some endpoints failed: ${errors.map(e => e.endpoint).join(', ')}
    </div>
  `;

  const header = document.querySelector('.header');
  if (header && !document.querySelector('.d1-warning-banner')) {
    header.insertAdjacentHTML('afterend', warningHtml);
  }
}

// ============ OVERVIEW TAB ============

function updateOverview() {
  const val = dashboardData.validation;
  if (!val) return;

  const summary = val.summary;
  if (summary) {
    const secRate = summary.sections['SEC Edgar'];
    const rate = secRate.total > 0 ? Math.round((secRate.passed / secRate.total) * 100) : 100;
    const healthEl = document.getElementById('ingestionHealth');
    healthEl.textContent = `${rate}%`;
    healthEl.className = 'health-value ' + (rate >= 90 ? '' : rate >= 70 ? 'warning' : 'error');

    document.getElementById('processingHealth').textContent = '100%';
    document.getElementById('freshness').textContent = dashboardData.date || '--';

    document.getElementById('secFilings').textContent = val.steps?.['SEC Edgar']?.items || 0;
    document.getElementById('macroUpdates').textContent = val.steps?.['Macro Indicators']?.items || 0;
    document.getElementById('newsArticles').textContent = val.steps?.['News']?.items || 0;
    document.getElementById('pressReleases').textContent = val.steps?.['Press Releases']?.items || 0;

    const calList = document.getElementById('calendarEvents');
    calList.innerHTML = '';
    if (summary.calendarEvents && summary.calendarEvents.length > 0) {
      summary.calendarEvents.forEach(event => {
        const li = document.createElement('li');
        li.textContent = `${event.name} - ${event.confirmed ? 'CONFIRMED' : 'NOT FOUND'}`;
        calList.appendChild(li);
      });
    } else {
      calList.innerHTML = '<li>No calendar events today</li>';
    }

    const actionList = document.getElementById('actionRequired');
    actionList.innerHTML = '';
    if (summary.actionRequired && summary.actionRequired.length > 0) {
      summary.actionRequired.slice(0, 5).forEach(action => {
        const li = document.createElement('li');
        li.textContent = action;
        actionList.appendChild(li);
      });
      if (summary.actionRequired.length > 5) {
        const li = document.createElement('li');
        li.className = 'ok';
        li.textContent = `... and ${summary.actionRequired.length - 5} more`;
        actionList.appendChild(li);
      }
    } else {
      const li = document.createElement('li');
      li.className = 'ok';
      li.textContent = 'All systems operational';
      actionList.appendChild(li);
    }
  }
}

// ============ VALIDATION TAB ============

async function updatePipelineHealth() {
  try {
    const res = await fetch('/api/pipeline-health');
    if (!res.ok) return;
    const data = await res.json();

    const summary = data.summary || {};
    const wf = data.workflow || {};
    const summaryEl = document.getElementById('pipelineSummary');
    if (summaryEl) {
      const parts = [];
      if (summary.done > 0) parts.push(`${summary.done} done`);
      if (summary.running > 0) parts.push(`${summary.running} running`);
      if (summary.pending > 0) parts.push(`${summary.pending} pending`);
      if (summary.failed > 0) parts.push(`${summary.failed} failed`);
      const wfStatus = wf.status ? ` · workflow: ${wf.status}` : '';
      summaryEl.textContent = parts.join(' · ') + wfStatus;
    }

    const wavesEl = document.getElementById('pipelineWaves');
    if (!wavesEl) return;
    wavesEl.innerHTML = '';

    const waves = data.waves || {};
    const waveNums = Object.keys(waves).sort((a, b) => Number(a) - Number(b));

    if (waveNums.length === 0) {
      wavesEl.innerHTML = '<span class="no-data">No pipeline runs in last 2 hours</span>';
      return;
    }

    for (const wNum of waveNums) {
      const jobs = waves[wNum];
      const waveDiv = document.createElement('div');
      waveDiv.className = 'pipeline-wave';
      waveDiv.innerHTML = `
        <span class="wave-label">Wave ${wNum}</span>
        <div class="wave-jobs">
          ${jobs.map(j => {
            const icon = j.status === 'done' ? '✓'
                       : j.status === 'running' ? '●'
                       : j.status === 'failed' ? '✗'
                       : '○';
            return `<span class="wave-job wave-${j.status}" title="${j.last_update || ''}">${icon} ${j.worker}</span>`;
          }).join('')}
        </div>
      `;
      wavesEl.appendChild(waveDiv);
    }
  } catch (err) {
    console.error('Pipeline health fetch failed:', err);
  }
}

// ============ PIPELINE RUN LOG (maintenance panel) ============

let pipelineLogsState = {
  data: null,
  filter: "all",
  timer: null,
};

function formatHMS(iso) {
  if (!iso) return "--";
  try { return new Date(iso).toLocaleTimeString("en-US", { hour12: false }); }
  catch { return "--"; }
}

function durationMs(a, b) {
  if (!a || !b) return null;
  return new Date(b).getTime() - new Date(a).getTime();
}

function fmtDuration(ms) {
  if (ms == null) return "";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function renderPipelineStageGrid(data) {
  const grid = document.getElementById("pipelineStageGrid");
  if (!grid) return;

  const stages = data.stages || [];
  const steps = data.steps || {};
  const runStart = data.startTime;

  // Group stages by wave
  const byWave = {};
  for (const s of stages) {
    (byWave[s.wave] ||= []).push(s);
  }

  const waveNums = Object.keys(byWave).sort((a, b) => Number(a) - Number(b));

  grid.innerHTML = "";
  for (const wNum of waveNums) {
    const waveStages = byWave[wNum];
    const row = document.createElement("div");
    row.className = "stage-wave-row";

    const label = document.createElement("div");
    label.className = "stage-wave-label";
    label.innerHTML = `<span>Wave ${wNum}</span><span class="wave-mode">${waveStages[0].parallel ? "parallel" : "sequential"}</span>`;
    row.appendChild(label);

    const cells = document.createElement("div");
    cells.className = "stage-wave-cells";

    for (const s of waveStages) {
      const step = steps[s.name];
      const status = step?.status || "pending";
      const items = step?.items;
      const completedAt = step?.completedAt;
      const dur = completedAt && runStart ? fmtDuration(durationMs(runStart, completedAt)) : "";

      const cell = document.createElement("div");
      cell.className = `stage-cell stage-${status}`;

      const icon = {
        done: "✓",
        running: "●",
        warning: "!",
        failed: "✗",
        pending: "○",
      }[status] || "○";

      cell.innerHTML = `
        <div class="stage-cell-top">
          <span class="stage-icon">${icon}</span>
          <span class="stage-name">${s.name}</span>
        </div>
        <div class="stage-cell-bot">
          <span class="stage-status">${status}</span>
          ${items != null ? `<span class="stage-items">${items} items</span>` : ""}
          ${dur ? `<span class="stage-dur">${dur}</span>` : ""}
        </div>
      `;
      cells.appendChild(cell);
    }
    row.appendChild(cells);
    grid.appendChild(row);
  }

  if (waveNums.length === 0) {
    grid.innerHTML = '<span class="no-data">No stage data</span>';
  }
}

function renderPipelineLogFeed(data) {
  const feed = document.getElementById("pipelineLogFeed");
  const countEl = document.getElementById("pipelineLogCount");
  if (!feed) return;

  const logs = data.logs || [];
  const filter = pipelineLogsState.filter;

  const filtered = filter === "all"
    ? logs
    : logs.filter(l => l.status === filter);

  if (countEl) countEl.textContent = `${filtered.length} / ${logs.length} entries`;

  if (filtered.length === 0) {
    feed.innerHTML = '<span class="no-data">No entries for this filter</span>';
    return;
  }

  // Most recent first
  feed.innerHTML = filtered.slice().reverse().map(l => {
    const status = l.status || "info";
    const msg = (l.message || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `
      <div class="log-row log-${status}">
        <span class="log-time">${l.time || ""}</span>
        <span class="log-cat">${l.category || ""}</span>
        <span class="log-msg">${msg}</span>
      </div>
    `;
  }).join("");
}

function renderPipelineLogsHeader(data) {
  const fileEl = document.getElementById("pipelineLogsFile");
  if (!fileEl) return;
  if (!data || !data.file) {
    fileEl.textContent = data?.note || "no run recorded";
    return;
  }
  const startTxt = data.startTime ? `started ${formatHMS(data.startTime)}` : "";
  const endTxt = data.endTime ? `· ended ${formatHMS(data.endTime)}` : "· running...";
  const totalDur = data.startTime && data.endTime
    ? ` · ${fmtDuration(durationMs(data.startTime, data.endTime))}`
    : "";
  fileEl.textContent = `${data.file} · ${startTxt} ${endTxt}${totalDur}`;
}

async function updatePipelineLogs() {
  try {
    const res = await fetch("/api/pipeline-logs");
    if (!res.ok) return;
    const data = await res.json();
    pipelineLogsState.data = data;
    renderPipelineLogsHeader(data);
    renderPipelineStageGrid(data);
    renderPipelineLogFeed(data);
  } catch (err) {
    console.error("Pipeline logs fetch failed:", err);
  }
}

function startPipelineLogsPolling() {
  if (pipelineLogsState.timer) return;
  const tick = () => {
    const chk = document.getElementById("pipelineLogsAutoRefresh");
    const validationActive = document.getElementById("validation")?.classList.contains("active");
    if (chk?.checked && validationActive) updatePipelineLogs();
  };
  pipelineLogsState.timer = setInterval(tick, 5000);
}

function initPipelineLogsControls() {
  const refreshBtn = document.getElementById("pipelineLogsRefreshBtn");
  if (refreshBtn && !refreshBtn._wired) {
    refreshBtn.addEventListener("click", updatePipelineLogs);
    refreshBtn._wired = true;
  }
  document.querySelectorAll(".log-filter-btn").forEach(btn => {
    if (btn._wired) return;
    btn._wired = true;
    btn.addEventListener("click", () => {
      document.querySelectorAll(".log-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      pipelineLogsState.filter = btn.dataset.logFilter;
      if (pipelineLogsState.data) renderPipelineLogFeed(pipelineLogsState.data);
    });
  });
  startPipelineLogsPolling();
}

function updateValidation() {
  updatePipelineHealth(); // Run once when validation tab is loaded
  updatePipelineLogs();
  initPipelineLogsControls();
  const val = dashboardData.validation;
  if (!val) return;

  // SEC Table - try validations.SEC first, then construct from actionRequired
  let secData = val.validations?.SEC;

  // If no SEC data in validations, try to construct from actionRequired
  if (!secData || Object.keys(secData).length === 0) {
    secData = constructSecDataFromSummary(val);
  }

  if (secData && Object.keys(secData).length > 0) {
    const tbody = document.querySelector('#secTable tbody');
    tbody.innerHTML = '';

    const summary = val.summary?.sections['SEC Edgar'];
    document.getElementById('secSummary').textContent =
      `${summary?.passed || 0}/${summary?.total || 0} match | Issues: ${summary?.issues || 'None'}`;

    Object.entries(secData).forEach(([ticker, data]) => {
      // Deduplicate filing types for clean display
      const dedup = (str) => str && str !== '-' ? [...new Set(str.split(','))].join(',') : '-';
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="${data.calendar ? 'calendar-flag' : ''}">${data.calendar || ''}</td>
        <td>${ticker}</td>
        <td>${dedup(data.ingestor)}</td>
        <td>${dedup(data.secCheck)}</td>
        <td class="${data.match ? 'check-ok' : 'check-fail'}">${data.match ? '✓' : '✗'}</td>
        <td>${dedup(data.newFilings)}</td>
      `;
      tbody.appendChild(tr);
    });
  } else {
    // Show message if no SEC data
    const tbody = document.querySelector('#secTable tbody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#8b949e;">No SEC validation data available. Run validation to populate.</td></tr>';
    document.getElementById('secSummary').textContent = 'No data';
  }

  if (!val.validations) return;

  // Macro Table
  const macroData = val.validations.MACRO;
  if (macroData) {
    const tbody = document.querySelector('#macroTable tbody');
    tbody.innerHTML = '';

    const summary = val.summary?.sections['Macro'];
    document.getElementById('macroSummary').textContent =
      `${summary?.passed || 0}/${summary?.total || 0} passed | Issues: ${summary?.issues || 'None'}`;

    Object.entries(macroData).forEach(([name, data]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="${data.calendarFlag ? 'calendar-flag' : ''}">${data.calendarFlag ? '●' : ''}</td>
        <td>${name}</td>
        <td class="${data.checks?.url ? 'check-ok' : 'check-fail'}">${data.checks?.url ? '✓' : '✗'}</td>
        <td class="${data.checks?.format ? 'check-ok' : 'check-fail'}">${data.checks?.format ? '✓' : '✗'}</td>
        <td class="${data.checks?.data ? 'check-ok' : 'check-fail'}">${data.checks?.data ? '✓' : '✗'}</td>
        <td>${data.value || '-'}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Sentiment Table
  const sentData = val.validations.SENTIMENT;
  const sentTable = document.querySelector('#sentimentTable tbody');
  sentTable.innerHTML = '';
  if (sentData) {
    Object.entries(sentData).forEach(([name, data]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${name}</td>
        <td class="${data.checks?.url ? 'check-ok' : 'check-fail'}">${data.checks?.url ? '✓' : '✗'}</td>
        <td class="${data.checks?.format ? 'check-ok' : 'check-fail'}">${data.checks?.format ? '✓' : '✗'}</td>
        <td class="${data.checks?.data ? 'check-ok' : 'check-fail'}">${data.checks?.data ? '✓' : '✗'}</td>
        <td>${data.value || '-'}</td>
      `;
      sentTable.appendChild(tr);
    });
  }

  // Policy Table
  const policyData = val.validations.POLICY;
  const policyTable = document.querySelector('#policyTable tbody');
  policyTable.innerHTML = '';
  if (policyData) {
    Object.entries(policyData).forEach(([name, data]) => {
      const tr = document.createElement('tr');
      const latestInfo = data.snippet
        ? `<strong>${data.latest || name}</strong>${data.date ? ` <span style="color:var(--text-secondary);font-size:0.75rem">(${data.date})</span>` : ''}<br><span style="font-size:0.8rem;color:var(--text-secondary);font-style:italic">${data.snippet}</span>`
        : (data.latest || '-');
      tr.innerHTML = `
        <td>${name}</td>
        <td class="${data.checks?.url ? 'check-ok' : 'check-fail'}">${data.checks?.url ? '✓' : '✗'}</td>
        <td class="${data.checks?.format ? 'check-ok' : 'check-fail'}">${data.checks?.format ? '✓' : '✗'}</td>
        <td class="${data.checks?.text ? 'check-ok' : 'check-fail'}">${data.checks?.text ? '✓' : '✗'}</td>
        <td>${latestInfo}</td>
      `;
      policyTable.appendChild(tr);
    });
  }

  // Press Releases Table
  const pressData = val.validations?.PRESS;
  if (pressData) {
    const tbody = document.querySelector('#pressTable tbody');
    tbody.innerHTML = '';

    let passed = 0, total = 0;
    Object.entries(pressData).forEach(([ticker, data]) => {
      total++;
      if (data.checks?.url && data.checks?.format && data.checks?.text) passed++;

      const aiVal = data.checks?.ai;
      const aiClass = aiVal === null ? '' : (aiVal ? 'check-ok' : 'check-fail');
      const aiSymbol = aiVal === null ? '-' : (aiVal ? '✓' : '✗');

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${ticker}</td>
        <td class="${data.checks?.url ? 'check-ok' : 'check-fail'}">${data.checks?.url ? '✓' : '✗'}</td>
        <td class="${data.checks?.format ? 'check-ok' : 'check-fail'}">${data.checks?.format ? '✓' : '✗'}</td>
        <td class="${data.checks?.text ? 'check-ok' : 'check-fail'}">${data.checks?.text ? '✓' : '✗'}</td>
        <td class="${aiClass}">${aiSymbol}</td>
        <td>${data.latest?.substring(0, 40) || '-'}...</td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById('pressSummary').textContent = `${passed}/${total} passed`;
  }
}

// ============ DAILY INTELLIGENCE TAB (v2) ============

function updateDailyOutput() {
  const digest = dashboardData.newsDigest || {};
  const releases = digest.releases || {};
  const macroHL = digest.macro_headlines || [];
  const tickerHL = digest.ticker_headlines || {};

  // --- RELEASES TODAY ---
  const badgesContainer = document.getElementById('releaseBadges');
  badgesContainer.innerHTML = '';

  // SEC releases
  const secReleases = releases.sec || [];
  secReleases.forEach(r => {
    const badge = document.createElement('div');
    badge.className = 'release-badge release-sec';
    badge.innerHTML = `<span class="release-type">${r.type}</span><span class="release-ticker">${r.ticker}</span>`;
    badge.addEventListener('click', () => showReportModal(`${r.ticker} ${r.type}`, `Filed on ${r.date}. Check SEC Edgar for full filing.`));
    badgesContainer.appendChild(badge);
  });

  // Press releases
  const pressReleases = releases.press || [];
  pressReleases.forEach(r => {
    const badge = document.createElement('div');
    badge.className = 'release-badge release-press';
    badge.innerHTML = `<span class="release-type">PRESS</span><span class="release-ticker">${r.ticker}</span>`;
    badge.addEventListener('click', () => showReportModal(`${r.ticker} Press Release`, r.heading || 'Press release'));
    badgesContainer.appendChild(badge);
  });

  // Macro data releases
  const macroReleases = releases.macro || [];
  macroReleases.forEach(r => {
    const badge = document.createElement('div');
    badge.className = 'release-badge release-macro';
    const label = r.type?.split(' ')[0] || 'DATA';
    badge.innerHTML = `<span class="release-type">${label}</span>`;
    badge.addEventListener('click', () => showReportModal(r.type || 'Macro Data', formatSummary(r.summary)));
    badgesContainer.appendChild(badge);
  });

  if (secReleases.length + pressReleases.length + macroReleases.length === 0) {
    badgesContainer.innerHTML = '<span class="no-data">No releases today</span>';
  }

  // --- UPCOMING CATALYSTS ---
  const catalysts = document.getElementById('catalystsList');
  catalysts.innerHTML = '';

  const FOMC_DATES = ['2026-05-06', '2026-06-17', '2026-07-29', '2026-09-16', '2026-11-04', '2026-12-16'];
  const CPI_DATES = ['2026-04-14', '2026-05-13', '2026-06-10', '2026-07-15', '2026-08-12', '2026-09-10'];
  const EMPLOYMENT_DATES = ['2026-04-17', '2026-05-08', '2026-06-05', '2026-07-02', '2026-08-07', '2026-09-04'];
  const now = new Date();

  const upcomingEvents = [];
  const nextFOMC = FOMC_DATES.find(d => new Date(d) > now);
  if (nextFOMC) upcomingEvents.push({ name: 'FOMC Meeting', date: nextFOMC });
  const nextCPI = CPI_DATES.find(d => new Date(d) > now);
  if (nextCPI) upcomingEvents.push({ name: 'CPI Release', date: nextCPI });
  const nextEmployment = EMPLOYMENT_DATES.find(d => new Date(d) > now);
  if (nextEmployment) upcomingEvents.push({ name: 'Employment Report', date: nextEmployment });

  // Add earnings from calendar
  const earningsCal = dashboardData.earningsCalendar || {};
  Object.entries(earningsCal).forEach(([ticker, data]) => {
    const eDate = data?.nextEarnings;
    if (eDate && new Date(eDate) > now) {
      const days = Math.ceil((new Date(eDate) - now) / 86400000);
      if (days <= 30) upcomingEvents.push({ name: `${ticker} Earnings`, date: eDate });
    }
  });

  upcomingEvents.sort((a, b) => new Date(a.date) - new Date(b.date));

  upcomingEvents.slice(0, 8).forEach(evt => {
    const days = Math.ceil((new Date(evt.date) - now) / 86400000);
    const row = document.createElement('div');
    row.className = 'catalyst-row';
    const urgency = days <= 3 ? 'urgent' : days <= 7 ? 'soon' : '';
    row.innerHTML = `<span class="catalyst-name">${evt.name}</span><span class="catalyst-dots"></span><span class="catalyst-days ${urgency}">${days}d</span>`;
    catalysts.appendChild(row);
  });

  if (upcomingEvents.length === 0) {
    catalysts.innerHTML = '<span class="no-data">No upcoming catalysts</span>';
  }

  // --- MACRO HEADLINES ---
  const macroList = document.getElementById('macroHeadlinesList');
  macroList.innerHTML = '';
  document.getElementById('macroHeadlineCount').textContent = macroHL.length;

  macroHL.forEach(h => {
    const item = document.createElement('details');
    item.className = 'headline-row';
    const sentClass = h.sentiment === 'bullish' ? 'dot-green' : h.sentiment === 'bearish' ? 'dot-red' : 'dot-gray';
    item.innerHTML = `
      <summary>
        <span class="headline-category">${h.category || 'macro'}</span>
        <span class="headline-title">${h.title}</span>
        <span class="sentiment-dot ${sentClass}"></span>
      </summary>
      <div class="headline-detail">
        <p>${h.summary || h.impact || 'No summary available'}</p>
        ${h.source ? `<span class="headline-source">${h.source}</span>` : ''}
      </div>
    `;
    macroList.appendChild(item);
  });

  if (macroHL.length === 0) {
    macroList.innerHTML = '<span class="no-data">No macro headlines. Run the news funnel pipeline to populate.</span>';
  }

  // --- TICKER HEADLINES ---
  const tickerList = document.getElementById('tickerHeadlinesList');
  tickerList.innerHTML = '';

  const allTickerItems = [];
  Object.entries(tickerHL).forEach(([ticker, items]) => {
    items.forEach(h => allTickerItems.push({ ...h, _ticker: ticker }));
  });
  allTickerItems.sort((a, b) => (a.rank || 99) - (b.rank || 99));

  allTickerItems.forEach(h => {
    const item = document.createElement('details');
    item.className = 'headline-row';
    item.dataset.type = 'news';
    const sentClass = h.sentiment === 'bullish' ? 'dot-green' : h.sentiment === 'bearish' ? 'dot-red' : 'dot-gray';
    const mag = h.magnitude != null ? (h.magnitude > 0 ? `+${h.magnitude.toFixed(1)}` : h.magnitude.toFixed(1)) : '';
    item.innerHTML = `
      <summary>
        <span class="headline-ticker">${h._ticker}</span>
        <span class="headline-title">${h.title}</span>
        <span class="sentiment-dot ${sentClass}"></span>
        ${mag ? `<span class="headline-mag">${mag}</span>` : ''}
      </summary>
      <div class="headline-detail">
        <p>${h.summary || h.impact || 'No summary available'}</p>
        ${h.source ? `<span class="headline-source">${h.source}</span>` : ''}
      </div>
    `;
    tickerList.appendChild(item);
  });

  // Also add SEC filings and press as headlines
  secReleases.forEach(r => {
    const item = document.createElement('details');
    item.className = 'headline-row';
    item.dataset.type = 'sec';
    item.innerHTML = `
      <summary>
        <span class="headline-ticker">${r.ticker}</span>
        <span class="headline-title">${r.type} filed</span>
        <span class="type-badge badge-10k">${r.type}</span>
      </summary>
      <div class="headline-detail"><p>SEC filing ${r.type} filed on ${r.date}.</p></div>
    `;
    tickerList.appendChild(item);
  });

  pressReleases.forEach(r => {
    const item = document.createElement('details');
    item.className = 'headline-row';
    item.dataset.type = 'press';
    item.innerHTML = `
      <summary>
        <span class="headline-ticker">${r.ticker}</span>
        <span class="headline-title">${r.heading || 'Press release'}</span>
        <span class="type-badge badge-press">PRESS</span>
      </summary>
      <div class="headline-detail"><p>${r.heading || 'Press release'} (${r.date})</p></div>
    `;
    tickerList.appendChild(item);
  });

  if (allTickerItems.length + secReleases.length + pressReleases.length === 0) {
    tickerList.innerHTML = '<span class="no-data">No ticker headlines. Run the news funnel pipeline to populate.</span>';
  }

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.onclick = (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const filter = e.target.dataset.filter;
      document.querySelectorAll('#tickerHeadlinesList .headline-row').forEach(row => {
        row.style.display = (filter === 'all' || row.dataset.type === filter) ? '' : 'none';
      });
    };
  });
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '...' : str;
}

// ============ MACRO TAB (v3 — window-scoped regime + today) ============

const REGIME_LABELS = {
  bullish: 'BULLISH', cautious_bullish: 'CAUTIOUS BULLISH',
  neutral: 'NEUTRAL', cautious_bearish: 'CAUTIOUS BEARISH', bearish: 'BEARISH',
};

function setBullets(el, items, emptyMsg) {
  el.innerHTML = '';
  if (!items?.length) {
    el.innerHTML = `<li class="no-data">${emptyMsg}</li>`;
    return;
  }
  for (const raw of items) {
    const li = document.createElement('li');
    if (raw && typeof raw === 'object') {
      li.textContent = raw.text || '';
      const bias = raw.bias || 'neutral';
      li.className = `bullet-${bias}`;
    } else {
      li.textContent = String(raw || '');
      li.className = 'bullet-neutral';
    }
    el.appendChild(li);
  }
}

function renderSpyChart(svg, bars, windowStart, windowEnd) {
  svg.innerHTML = '';
  if (!bars || bars.length === 0) {
    svg.innerHTML = '<text x="200" y="100" text-anchor="middle" fill="#888" font-size="11">No SPY history</text>';
    return;
  }
  const inWindow = bars.filter(b => (!windowStart || b.date >= windowStart) && (!windowEnd || b.date <= windowEnd));
  const series = inWindow.length >= 2 ? inWindow : bars;
  const closes = series.map(b => Number(b.close)).filter(v => Number.isFinite(v));
  if (closes.length < 2) {
    svg.innerHTML = '<text x="200" y="100" text-anchor="middle" fill="#888" font-size="11">Not enough bars in window</text>';
    return;
  }
  const W = 400, H = 200, pad = 24;
  const min = Math.min(...closes), max = Math.max(...closes);
  const span = max - min || 1;
  const xStep = (W - 2 * pad) / (closes.length - 1);
  const points = closes.map((v, i) => {
    const x = pad + i * xStep;
    const y = pad + (1 - (v - min) / span) * (H - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const first = closes[0], last = closes[closes.length - 1];
  const up = last >= first;
  const stroke = up ? '#2fbf71' : '#e14b4b';
  const fill = up ? 'rgba(47,191,113,0.12)' : 'rgba(225,75,75,0.12)';
  // Area path
  const areaPath = `M${pad},${H - pad} L${points.replace(/ /g, ' L')} L${(pad + (closes.length - 1) * xStep).toFixed(1)},${H - pad} Z`;
  svg.innerHTML = `
    <path d="${areaPath}" fill="${fill}" stroke="none"></path>
    <polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="1.8"></polyline>
    <text x="${pad}" y="${pad - 6}" fill="#aaa" font-size="10">${series[0].date}  ${first.toFixed(2)}</text>
    <text x="${W - pad}" y="${pad - 6}" text-anchor="end" fill="#aaa" font-size="10">${series[series.length - 1].date}  ${last.toFixed(2)}</text>
  `;
  return { first, last, pct: ((last - first) / first) * 100 };
}

const ACTION_LABELS = {
  add_risk: 'ADD RISK',
  trim_risk: 'TRIM RISK',
  hold: 'HOLD',
  rotate: 'ROTATE',
  hedge: 'HEDGE',
};

function renderRecommendation(reco, catalysts, scenarios) {
  const actionEl = document.getElementById('recoAction');
  const confEl = document.getElementById('recoConfidence');
  const headlineEl = document.getElementById('recoHeadline');
  const bulletsEl = document.getElementById('recoBullets');
  const catsEl = document.getElementById('recoCatalysts');

  if (reco) {
    actionEl.textContent = ACTION_LABELS[reco.action] || (reco.action || '--').toUpperCase();
    actionEl.className = `reco-action action-${reco.action || 'hold'}`;
    confEl.textContent = `confidence: ${reco.confidence || '--'}`;
    confEl.className = `reco-confidence conf-${reco.confidence || 'low'}`;
    headlineEl.textContent = reco.headline || '';
    setBullets(bulletsEl, reco.bullets, 'No rationale.');
  } else {
    actionEl.textContent = '--';
    actionEl.className = 'reco-action';
    confEl.textContent = '';
    headlineEl.textContent = '';
    setBullets(bulletsEl, null, 'Run macro-intelligence-builder.');
  }

  // Catalysts (unbiased event list)
  catsEl.innerHTML = '';
  if (!catalysts?.length) {
    catsEl.innerHTML = '<li class="no-data">No upcoming catalysts.</li>';
  } else {
    for (const c of catalysts) {
      const li = document.createElement('li');
      li.className = `cat-${c.type || 'release'}`;
      li.innerHTML = `<span class="cat-date">${c.date || ''}</span><span class="cat-type">${(c.type || '').toUpperCase()}</span><span class="cat-event">${c.event || ''}</span>`;
      catsEl.appendChild(li);
    }
  }

  renderScenariosChart(scenarios);
}

function renderScenariosChart(sc) {
  const svg = document.getElementById('scenariosChart');
  const legend = document.getElementById('scenariosLegend');
  if (!svg) return;
  svg.innerHTML = '';
  legend.innerHTML = '';
  if (!sc || !sc.bull || !sc.base || !sc.bear) {
    svg.innerHTML = '<text x="260" y="140" text-anchor="middle" fill="#888" font-size="12">No scenarios</text>';
    return;
  }

  const W = 520, H = 280;
  const padL = 56, padR = 120, padT = 24, padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const now = Number(sc.current_spy) || 0;
  const bull = { p: Number(sc.bull.probability) || 0, t: Number(sc.bull.target_spy) || now, thesis: sc.bull.thesis };
  const base = { p: Number(sc.base.probability) || 0, t: Number(sc.base.target_spy) || now, thesis: sc.base.thesis };
  const bear = { p: Number(sc.bear.probability) || 0, t: Number(sc.bear.target_spy) || now, thesis: sc.bear.thesis };

  const yVals = [now, bull.t, base.t, bear.t];
  const yMinRaw = Math.min(...yVals);
  const yMaxRaw = Math.max(...yVals);
  const pad = Math.max((yMaxRaw - yMinRaw) * 0.2, 5);
  const yMin = yMinRaw - pad;
  const yMax = yMaxRaw + pad;
  const ySpan = yMax - yMin || 1;

  const xStart = padL;
  const xEnd = padL + plotW;
  const yOf = v => padT + (1 - (v - yMin) / ySpan) * plotH;
  const yNow = yOf(now);

  // Horizontal gridlines (5 ticks)
  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const v = yMin + (ySpan * i) / 4;
    const y = yOf(v);
    grid += `<line x1="${xStart}" y1="${y}" x2="${xEnd}" y2="${y}" stroke="#2a2f3a" stroke-width="1"/>`;
    grid += `<text x="${xStart - 8}" y="${y + 3}" text-anchor="end" fill="#888" font-size="10">${v.toFixed(0)}</text>`;
  }
  // Baseline (current SPY) — dashed
  grid += `<line x1="${xStart}" y1="${yNow}" x2="${xEnd}" y2="${yNow}" stroke="#6c7280" stroke-width="1" stroke-dasharray="4,3"/>`;
  grid += `<text x="${xStart - 8}" y="${yNow + 3}" text-anchor="end" fill="#c8c8c8" font-size="10">${now.toFixed(0)}</text>`;

  // Axis labels
  grid += `<text x="${xStart}" y="${H - 12}" fill="#888" font-size="10">today</text>`;
  grid += `<text x="${xEnd}" y="${H - 12}" text-anchor="end" fill="#888" font-size="10">+${sc.horizon_weeks || 4}w</text>`;

  // Envelope (cone) between bull and bear
  const envelope = `M${xStart},${yNow} L${xEnd},${yOf(bull.t)} L${xEnd},${yOf(bear.t)} Z`;
  grid += `<path d="${envelope}" fill="url(#scenarioEnv)" stroke="none" opacity="0.55"/>`;

  const colors = { bull: '#2fbf71', base: '#e8c14b', bear: '#e14b4b' };

  function line(scenario, color, y2, prob, label) {
    const thick = 1.5 + prob * 4; // thicker line for higher probability
    const ret = ((scenario.t - now) / (now || 1)) * 100;
    const retStr = `${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%`;
    return `
      <line x1="${xStart}" y1="${yNow}" x2="${xEnd}" y2="${y2}" stroke="${color}" stroke-width="${thick}" stroke-linecap="round"/>
      <circle cx="${xEnd}" cy="${y2}" r="4" fill="${color}"/>
      <text x="${xEnd + 10}" y="${y2 - 4}" fill="${color}" font-size="11" font-weight="700">${label}  ${scenario.t.toFixed(0)}</text>
      <text x="${xEnd + 10}" y="${y2 + 10}" fill="#aaa" font-size="10">${(prob * 100).toFixed(0)}%  ${retStr}</text>
    `;
  }

  svg.innerHTML = `
    <defs>
      <linearGradient id="scenarioEnv" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#2a2f3a" stop-opacity="0"/>
        <stop offset="100%" stop-color="#e8c14b" stop-opacity="0.22"/>
      </linearGradient>
    </defs>
    ${grid}
    ${line(bull, colors.bull, yOf(bull.t), bull.p, 'BULL')}
    ${line(base, colors.base, yOf(base.t), base.p, 'BASE')}
    ${line(bear, colors.bear, yOf(bear.t), bear.p, 'BEAR')}
  `;

  // Legend with thesis lines
  legend.innerHTML = `
    <div class="legend-row legend-bull"><span class="legend-dot"></span><strong>BULL ${(bull.p * 100).toFixed(0)}%</strong> — ${escapeHtml(bull.thesis || '')}</div>
    <div class="legend-row legend-base"><span class="legend-dot"></span><strong>BASE ${(base.p * 100).toFixed(0)}%</strong> — ${escapeHtml(base.thesis || '')}</div>
    <div class="legend-row legend-bear"><span class="legend-dot"></span><strong>BEAR ${(bear.p * 100).toFixed(0)}%</strong> — ${escapeHtml(bear.thesis || '')}</div>
  `;
}

function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

async function fetchSpyHistory(days = 70) {
  try {
    const res = await fetch(`/api/ticker-history/SPY?days=${days}`);
    if (!res.ok) return [];
    const rows = await res.json();
    if (!Array.isArray(rows)) return [];
    // Dedupe by date (legacy writers used both 12-char and 64-char primary keys)
    const byDate = new Map();
    for (const r of rows) byDate.set(r.date, r);
    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

async function updateMacroTab() {
  const dailyMacro = dashboardData.dailyMacro || {};
  let blob = null;
  try {
    if (dailyMacro.summary && dailyMacro.summary.startsWith('{')) {
      blob = JSON.parse(dailyMacro.summary);
    }
  } catch {}

  const trend = blob?.trend || null;
  const today = blob?.today || null;

  // --- REGIME + WINDOW ---
  const regimeEl = document.getElementById('macroRegime');
  if (trend?.regime) {
    regimeEl.textContent = REGIME_LABELS[trend.regime] || trend.regime.toUpperCase();
    regimeEl.className = `regime-badge regime-${trend.regime}`;
  } else {
    regimeEl.textContent = 'NO DATA';
    regimeEl.className = 'regime-badge';
  }

  const windowEl = document.getElementById('macroWindow');
  windowEl.textContent = trend?.window_start && trend?.window_end
    ? `Window: ${trend.window_start} → ${trend.window_end}`
    : '';

  document.getElementById('macroWindowRationale').textContent = trend?.window_rationale || '';

  // --- PROBABILITIES ---
  const dir = trend?.sp500_direction || { p_up: 0, p_flat: 0, p_down: 0 };
  document.getElementById('probUp').style.width = `${(dir.p_up || 0) * 100}%`;
  document.getElementById('probUpPct').textContent = `${Math.round((dir.p_up || 0) * 100)}%`;
  document.getElementById('probFlat').style.width = `${(dir.p_flat || 0) * 100}%`;
  document.getElementById('probFlatPct').textContent = `${Math.round((dir.p_flat || 0) * 100)}%`;
  document.getElementById('probDown').style.width = `${(dir.p_down || 0) * 100}%`;
  document.getElementById('probDownPct').textContent = `${Math.round((dir.p_down || 0) * 100)}%`;

  // --- SPY CHART ---
  const svg = document.getElementById('macroSpyChart');
  const meta = document.getElementById('macroSpyMeta');
  const bars = await fetchSpyHistory(70);
  const stats = renderSpyChart(svg, bars, trend?.window_start, trend?.window_end);
  if (stats) {
    const sign = stats.pct >= 0 ? '+' : '';
    meta.textContent = `Window return: ${sign}${stats.pct.toFixed(2)}%`;
    meta.className = `spy-chart-meta ${stats.pct >= 0 ? 'up' : 'down'}`;
  } else {
    meta.textContent = '';
  }

  // --- TREND BULLETS ---
  setBullets(document.getElementById('macroDrivers'), trend?.drivers, 'Run macro-intelligence-builder.');
  setBullets(document.getElementById('macroNarrative'), trend?.narrative, 'No narrative.');

  // --- RECOMMENDATION + CATALYSTS + SCENARIOS ---
  renderRecommendation(blob?.recommendation, blob?.catalysts, blob?.scenarios);

  // --- TODAY BLOCK ---
  const todayMoveEl = document.getElementById('macroTodayMove');
  const tensionEl = document.getElementById('macroTension');
  if (today) {
    const pct = Number(today.spy_move_pct) || 0;
    const sign = pct >= 0 ? '+' : '';
    todayMoveEl.textContent = `SPY ${sign}${pct.toFixed(2)}%`;
    todayMoveEl.className = `today-move ${pct > 0.25 ? 'up' : pct < -0.25 ? 'down' : 'flat'}`;
    if (today.regime_tension && today.regime_tension !== 'none') {
      tensionEl.textContent = `⚠ Regime tension: ${today.regime_tension.toUpperCase()}${today.tension_note ? ' — ' + today.tension_note : ''}`;
      tensionEl.className = `tension-flag tension-${today.regime_tension}`;
    } else {
      tensionEl.textContent = '';
      tensionEl.className = 'tension-flag';
    }
    setBullets(document.getElementById('macroTodayDrivers'), today.drivers, 'No today drivers.');
    setBullets(document.getElementById('macroTodayNarrative'), today.narrative, '');
  } else {
    todayMoveEl.textContent = '--';
    tensionEl.textContent = '';
    setBullets(document.getElementById('macroTodayDrivers'), null, 'No today analysis.');
    setBullets(document.getElementById('macroTodayNarrative'), null, '');
  }

  // --- FOMC COUNTDOWN ---
  const fomcData = dashboardData.calendar?.nextFOMC || getNextFOMCDate();
  const fomcDate = new Date(fomcData.date);
  const nowDate = new Date();
  const daysUntil = Math.ceil((fomcDate - nowDate) / (1000 * 60 * 60 * 24));

  document.getElementById('fomcNextDate').textContent = fomcDate.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  document.getElementById('fomcDaysLeft').textContent =
    daysUntil <= 0 ? 'TODAY!' : `${daysUntil} days away`;

  const tempPercent = Math.max(0, Math.min(100, (45 - daysUntil) / 45 * 100));
  document.getElementById('fomcTempBar').style.width = `${100 - tempPercent}%`;
}

function getNextFOMCDate() {
  const fomcDates = [
    '2026-05-06', '2026-06-17', '2026-07-29',
    '2026-09-16', '2026-11-04', '2026-12-16'
  ];
  const today = new Date();
  const next = fomcDates.find(d => new Date(d) > today) || fomcDates[0];
  return { date: next };
}

// ============ PORTFOLIO TAB (v2) ============

async function updatePortfolioTab() {
  try {
    const [sectorRes, trendsRes, sigHistRes, opsRes, rebalRes, moversRes, signalsRes] = await Promise.all([
      fetch('/api/sector-performance').catch(() => null),
      fetch('/api/ticker-trends').catch(() => null),
      fetch('/api/signal-history?days=14').catch(() => null),
      fetch('/api/operations').catch(() => null),
      fetch('/api/rebalance').catch(() => null),
      fetch('/api/movers').catch(() => null),
      fetch(`/api/portfolio-signals/${currentDate}`).catch(() => null),
    ]);
    const sectorPerf = sectorRes?.ok ? await sectorRes.json() : null;
    const trends = trendsRes?.ok ? await trendsRes.json() : { long: [], short: [] };
    const sigHist = sigHistRes?.ok ? await sigHistRes.json() : [];
    const ops = opsRes?.ok ? await opsRes.json() : [];
    const rebal = rebalRes?.ok ? await rebalRes.json() : {};
    const movers = moversRes?.ok ? await moversRes.json() : [];
    const signals = signalsRes?.ok ? await signalsRes.json() : null;

    renderSectorBarV2(sectorPerf);
    renderMovers(movers);
    renderOperations(ops, sigHist, trends);
    renderRebalance(rebal);
    const earningsRes = await fetch('/api/earnings-all').catch(() => null);
    const earnings = earningsRes?.ok ? await earningsRes.json() : [];
    renderTickersGridV2(trends, sigHist, sectorPerf, signals, earnings);
    updateOverviewPerformance(signals, sectorPerf);
  } catch (err) {
    console.error('Portfolio tab error:', err);
  }
}

function renderSectorBarV2(sectorPerf) {
  const bar = document.getElementById('sectorBar');
  if (!sectorPerf?.sectors) {
    bar.innerHTML = '<span class="no-data">No sector price data yet</span>';
    return;
  }
  const sectors = Object.entries(sectorPerf.sectors);
  const all = sectors.map(([n, d]) => ({ name: n, ret: d.return_pct || 0 }));
  if (sectorPerf.spy_return != null) all.push({ name: 'SPY', ret: sectorPerf.spy_return });
  const maxAbs = Math.max(...all.map(a => Math.abs(a.ret)), 0.5);
  const maxBarH = 82; // px

  bar.innerHTML = all.map(s => {
    const cls = s.ret > 0 ? 'sector-up' : s.ret < 0 ? 'sector-down' : 'sector-flat';
    const spyCls = s.name === 'SPY' ? ' sector-spy' : '';
    const h = Math.max(4, (Math.abs(s.ret) / maxAbs) * maxBarH);
    const col = s.ret >= 0 ? '#2fbf71' : '#e14b4b';
    return `<div class="sector-cell ${cls}${spyCls}">
      <span class="sector-name">${s.name}</span>
      <div class="sector-vbar-wrap"><div class="sector-vbar" style="height:${h}px;background:${col}"></div></div>
      <span class="sector-val">${s.ret > 0 ? '+' : ''}${s.ret.toFixed(2)}%</span>
    </div>`;
  }).join('');
}

function renderMovers(movers) {
  const svg = document.getElementById('moversChart');
  const expl = document.getElementById('moversExplanations');
  if (!Array.isArray(movers) || movers.length === 0) {
    svg.innerHTML = '<text x="160" y="160" text-anchor="middle" fill="#888" font-size="12">No movers data</text>';
    expl.innerHTML = '<span class="no-data">No movers data</span>';
    return;
  }
  // Sort by absolute magnitude (biggest = outermost ring)
  const sorted = [...movers].sort((a, b) => Math.abs(b.move_pct || 0) - Math.abs(a.move_pct || 0));
  const maxAbs = Math.max(...sorted.map(m => Math.abs(m.move_pct || 0)), 0.5);
  const n = sorted.length;

  // Apple Fitness ring style: concentric rings with gap at top-left for labels
  const strokeW = 14;
  const ringGap = 4;
  const rOuter = 138;
  // Center shifted right to leave label space in the gap (left side, 9-12 o'clock)
  const cx = 240, cy = 170;

  let rings = '';
  for (let i = 0; i < n; i++) {
    const m = sorted[i];
    const pct = m.move_pct || 0;
    const col = pct >= 0 ? '#2fbf71' : '#e14b4b';
    const dimCol = pct >= 0 ? 'rgba(47,191,113,0.15)' : 'rgba(225,75,75,0.15)';

    const r = rOuter - i * (strokeW + ringGap);
    if (r < 20) break;
    const circumference = 2 * Math.PI * r;
    const maxFill = 0.75; // 270°
    const trackLen = maxFill * circumference;
    const fill = Math.min(Math.abs(pct) / maxAbs, 1) * maxFill;
    const dashLen = fill * circumference;

    // Gap at ~1:30 (top-right area). 45° clockwise from 12 o'clock.
    // Arc starts at ~9 o'clock (270°) going CW 270° ending at ~6 o'clock.
    // offset = (1 - 270/360) * C = 0.25 * C
    const offset = circumference * 0.25;

    // Background track
    rings += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${dimCol}" stroke-width="${strokeW}"
      stroke-dasharray="${trackLen} ${circumference - trackLen}" stroke-dashoffset="${offset}"/>`;
    // Filled arc
    rings += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${col}" stroke-width="${strokeW}"
      stroke-linecap="round"
      stroke-dasharray="${dashLen} ${circumference - dashLen}"
      stroke-dashoffset="${offset}"
      style="filter:drop-shadow(0 0 4px ${col}40)"/>`;

    // Labels: fixed X near rings, Y spans from outermost ring top to innermost ring top
    const rFirst = rOuter; // outermost
    const rLast = rOuter - (n - 1) * (strokeW + ringGap); // innermost
    const yTop = cy - rFirst + strokeW / 2;
    const yBot = cy - rLast + strokeW / 2;
    const labelY = n > 1 ? yTop + i * ((yBot - yTop) / (n - 1)) - 6 : yTop - 6;
    const labelX = cx - rLast + 16; // just right of innermost ring edge
    rings += `<text x="${labelX - 48}" y="${labelY}" text-anchor="end" fill="#888" font-size="9">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</text>`;
    rings += `<text x="${labelX - 42}" y="${labelY}" text-anchor="start" fill="${col}" font-size="10" font-weight="700">${m.ticker}</text>`;
  }

  svg.setAttribute('viewBox', '0 0 460 340');
  svg.innerHTML = rings;

  // Text explanations
  expl.innerHTML = sorted.map(m => {
    const col = (m.move_pct || 0) >= 0 ? 'bullet-bull' : 'bullet-bear';
    return `<div class="mover-expl"><span class="mover-ticker">${m.ticker}</span><span class="mover-thesis ${col}">${escapeHtml(m.thesis || '')}</span></div>`;
  }).join('');
}

const OP_ACTION_LABELS = { buy: 'BUY', sell: 'SELL', short: 'SHORT' };
const OP_ACTION_COLORS = { buy: '#2fbf71', sell: '#e8c14b', short: '#e14b4b' };
const OP_RISK_COLORS = { low: '#2fbf71', medium: '#e8c14b', high: '#e14b4b' };

let _cachedSigHist = [];
let _cachedTrends = { long: [], short: [] };

function renderOperations(opsRows, sigHist, trends) {
  _cachedSigHist = sigHist || _cachedSigHist;
  _cachedTrends = trends || _cachedTrends;
  const el = document.getElementById('operationsList');
  const meta = document.getElementById('opsMeta');
  if (!Array.isArray(opsRows) || opsRows.length === 0) {
    el.innerHTML = '<span class="no-data">No active operations</span>';
    return;
  }
  const totalOps = opsRows.reduce((n, r) => { try { return n + JSON.parse(r.operations).length; } catch { return n; } }, 0);
  meta.textContent = `${totalOps} operations across ${opsRows.length} sectors`;

  el.innerHTML = opsRows.map(row => {
    let ops;
    try { ops = JSON.parse(row.operations); } catch { ops = []; }
    const age = Math.max(0, (Date.now() - new Date(row.created_at).getTime()) / 86400000);
    const fade = Math.max(0.3, 1 - age / 14).toFixed(2);

    return `<div class="ops-sector-block" style="opacity:${fade}">
      <div class="ops-sector-head">
        <span class="ops-sector-name">${row.sector}</span>
        <span class="ops-sector-age">${row.created_at?.slice(0, 10) || ''}</span>
      </div>
      ${ops.map(o => {
        const ct = o.counter_ticker ? ` / ${OP_ACTION_LABELS[o.action_counter] || o.action_counter} ${o.counter_ticker}` : '';
        let bullets = [];
        try { bullets = Array.isArray(o.bullets) ? o.bullets : []; } catch {}
        const shortMap = {};
        const longMap = {};
        for (const r of (_cachedTrends.short || [])) shortMap[r.ticker] = r;
        for (const r of (_cachedTrends.long || [])) longMap[r.ticker] = r;
        const lt = longMap[o.ticker];
        const st = shortMap[o.ticker];
        const ltScore = lt ? Number(lt.score) : 0;
        const stScore = st ? Number(st.score) : 0;
        // Risk as a direct 0→1 scale: low=0.2, medium=0.5, high=0.8
        const riskScore = o.risk === 'low' ? 0.2 : o.risk === 'medium' ? 0.5 : 0.8;
        const bars14 = render14Bars(_cachedSigHist, o.ticker, row.created_at?.slice(0, 10));

        return `<details class="op-card">
          <summary>
            <span class="op-action" style="color:${OP_ACTION_COLORS[o.action] || '#ccc'}">${OP_ACTION_LABELS[o.action] || o.action} ${o.ticker}${ct}</span>
            <span class="op-bars-inline">${bars14}</span>
          </summary>
          <div class="op-detail op-detail-grid">
            <div class="op-detail-left">
              <p class="op-thesis">${escapeHtml(o.thesis || '')}</p>
              <ul class="macro-bullets">${bullets.map(b => `<li class="bullet-${(b.bias || 'neutral')}">${escapeHtml(b.text || '')}</li>`).join('')}</ul>
            </div>
            <div class="op-detail-right">
              ${renderScoreBar('Long-term', ltScore)}
              ${renderScoreBar('Short-term', stScore)}
              ${renderScoreBar('Risk', riskScore, riskToColor)}
            </div>
          </div>
        </details>`;
      }).join('')}
    </div>`;
  }).join('');
}

function renderRebalance(rebal) {
  const svg = document.getElementById('rebalanceChart');
  const ratEl = document.getElementById('rebalanceRationale');
  const sumEl = document.getElementById('rebalanceSummary');
  if (!rebal?.target_weights) {
    svg.innerHTML = '<text x="400" y="110" text-anchor="middle" fill="#888" font-size="12">No rebalance data</text>';
    ratEl.innerHTML = '';
    sumEl.textContent = '';
    return;
  }
  let current, target, deltas, rationale;
  try { current = JSON.parse(rebal.current_weights); } catch { current = {}; }
  try { target = JSON.parse(rebal.target_weights); } catch { target = {}; }
  try { deltas = JSON.parse(rebal.deltas); } catch { deltas = {}; }
  try { rationale = JSON.parse(rebal.rationale); } catch { rationale = []; }

  let rawBlob = {};
  try { rawBlob = JSON.parse(rebal.raw_blob); } catch {}
  sumEl.textContent = rawBlob.summary || '';
  setBullets(ratEl, rationale, 'No rationale.');

  // Vertical bars: all tickers, current (grey, behind) + target (colored, in front)
  const tickers = Object.keys(target).sort();
  const n = tickers.length;
  if (n === 0) { svg.innerHTML = ''; return; }

  const W = Math.max(n * 32, 700);
  const H = 220;
  const padT = 24, padB = 50, padL = 10;
  const barAreaW = W - padL * 2;
  const groupW = barAreaW / n;
  const barW = Math.min(groupW * 0.7, 22);
  const maxVal = Math.max(...Object.values(target).map(Number), ...Object.values(current).map(Number), 6);
  const barH = H - padT - padB;

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);

  let bars = '';
  for (let i = 0; i < n; i++) {
    const t = tickers[i];
    const cur = Number(current[t]) || 0;
    const tgt = Number(target[t]) || 0;
    const delta = Number(deltas[t]) || 0;
    const cx = padL + i * groupW + groupW / 2;
    const x = cx - barW / 2;

    const curH = (cur / maxVal) * barH;
    const tgtH = (tgt / maxVal) * barH;

    const col = Math.abs(delta) < 0.2 ? '#666' : delta > 0 ? '#2fbf71' : '#e14b4b';

    if (tgt >= cur) {
      // Buy case: target (colored) is taller, show it behind; current (grey) in front
      bars += `<rect x="${x}" y="${H - padB - tgtH}" width="${barW}" height="${tgtH}" rx="2" fill="${col}" opacity="0.85"/>`;
      bars += `<rect x="${x}" y="${H - padB - curH}" width="${barW}" height="${curH}" rx="2" fill="#3a3f4a" opacity="0.8"/>`;
    } else {
      // Sell case: current (grey) is taller, show it behind; target (colored) in front
      bars += `<rect x="${x}" y="${H - padB - curH}" width="${barW}" height="${curH}" rx="2" fill="#3a3f4a" opacity="0.7"/>`;
      bars += `<rect x="${x}" y="${H - padB - tgtH}" width="${barW}" height="${tgtH}" rx="2" fill="${col}" opacity="0.85"/>`;
    }

    // Delta label on top (only if significant)
    if (Math.abs(delta) >= 0.2) {
      bars += `<text x="${cx}" y="${H - padB - Math.max(curH, tgtH) - 4}" text-anchor="middle" fill="${col}" font-size="8" font-weight="700">${delta > 0 ? '+' : ''}${delta.toFixed(1)}</text>`;
    }

    // Ticker label at bottom
    bars += `<text x="${cx}" y="${H - padB + 14}" text-anchor="middle" fill="#aaa" font-size="8" font-weight="600">${t}</text>`;
    bars += `<text x="${cx}" y="${H - padB + 24}" text-anchor="middle" fill="#666" font-size="7">${tgt.toFixed(1)}%</text>`;
  }

  // Legend
  bars += `<rect x="${W - 140}" y="6" width="10" height="10" rx="2" fill="#3a3f4a" opacity="0.7"/>`;
  bars += `<text x="${W - 126}" y="14" fill="#888" font-size="9">Current</text>`;
  bars += `<rect x="${W - 76}" y="6" width="10" height="10" rx="2" fill="#666" opacity="0.85"/>`;
  bars += `<text x="${W - 62}" y="14" fill="#888" font-size="9">Target</text>`;

  svg.innerHTML = bars;
}

// Score → color gradient: -1.0 (deep red) → 0 (grey) → +1.0 (deep green)
// Simple 3-color: below -0.25 = red, -0.25 to +0.25 = yellow, above +0.25 = green
function scoreToColor(v) {
  const s = Math.max(-1, Math.min(1, v || 0));
  if (s > 0.25) return '#2fbf71';
  if (s < -0.25) return '#ef4444';
  return '#facc15';
}

function render14Bars(sigHist, ticker, startDate) {
  const rows = (sigHist || []).filter(r => r.ticker === ticker).sort((a, b) => a.date.localeCompare(b.date));
  const bars = [];
  for (let i = 0; i < 14; i++) {
    const row = rows[i];
    if (!row) { bars.push('<span class="bar14 bar14-empty"></span>'); continue; }
    // Before operation existed → dim
    if (startDate && row.date < startDate) { bars.push('<span class="bar14 bar14-empty"></span>'); continue; }
    const sent = Number(row.sentiment_score) || 0;
    const mag = Number(row.magnitude) || 0;
    const color = row.earnings_flag ? '#a855f7' : scoreToColor(sent);
    const height = row.trend_updated ? '22px' : `${12 + Math.round(mag * 10)}px`;
    const title = `${row.date}: sent=${sent.toFixed(2)} mag=${mag.toFixed(2)}${row.earnings_flag ? ' EARNINGS' : ''}${row.trend_updated ? ' TREND' : ''}`;
    bars.push(`<span class="bar14" style="background:${color};height:${height}" title="${title}"></span>`);
  }
  return `<div class="bars14">${bars.join('')}</div>`;
}

function renderScoreBar(label, score, colorFn) {
  const col = colorFn ? colorFn(score) : scoreToColor(score);
  const fillPct = Math.max(5, Math.abs(score) * 100);
  return `<div class="score-hbar">
    <span class="score-hbar-label">${label}</span>
    <div class="score-hbar-track"><div class="score-hbar-fill" style="width:${fillPct}%;background:${col}"></div></div>
    <span class="score-hbar-val" style="color:${col}">${score >= 0 ? '+' : ''}${score.toFixed(2)}</span>
  </div>`;
}

// Risk: 0→0.35 green, 0.35→0.65 yellow, above 0.65 red
// Input is direct 0→1 scale (0.2=low, 0.5=medium, 0.8=high)
function riskToColor(v) {
  if (v <= 0.35) return '#2fbf71';
  if (v <= 0.65) return '#facc15';
  return '#ef4444';
}

function renderTickersGridV2(trends, sigHist, sectorPerf, signals, earnings) {
  const grid = document.getElementById('tickersGrid');
  const longMap = {};
  const shortMap = {};
  for (const r of (trends.long || [])) longMap[r.ticker] = r;
  for (const r of (trends.short || [])) shortMap[r.ticker] = r;

  // Group earnings by ticker
  const earningsMap = {};
  for (const e of (earnings || [])) {
    if (!earningsMap[e.ticker]) earningsMap[e.ticker] = [];
    earningsMap[e.ticker].push(e);
  }

  const tickers = [...new Set([...Object.keys(longMap), ...Object.keys(shortMap)])].sort();
  if (tickers.length === 0) {
    grid.innerHTML = '<span class="no-data">No trend data yet.</span>';
    return;
  }

  grid.innerHTML = `<div class="tickers-header">
    <span class="th-ticker">Ticker</span><span class="th-lt">LT</span><span class="th-st">ST</span><span class="th-bars">14-Day</span><span class="th-thesis">Thesis</span>
  </div>` + tickers.map(t => {
    const lt = longMap[t];
    const st = shortMap[t];
    const ltBadge = lt ? `<span class="regime-mini regime-${lt.regime}">${Number(lt.score) > 0 ? '+' : ''}${Number(lt.score).toFixed(2)}</span>` : '<span class="regime-mini">--</span>';
    const stBadge = st ? `<span class="regime-mini regime-${st.regime}">${Number(st.score) > 0 ? '+' : ''}${Number(st.score).toFixed(2)}</span>` : '<span class="regime-mini">--</span>';
    const bars = render14Bars(sigHist, t);
    const thesis = st?.thesis || lt?.thesis || '';

    // Unfoldable detail
    const tickerEarnings = (earningsMap[t] || []).slice(-4);
    const earningsChart = renderEarningsChart(tickerEarnings, t);
    const stChart = renderSTChart(sigHist, t);
    const ltDrivers = lt?.drivers ? parseBullets(lt.drivers) : [];
    const ltNarrative = lt?.narrative ? parseBullets(lt.narrative) : [];
    const stDrivers = st?.drivers ? parseBullets(st.drivers) : [];

    return `<details class="ticker-row-detail">
      <summary class="ticker-row">
        <span class="tr-ticker">${t}</span>${ltBadge}${stBadge}${bars}<span class="tr-thesis">${escapeHtml(thesis).slice(0, 100)}</span>
      </summary>
      <div class="ticker-expanded">
        <div class="ticker-exp-charts">
          <div class="ticker-exp-section">
            <h4>Long-Term — Earnings</h4>
            <div class="ticker-exp-row">
              <div class="ticker-chart-col">${earningsChart}</div>
              <div class="ticker-text-col">
                ${ltDrivers.length ? `<ul class="macro-bullets">${ltDrivers.map(b => `<li class="bullet-${b.bias || 'neutral'}">${escapeHtml(b.text)}</li>`).join('')}</ul>` : '<span class="no-data">No LT drivers</span>'}
              </div>
            </div>
          </div>
          <div class="ticker-exp-section">
            <h4>Short-Term — Price + Sentiment</h4>
            <div class="ticker-exp-row">
              <div class="ticker-chart-col">${stChart}</div>
              <div class="ticker-text-col">
                ${stDrivers.length ? `<ul class="macro-bullets">${stDrivers.map(b => `<li class="bullet-${b.bias || 'neutral'}">${escapeHtml(b.text)}</li>`).join('')}</ul>` : '<span class="no-data">No ST drivers</span>'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </details>`;
  }).join('');
}

function parseBullets(raw) {
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

function renderEarningsChart(earnings, ticker) {
  if (!earnings || earnings.length === 0) {
    return `<svg viewBox="0 0 260 140" class="ticker-svg"><text x="130" y="70" text-anchor="middle" fill="#888" font-size="11">Earnings data loading...</text></svg>`;
  }
  const W = 260, H = 140, padB = 28, padT = 16, padL = 8;
  const n = earnings.length;
  const barGroupW = (W - padL * 2) / n;
  const barW = barGroupW * 0.3;
  const gap = barGroupW * 0.08;

  const allVals = earnings.flatMap(e => [e.estimate, e.actual].filter(v => v != null));
  const yMax = Math.max(...allVals, 0.01) * 1.15;
  const yMin = Math.min(...allVals, 0) < 0 ? Math.min(...allVals) * 1.15 : 0;
  const yRange = yMax - yMin || 1;
  const yOf = v => padT + (1 - (v - yMin) / yRange) * (H - padT - padB);
  const zeroY = yOf(0);

  let svg = '';
  // Zero line
  svg += `<line x1="0" y1="${zeroY}" x2="${W}" y2="${zeroY}" stroke="#444" stroke-width="1"/>`;

  for (let i = 0; i < n; i++) {
    const e = earnings[i];
    const x = padL + i * barGroupW + barGroupW * 0.15;
    const est = Number(e.estimate);
    const act = Number(e.actual);
    const beat = e.surprise_pct != null ? (e.surprise_pct > 2 ? 'BEAT' : e.surprise_pct < -2 ? 'MISS' : 'MEET') : '';
    const beatCol = beat === 'BEAT' ? '#2fbf71' : beat === 'MISS' ? '#e14b4b' : '#e8c14b';

    // Estimate bar (dimmer)
    if (Number.isFinite(est)) {
      const h = Math.abs(yOf(est) - zeroY);
      const y = est >= 0 ? yOf(est) : zeroY;
      svg += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="2" fill="#555" opacity="0.5"/>`;
    }
    // Actual bar
    if (Number.isFinite(act)) {
      const h = Math.abs(yOf(act) - zeroY);
      const y = act >= 0 ? yOf(act) : zeroY;
      svg += `<rect x="${x + barW + gap}" y="${y}" width="${barW}" height="${h}" rx="2" fill="${beatCol}" opacity="0.85"/>`;
    }
    // Beat/miss label
    if (beat) {
      svg += `<text x="${x + barW}" y="${padT - 3}" text-anchor="middle" fill="${beatCol}" font-size="8" font-weight="700">${beat}</text>`;
    }
    // Period label
    const periodLabel = (e.period || '').slice(-5); // e.g. "Q3 25"
    svg += `<text x="${x + barW}" y="${H - 6}" text-anchor="middle" fill="#888" font-size="9">${periodLabel}</text>`;
  }

  // Legend
  svg += `<rect x="${W - 80}" y="${H - 18}" width="8" height="8" rx="1" fill="#555" opacity="0.5"/>`;
  svg += `<text x="${W - 68}" y="${H - 11}" fill="#888" font-size="8">Est</text>`;
  svg += `<rect x="${W - 44}" y="${H - 18}" width="8" height="8" rx="1" fill="#e8c14b" opacity="0.85"/>`;
  svg += `<text x="${W - 32}" y="${H - 11}" fill="#888" font-size="8">Actual</text>`;

  return `<svg viewBox="0 0 ${W} ${H}" class="ticker-svg">${svg}</svg>`;
}

function renderSTChart(sigHist, ticker) {
  const rows = (sigHist || []).filter(r => r.ticker === ticker).sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length === 0) {
    return `<svg viewBox="0 0 260 120" class="ticker-svg"><text x="130" y="60" text-anchor="middle" fill="#888" font-size="11">Accumulating signal history...</text></svg>`;
  }
  // If only 1 point, show it as a single bar
  if (rows.length === 1) {
    const r = rows[0];
    const sent = Number(r.sentiment_score) || 0;
    const col = scoreToColor(sent);
    return `<svg viewBox="0 0 260 120" class="ticker-svg">
      <line x1="0" y1="60" x2="260" y2="60" stroke="#444" stroke-width="1" stroke-dasharray="3,3"/>
      <circle cx="130" cy="${60 - sent * 40}" r="6" fill="${col}" stroke="#fff" stroke-width="1"/>
      <text x="130" y="100" text-anchor="middle" fill="#888" font-size="9">${r.date} — sent: ${sent.toFixed(2)}</text>
    </svg>`;
  }

  const W = 260, H = 120, padL = 8, padR = 8, padT = 12, padB = 20;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = rows.length;
  const xStep = plotW / Math.max(n - 1, 1);

  // Sentiment line
  const sents = rows.map(r => Number(r.sentiment_score) || 0);
  const sMin = Math.min(...sents, -0.5);
  const sMax = Math.max(...sents, 0.5);
  const sRange = sMax - sMin || 1;
  const yOf = v => padT + (1 - (v - sMin) / sRange) * plotH;

  let svg = '';
  // Zero line
  const zeroY = yOf(0);
  svg += `<line x1="${padL}" y1="${zeroY}" x2="${W - padR}" y2="${zeroY}" stroke="#444" stroke-width="1" stroke-dasharray="3,3"/>`;

  // Sentiment area + line
  const points = rows.map((r, i) => `${(padL + i * xStep).toFixed(1)},${yOf(sents[i]).toFixed(1)}`);
  const areaPath = `M${padL},${zeroY} L${points.join(' L')} L${(padL + (n - 1) * xStep).toFixed(1)},${zeroY} Z`;
  svg += `<path d="${areaPath}" fill="url(#sentGrad${ticker})" opacity="0.3"/>`;
  svg += `<polyline points="${points.join(' ')}" fill="none" stroke="#7ea6ff" stroke-width="1.5"/>`;

  // Dots for trend-updated days
  rows.forEach((r, i) => {
    if (r.trend_updated) {
      const x = padL + i * xStep;
      const y = yOf(sents[i]);
      const col = sents[i] >= 0 ? '#2fbf71' : '#e14b4b';
      svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${col}" stroke="#fff" stroke-width="1"/>`;
    }
    if (r.earnings_flag) {
      const x = padL + i * xStep;
      svg += `<circle cx="${x.toFixed(1)}" cy="${padT - 4}" r="3" fill="#a855f7"/>`;
    }
  });

  // Date labels
  svg += `<text x="${padL}" y="${H - 4}" fill="#888" font-size="8">${rows[0].date.slice(5)}</text>`;
  svg += `<text x="${W - padR}" y="${H - 4}" text-anchor="end" fill="#888" font-size="8">${rows[n - 1].date.slice(5)}</text>`;

  // Gradient def
  const gradId = `sentGrad${ticker}`;
  svg = `<defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#7ea6ff" stop-opacity="0.4"/>
    <stop offset="100%" stop-color="#7ea6ff" stop-opacity="0"/>
  </linearGradient></defs>` + svg;

  return `<svg viewBox="0 0 ${W} ${H}" class="ticker-svg">${svg}</svg>`;
}

function updateOverviewPerformance(signals, sectorPerf) {
  const perfDate = document.getElementById('perfDate');
  if (perfDate) perfDate.textContent = signals?.date || currentDate;
  const gainersEl = document.getElementById('topGainers');
  const losersEl = document.getElementById('topLosers');
  if (gainersEl && losersEl && signals?.tickers) {
    const withPrice = signals.tickers.filter(t => t.price?.return_pct != null);
    const gainers = [...withPrice].sort((a, b) => b.price.return_pct - a.price.return_pct).slice(0, 5);
    const losers = [...withPrice].sort((a, b) => a.price.return_pct - b.price.return_pct).slice(0, 5);
    gainersEl.innerHTML = gainers.length
      ? gainers.map(t => `<div class="perf-row"><span>${t.ticker}</span><span class="perf-pos">+${t.price.return_pct.toFixed(2)}%</span></div>`).join('') : '<span class="no-data">No price data</span>';
    losersEl.innerHTML = losers.length
      ? losers.map(t => `<div class="perf-row"><span>${t.ticker}</span><span class="perf-neg">${t.price.return_pct.toFixed(2)}%</span></div>`).join('') : '<span class="no-data">No price data</span>';
  }
  const spyEl = document.getElementById('perfSpy');
  if (spyEl && sectorPerf?.spy_return != null) {
    spyEl.textContent = `${sectorPerf.spy_return >= 0 ? '+' : ''}${sectorPerf.spy_return.toFixed(2)}%`;
    spyEl.className = `perf-spy ${sectorPerf.spy_return >= 0 ? 'perf-pos' : 'perf-neg'}`;
  }
}

// ============ MONTHLY CHECK TAB ============

const PRESS_URLS = {
  AAPL: "https://www.apple.com/newsroom/",
  MSFT: "https://news.microsoft.com/source/tag/press-releases/",
  GOOGL: "https://abc.xyz/investor/news/",
  AMZN: "https://press.aboutamazon.com/press-release-archive",
  NVDA: "https://nvidianews.nvidia.com/",
  META: "https://investor.atmeta.com/investor-news/default.aspx",
  TSLA: "https://ir.tesla.com/press",
  "BRK.B": "https://www.berkshirehathaway.com/news/2025news.html",
  JPM: "https://www.jpmorganchase.com/newsroom/press-releases",
  GS: "https://www.goldmansachs.com/pressroom",
  BAC: "https://newsroom.bankofamerica.com/press-releases",
  XOM: "https://corporate.exxonmobil.com/news/news-releases",
  CVX: "https://chevroncorp.gcs-web.com/news-releases",
  UNH: "https://www.unitedhealthgroup.com/newsroom/press-releases.html",
  LLY: "https://www.lilly.com/news/press-releases",
  JNJ: "https://www.jnj.com/media-center/press-releases",
  PG: "https://us.pg.com/newsroom/",
  KO: "https://investors.coca-colacompany.com/news-events/press-releases",
  HD: "https://ir.homedepot.com/news-releases/2025",
  CAT: "https://www.caterpillar.com/en/news/corporate-press-releases.html",
  BA: "https://investors.boeing.com/investors/overview/default.aspx",
  INTC: "https://newsroom.intel.com/news",
  AMD: "https://ir.amd.com/news-events/press-releases",
  NFLX: "https://ir.netflix.net/investor-news-and-events/financial-releases/default.aspx",
  MS: "https://www.morganstanley.com/about-us-newsroom"
};

// Source URLs where macro values can be verified (Ctrl+F the exact number)
const MACRO_SOURCE_URLS = {
  "CPI": "https://data.bls.gov/timeseries/CUUR0000SA0",
  "PPI": "https://data.bls.gov/timeseries/WPSFD4",
  "Employment": "https://data.bls.gov/timeseries/CES0000000001",
  "Bank Reserves": "https://fred.stlouisfed.org/series/WRESBAL",
  "Consumer Sentiment": "https://www.sca.isr.umich.edu/files/tbcics.csv",
  "Inflation Expectations": "https://www.sca.isr.umich.edu/files/tbcpx1px5.csv",
  "Interest Rates": "https://fred.stlouisfed.org/series/DFF",
  "Gamma Regime (VIX)": "https://finance.yahoo.com/quote/%5EVIX/"
};

const PORTFOLIO_TICKERS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'BRK.B',
  'JPM', 'GS', 'BAC', 'XOM', 'CVX', 'UNH', 'LLY', 'JNJ',
  'PG', 'KO', 'HD', 'CAT', 'BA', 'INTC', 'AMD', 'NFLX', 'MS'
];

function updateMonthlyCheck() {
  // Macro table
  const macroTable = document.querySelector('#monthlyMacroTable tbody');
  macroTable.innerHTML = '';
  if (dashboardData.macro?.Macro) {
    // Keep only the latest entry per heading, exclude FOMC (shown in Policy section)
    const latestByHeading = {};
    dashboardData.macro.Macro.forEach(item => {
      if (item.heading === 'FOMC') return;
      if (!latestByHeading[item.heading] || item.date > latestByHeading[item.heading].date) {
        latestByHeading[item.heading] = item;
      }
    });
    Object.values(latestByHeading).forEach((item, i) => {
      const sourceUrl = MACRO_SOURCE_URLS[item.heading] || '';
      // Format key values for easy Ctrl+F verification
      const keyValues = Object.entries(item.summary || {})
        .filter(([k]) => k.startsWith('current') || k.startsWith('Target Range') || k === 'VIX' || k === 'VIX9D' || k === 'VIX3M' || k === 'Gamma Regime')
        .map(([k, v]) => `${k.replace('current ', '')}: ${v}`)
        .join(', ');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.heading}</td>
        <td style="font-size:0.85rem">${keyValues || formatSummary(item.summary).substring(0, 50)}</td>
        <td>${item.date}</td>
        <td>${sourceUrl ? `<a href="${sourceUrl}" target="_blank" class="url-link">${new URL(sourceUrl).hostname}</a>` : '-'}</td>
        <td>
          <button class="btn btn-secondary verify-btn" data-type="macro" data-idx="${i}">✓</button>
          <button class="btn btn-secondary verify-btn" data-type="macro" data-idx="${i}" data-wrong="true">✗</button>
        </td>
      `;
      macroTable.appendChild(tr);
    });
  }

  // Press Releases table — show actual article URLs (where content was scraped from)
  const pressTable = document.querySelector('#monthlyPressTable tbody');
  pressTable.innerHTML = '';
  const pressValidation = dashboardData.validation?.validations?.PRESS || {};

  Object.entries(PRESS_URLS).forEach(([ticker, feedUrl], i) => {
    const pressData = pressValidation[ticker] || {};
    const articleUrl = pressData.latestUrl || feedUrl;
    const latestTitle = pressData.latest || 'Not checked';
    const latestDate = pressData.latestDate || '-';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${ticker}</td>
      <td>${latestTitle.substring(0, 50)}${latestTitle.length > 50 ? '...' : ''}</td>
      <td>${latestDate}</td>
      <td><a href="${articleUrl}" target="_blank" class="url-link">${new URL(articleUrl).hostname}</a></td>
      <td>
        <button class="btn btn-secondary verify-btn" data-type="press" data-idx="${i}">✓</button>
        <button class="btn btn-secondary verify-btn" data-type="press" data-idx="${i}" data-wrong="true">✗</button>
      </td>
    `;
    pressTable.appendChild(tr);
  });

  // FOMC / Policy table
  const fomcTable = document.querySelector('#monthlyFomcTable tbody');
  fomcTable.innerHTML = '';

  // Latest White House item only
  if (dashboardData.whitehouse?.WhiteHouse?.length) {
    const latest = dashboardData.whitehouse.WhiteHouse.reduce((a, b) => a.date > b.date ? a : b);
    const whUrl = latest.link || 'https://www.whitehouse.gov/news/';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>White House</td>
      <td>${latest.title?.substring(0, 50) || 'Latest article'}${(latest.title?.length || 0) > 50 ? '...' : ''}</td>
      <td>${latest.date}</td>
      <td><a href="${whUrl}" target="_blank" class="url-link">${new URL(whUrl).hostname}</a></td>
      <td>
        <button class="btn btn-secondary verify-btn" data-type="wh" data-idx="0">✓</button>
        <button class="btn btn-secondary verify-btn" data-type="wh" data-idx="0" data-wrong="true">✗</button>
      </td>
    `;
    fomcTable.appendChild(tr);
  }

  // FOMC Statement — use the actual statement link from summary
  const fomcMacro = (dashboardData.macro?.Macro || []).filter(x => x.heading === 'FOMC').reduce((a, b) => (!a || b.date > a.date) ? b : a, null);
  const fomcSnippet = fomcMacro?.summary?.paragraphs?.find(p => p.length > 60 && !p.includes('media inquiries') && !p.includes('For release')) || '-';
  const fomcStmtUrl = fomcMacro?.summary?.link || 'https://www.federalreserve.gov/newsevents/pressreleases.htm';
  const fomcRow = document.createElement('tr');
  fomcRow.innerHTML = `
    <td>FOMC Statement</td>
    <td style="font-size:0.8rem;font-style:italic">${fomcSnippet.substring(0, 80)}${fomcSnippet.length > 80 ? '...' : ''}</td>
    <td>${fomcMacro?.date || '-'}</td>
    <td><a href="${fomcStmtUrl}" target="_blank" class="url-link">${new URL(fomcStmtUrl).hostname}</a></td>
    <td>
      <button class="btn btn-secondary verify-btn" data-type="wh" data-idx="1">✓</button>
      <button class="btn btn-secondary verify-btn" data-type="wh" data-idx="1" data-wrong="true">✗</button>
    </td>
  `;
  fomcTable.appendChild(fomcRow);

  // Fed Minutes — link to FOMC calendars page where minutes are listed
  const fomcCalUrl = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm';
  const minRow = document.createElement('tr');
  minRow.innerHTML = `
    <td>Fed Minutes</td>
    <td style="font-size:0.8rem;font-style:italic">${fomcMacro?.summary?.title || '-'}</td>
    <td>${fomcMacro?.date || '-'}</td>
    <td><a href="${fomcCalUrl}" target="_blank" class="url-link">${new URL(fomcCalUrl).hostname}</a></td>
    <td>
      <button class="btn btn-secondary verify-btn" data-type="wh" data-idx="2">✓</button>
      <button class="btn btn-secondary verify-btn" data-type="wh" data-idx="2" data-wrong="true">✗</button>
    </td>
  `;
  fomcTable.appendChild(minRow);

  // Add click handlers
  document.querySelectorAll('.verify-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const isWrong = e.target.dataset.wrong === 'true';
      e.target.classList.add(isWrong ? 'wrong' : 'verified');
      updateVerifyProgress();
    });
  });

  // Per-section "Open All" handlers
  document.getElementById('openMacroUrls')?.addEventListener('click', () => {
    const urls = [];
    document.querySelectorAll('#monthlyMacroTable .url-link').forEach(a => urls.push(a.href));
    openUrlsBatch(urls);
  });

  document.getElementById('openPressUrls')?.addEventListener('click', () => {
    const urls = [];
    document.querySelectorAll('#monthlyPressTable .url-link').forEach(a => urls.push(a.href));
    openUrlsBatch(urls);
  });

  document.getElementById('openPolicyUrls')?.addEventListener('click', () => {
    const urls = [];
    document.querySelectorAll('#monthlyFomcTable .url-link').forEach(a => urls.push(a.href));
    openUrlsBatch(urls);
  });
}

function updateVerifyProgress() {
  const total = document.querySelectorAll('.verify-btn:not([data-wrong])').length;
  const verified = document.querySelectorAll('.verify-btn.verified').length;
  const wrong = document.querySelectorAll('.verify-btn.wrong').length;

  document.getElementById('verifyProgress').style.width = `${((verified + wrong) / total) * 100}%`;
  document.getElementById('verifyCount').textContent = `${verified + wrong} / ${total} checked (${wrong} issues)`;
}

// Open URLs in batches via server-side open (bypasses browser popup blocking)
function openUrlsBatch(urls) {
  // Server endpoint has a limit of 10, so batch if needed
  for (let i = 0; i < urls.length; i += 10) {
    const batch = urls.slice(i, i + 10);
    fetch('/api/open-urls', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: batch })
    });
  }
}

// ============ UTILITIES ============

// Construct SEC validation data from summary.actionRequired messages
function constructSecDataFromSummary(val) {
  const secData = {};

  if (!val.summary?.actionRequired) return secData;

  // Parse actionRequired messages like:
  // "AAPL: SEC mismatch (ingested: ,,,, API: -)"
  // "JPM: SEC mismatch (ingested: ,,,,, API: 8-K)"
  const secPattern = /^(\w+(?:\.\w+)?): SEC mismatch \(ingested: ([^,]*(?:,[^,]*)*), (?:found|API): ([^)]+)\)/;

  val.summary.actionRequired.forEach(action => {
    const match = action.match(secPattern);
    if (match) {
      const ticker = match[1];
      const ingested = match[2].split(',').filter(s => s.trim()).join(',') || '-';
      const secCheck = match[3].trim() || '-';

      secData[ticker] = {
        calendar: '',
        ingestor: ingested,
        secCheck: secCheck,
        match: false,
        newFilings: secCheck !== '-' ? secCheck : '-'
      };
    }
  });

  // Also check for tickers in summary.sections['SEC Edgar'].issues
  if (val.summary?.sections?.['SEC Edgar']?.issues) {
    const issuesTickers = val.summary.sections['SEC Edgar'].issues.split(', ');
    issuesTickers.forEach(ticker => {
      if (!secData[ticker]) {
        secData[ticker] = {
          calendar: '',
          ingestor: '-',
          secCheck: '-',
          match: false,
          newFilings: '-'
        };
      }
    });
  }

  // Add passed tickers (not in issues = matched)
  const totalTickers = val.summary?.sections?.['SEC Edgar']?.total || 0;
  const passedCount = val.summary?.sections?.['SEC Edgar']?.passed || 0;

  // If we have passed tickers but no details, we can't reconstruct them
  // They matched so there's no actionRequired message for them

  return secData;
}

function formatSummary(summary) {
  if (!summary) return '';
  if (typeof summary === 'string') return summary;
  if (typeof summary === 'object') {
    return Object.entries(summary)
      .filter(([k, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`)
      .join(' | ');
  }
  return String(summary);
}

// ============ WORKFLOW POLLING (Auto-refresh) ============

const WORKER_API = "https://portfolio-ingestor.gines-rodriguez-castro.workers.dev";

function startWorkflowPolling() {
  // Poll every 30 seconds
  setInterval(checkWorkflowStatus, 30000);
  // Initial check
  checkWorkflowStatus();
}

async function checkWorkflowStatus() {
  try {
    const res = await fetch(`${WORKER_API}/query/workflow-status`);
    if (!res.ok) return;

    const data = await res.json();

    if (data.completed_at && data.completed_at !== lastWorkflowCompletion) {
      console.log('[Auto-refresh] New workflow completion detected:', data.completed_at);
      lastWorkflowCompletion = data.completed_at;

      // Auto-refresh dashboard data
      loadData(currentDate);

      // Show notification
      showRefreshNotification();
    }
  } catch (err) {
    console.log('[Polling] Error:', err.message);
  }
}

function showRefreshNotification() {
  const notification = document.createElement('div');
  notification.className = 'refresh-notification';
  notification.textContent = 'Data updated!';
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: #3fb950;
    color: #fff;
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: 600;
    z-index: 9999;
    animation: fadeInOut 3s forwards;
  `;
  document.body.appendChild(notification);
  setTimeout(() => notification.remove(), 3000);
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeInOut {
    0% { opacity: 0; transform: translateY(-10px); }
    15% { opacity: 1; transform: translateY(0); }
    85% { opacity: 1; transform: translateY(0); }
    100% { opacity: 0; transform: translateY(-10px); }
  }
`;
document.head.appendChild(style);

// ============ AI FACT VERIFICATION (Redesigned) ============

let todayUpdates = [];
let validationResults = [];

// Initialize verification section on load
function initVerificationSection() {
  // Results will be loaded automatically when dashboard data loads
  // via updateVerificationFromD1()
}

// Load verification results from D1 data (called after dashboard data loads)
function updateVerificationFromD1() {
  const verificationData = dashboardData.verification_ai;

  if (!verificationData || !verificationData.results || verificationData.results.length === 0) {
    // No verification data - show message
    const statusEl = document.getElementById('contentValStatus');
    if (statusEl) {
      statusEl.className = 'status-text';
      statusEl.textContent = 'No verification data available for this date';
    }
    const itemsGrid = document.getElementById('verificationItemsGrid');
    if (itemsGrid) {
      itemsGrid.innerHTML = `
        <div class="verification-placeholder">
          <p>AI fact verification runs automatically at the end of the daily pipeline.</p>
          <p style="color: var(--text-secondary); font-size: 0.875rem;">Run the pipeline to generate verification results.</p>
        </div>
      `;
    }
    return;
  }

  // Transform D1 results into the expected format
  // Score is already 0-100 percentage from hallucination checker
  validationResults = verificationData.results.map(r => {
    const parsed = typeof r.issues === 'string' ? JSON.parse(r.issues) : (r.issues || {});
    const problems = parsed.problems || [];
    return {
      itemName: r.summaryId || r.summary_id || 'Unknown',
      itemType: r.summaryType || r.summary_type || 'press',
      status: (r.contradicted > 0 || r.score < 80) ? 'FAIL' : 'PASS',
      verification: {
        summaryScore: {
          totalFacts: r.totalFacts || r.total_facts || 1,
          verified: r.verified || (r.score >= 80 ? 1 : 0),
          notFound: r.notFound || r.not_found || 0,
          contradicted: r.contradicted || (r.score < 80 ? 1 : 0),
          verificationRate: (r.score || 0) / 100 // Convert 0-100 to 0-1 for percentage display
        },
        analysis: parsed.analysis || r.analysis || '',
        issues: problems,
        verifiedFacts: parsed.verifiedFacts || r.verifiedFacts || [],
        verificationResults: problems.map(issue => ({
          claim: issue.claim,
          problem: issue.problem,
          status: 'CONTRADICTED',
          confidence: 0.9,
          source: issue.source || {}
        }))
      }
    };
  });

  // Update status
  const statusEl = document.getElementById('contentValStatus');
  if (statusEl) {
    const passed = validationResults.filter(r => r.status === 'PASS').length;
    const warnings = validationResults.filter(r => r.status === 'WARNING').length;
    const failed = validationResults.filter(r => r.status === 'FAIL').length;

    statusEl.className = failed > 0 ? 'status-text error' : (warnings > 0 ? 'status-text' : 'status-text success');
    statusEl.textContent = `Last run: ${verificationData.date || currentDate} | ${passed} passed, ${warnings} warnings, ${failed} failed`;
  }

  // Render the results
  renderVerificationResults();
}

function detectTodayUpdates() {
  todayUpdates = [];
  const today = currentDate;

  // Check Daily Macro (BETA_10)
  if (dashboardData.dailyMacro?.creation_date === today || dashboardData.dailyMacro?.summary) {
    todayUpdates.push({
      type: 'daily-macro',
      name: 'Daily Macro Summary',
      summary: dashboardData.dailyMacro.summary,
      sources: dashboardData.dailyMacro.structure || []
    });
  }

  // Check Macro Trend (BETA_09)
  const trendDate = dashboardData.macroTrend?.date || dashboardData.macroTrend?.created_at;
  if (trendDate === today || dashboardData.macroTrend?.summary) {
    todayUpdates.push({
      type: 'macro-trend',
      name: 'Weekly Macro Trend',
      summary: dashboardData.macroTrend.summary,
      sources: []
    });
  }

  // Check Reports (ALPHA_01) - only reports filed today
  if (dashboardData.reports) {
    Object.entries(dashboardData.reports).forEach(([ticker, reportData]) => {
      const reports = Array.isArray(reportData) ? reportData : [reportData];
      reports.forEach((report, idx) => {
        const reportDate = report.filing_date || report.date;
        if (reportDate === today || report.summary) {
          todayUpdates.push({
            type: 'report',
            name: `${ticker} ${report.form_type || '10-Q'}`,
            ticker,
            summary: report.summary,
            sources: report.clusters || []
          });
        }
      });
    });
  }

  // Check Daily News (ALPHA_05)
  if (dashboardData.dailyNews) {
    Object.entries(dashboardData.dailyNews).forEach(([ticker, data]) => {
      if (data.date === today && data.summary) {
        todayUpdates.push({
          type: 'daily-news',
          name: `${ticker} Daily News`,
          ticker,
          summary: data.summary,
          sources: data.articles || []
        });
      }
    });
  }
}

async function runContentValidation() {
  // Detect today's updates if not done
  if (todayUpdates.length === 0) {
    detectTodayUpdates();
  }

  if (todayUpdates.length === 0) {
    alert('No content to validate. Make sure data files are loaded.');
    return;
  }

  const statusEl = document.getElementById('contentValStatus');
  const itemsGrid = document.getElementById('verificationItemsGrid');

  statusEl.className = 'status-text running';
  statusEl.innerHTML = '<span class="spinner"></span>Starting verification...';

  // Show loading state in grid
  itemsGrid.innerHTML = `
    <div class="verification-placeholder">
      <p><span class="spinner"></span> Verifying ${todayUpdates.length} items...</p>
    </div>
  `;

  validationResults = [];
  let allIssues = [];

  for (let i = 0; i < todayUpdates.length; i++) {
    const item = todayUpdates[i];
    statusEl.innerHTML = `<span class="spinner"></span>Validating ${item.name} (${i + 1}/${todayUpdates.length})...`;

    try {
      const res = await fetch('/api/content-validation/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: item.summary,
          summaryId: `${item.type}-${item.ticker || 'all'}`,
          summaryType: item.type,
          sources: item.sources.map((s, idx) => ({
            id: s.id || `source-${idx}`,
            text: s.text || s.summary || s.value || JSON.stringify(s)
          })),
          useAI: true
        })
      });

      const result = await res.json();
      result.itemName = item.name;
      result.itemType = item.type;
      validationResults.push(result);

      if (result.verification?.issues) {
        result.verification.issues.forEach(issue => {
          allIssues.push({ ...issue, source: item.name, itemType: item.type });
        });
      }
    } catch (err) {
      validationResults.push({
        itemName: item.name,
        itemType: item.type,
        status: 'ERROR',
        error: err.message
      });
    }
  }

  // Render the new verification UI
  renderVerificationResults();

  // Update status
  const passed = validationResults.filter(r => r.status === 'PASS').length;
  const warnings = validationResults.filter(r => r.status === 'WARNING').length;
  const failed = validationResults.filter(r => r.status === 'FAIL' || r.status === 'ERROR').length;

  statusEl.className = failed > 0 ? 'status-text error' : (warnings > 0 ? 'status-text' : 'status-text success');
  statusEl.textContent = `Complete: ${passed} passed, ${warnings} warnings, ${failed} failed`;

  // Save results
  try {
    await fetch('/api/content-validation/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: validationResults })
    });
  } catch (e) {
    console.error('Failed to save results:', e);
  }
}

// Render the full verification results UI
function renderVerificationResults() {
  if (!validationResults || validationResults.length === 0) return;

  // Collect all issues and count verified facts
  const allIssues = [];
  let totalVerifiedFacts = 0;
  let totalIssues = 0;

  validationResults.forEach(result => {
    totalVerifiedFacts += (result.verification?.verifiedFacts || []).length;
    totalIssues += (result.verification?.issues || []).length;

    if (result.verification?.issues) {
      result.verification.issues.forEach(issue => {
        allIssues.push({ ...issue, source: result.itemName, itemType: result.itemType });
      });
    }
  });

  // Update stats bar
  const passedCount = validationResults.filter(r => r.status === 'PASS').length;
  const failedCount = validationResults.filter(r => r.status === 'FAIL').length;
  const factsLabel = totalVerifiedFacts > 0 ? `${totalVerifiedFacts} facts checked` : `${passedCount} passed`;

  document.getElementById('statTotalItems').textContent = validationResults.length;
  document.getElementById('statTotalFacts').textContent = factsLabel;
  document.getElementById('statVerified').textContent = passedCount;
  document.getElementById('statNotFound').textContent = '0';
  document.getElementById('statContradicted').textContent = failedCount;

  // Calculate overall score from individual scores
  const totalScore = validationResults.reduce((sum, r) => {
    return sum + (r.verification?.summaryScore?.verificationRate || 0) * 100;
  }, 0);
  const overallScore = validationResults.length > 0 ? Math.round(totalScore / validationResults.length) : 0;
  const overallScoreEl = document.getElementById('overallScore');
  overallScoreEl.textContent = `${overallScore}%`;
  overallScoreEl.style.color = overallScore >= 90 ? 'var(--accent-green)' : (overallScore >= 70 ? 'var(--accent-yellow)' : 'var(--accent-red)');

  // Render critical issues banner
  renderCriticalIssues(allIssues);

  // Render items grid
  renderItemsGrid();
}

// Render the critical issues banner at the top
function renderCriticalIssues(issues) {
  const banner = document.getElementById('criticalIssuesBanner');
  const list = document.getElementById('criticalIssuesList');
  const count = document.getElementById('criticalCount');

  // Filter for contradicted or significant not-found issues
  const criticalIssues = issues.filter(i => i.status === 'CONTRADICTED' || i.status === 'NOT_FOUND');

  if (criticalIssues.length === 0) {
    banner.style.display = 'none';
    return;
  }

  banner.style.display = 'block';
  count.textContent = criticalIssues.length;
  list.innerHTML = '';

  criticalIssues.forEach(issue => {
    const card = document.createElement('div');
    card.className = 'critical-issue-card';
    card.innerHTML = `
      <div class="critical-issue-source">
        <span class="type-badge badge-${issue.itemType?.split('-')[0] || 'macro'}">${issue.itemType || 'UNKNOWN'}</span>
        <span class="source-name">${issue.source || 'Unknown Source'}</span>
        <span class="issue-status-tag ${issue.status?.toLowerCase()}">${issue.status}</span>
      </div>
      <div class="critical-issue-claim">${issue.claim || 'No claim text'}</div>
      ${issue.explanation ? `<div class="critical-issue-explanation">${issue.explanation}</div>` : ''}
    `;
    list.appendChild(card);
  });
}

// Render the items grid with expandable cards
function renderItemsGrid() {
  const grid = document.getElementById('verificationItemsGrid');
  grid.innerHTML = '';

  validationResults.forEach((result, idx) => {
    const score = result.verification?.summaryScore;
    const scorePercent = score ? Math.round(score.verificationRate * 100) : 0;
    const hasIssues = (score?.notFound || 0) > 0;
    const hasCritical = (score?.contradicted || 0) > 0;

    const scoreClass = scorePercent >= 90 ? 'pass' : (scorePercent >= 70 ? 'warn' : 'fail');

    const card = document.createElement('div');
    card.className = `verification-item-card ${hasIssues ? 'has-issues' : ''} ${hasCritical ? 'has-critical' : ''}`;
    card.dataset.idx = idx;

    // For hallucination checking, show simpler display
    const statusText = result.status === 'PASS' ? 'No hallucinations detected' :
                       result.status === 'FAIL' ? 'Issues detected' : 'Error';
    const statusIcon = result.status === 'PASS' ? '✓' : result.status === 'FAIL' ? '⚠' : '✗';

    card.innerHTML = `
      <div class="item-card-header" onclick="toggleItemCard(${idx})">
        <div class="item-type-indicator type-${result.itemType || 'macro'}"></div>
        <div class="item-info">
          <div class="item-name">${result.itemName || result.summaryId || 'Unknown'}</div>
          <div class="item-meta">${result.itemType || 'summary'} • Hallucination Check</div>
        </div>
        <div class="item-score-display">
          <div class="fact-counts">
            <div class="fact-count">${statusIcon} ${statusText}</div>
          </div>
          <div class="score-circle ${scoreClass}">${result.status === 'ERROR' ? 'ERR' : scorePercent + '%'}</div>
        </div>
        <span class="expand-icon">▼</span>
      </div>
      <div class="item-card-body">
        <div class="facts-list">
          ${renderFactsList(result)}
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

// Render the facts list for an item (hallucination check results)
function renderFactsList(result) {
  const analysis = result.verification?.analysis || '';
  const issues = result.verification?.issues || [];
  const verifiedFacts = result.verification?.verifiedFacts || [];
  const score = result.verification?.summaryScore;
  const scorePercent = score ? Math.round(score.verificationRate * 100) : 0;

  let html = '';

  if (result.error) {
    return `<div class="fact-item"><span class="fact-status-icon">⚠</span><div class="fact-content"><div class="fact-claim-text">Error: ${result.error}</div></div></div>`;
  }

  // Show analysis if available
  if (analysis) {
    html += `
      <div class="fact-item">
        <span class="fact-status-icon">📝</span>
        <div class="fact-content">
          <div class="fact-claim-text">${analysis}</div>
        </div>
      </div>
    `;
  }

  // Show verified facts with evidence
  if (verifiedFacts.length > 0) {
    verifiedFacts.forEach(vf => {
      html += `
        <div class="fact-item verified">
          <span class="fact-status-icon">✓</span>
          <div class="fact-content">
            <div class="fact-claim-text">${vf.fact}</div>
            ${vf.evidence ? `<div class="fact-source-info">Source: ${vf.evidence}</div>` : ''}
          </div>
        </div>
      `;
    });
  }

  // Show any issues found
  if (issues.length > 0) {
    issues.forEach(issue => {
      html += `
        <div class="fact-item contradicted">
          <span class="fact-status-icon">⚠</span>
          <div class="fact-content">
            <div class="fact-claim-text">${issue.claim || issue.problem || 'Issue detected'}</div>
            ${issue.problem ? `<div class="fact-source-info">${issue.problem}</div>` : ''}
          </div>
        </div>
      `;
    });
  }

  // Fallback only if no verified facts AND no issues (old data without verifiedFacts)
  if (verifiedFacts.length === 0 && issues.length === 0 && !analysis) {
    const isError = result && result.verification?.summaryScore?.verificationRate === 0;
    html += `
      <div class="fact-item ${isError ? 'contradicted' : 'verified'}">
        <span class="fact-status-icon">${isError ? '⚠' : '✓'}</span>
        <div class="fact-content">
          <div class="fact-claim-text">${isError
            ? 'Verification failed (AI returned invalid response) — re-run pipeline to retry'
            : 'Summary verified — re-run pipeline to see detailed fact breakdown'}</div>
        </div>
      </div>
    `;
  }

  return html;
}

// Toggle item card expansion
function toggleItemCard(idx) {
  const cards = document.querySelectorAll('.verification-item-card');
  const card = cards[idx];
  if (card) {
    card.classList.toggle('expanded');
  }
}

// Show detailed validation in modal (kept for compatibility)
function showValidationDetail(result) {
  let content = `Summary ID: ${result.summaryId}\n`;
  content += `Status: ${result.status}\n`;
  content += `Duration: ${result.duration}ms\n\n`;

  if (result.extractedFacts?.facts) {
    content += `EXTRACTED FACTS (${result.extractedFacts.facts.length}):\n`;
    result.extractedFacts.facts.forEach((f, i) => {
      content += `  ${i + 1}. [${f.type}] ${f.claim}\n`;
    });
    content += '\n';
  }

  if (result.verification?.verificationResults) {
    content += `VERIFICATION RESULTS:\n`;
    result.verification.verificationResults.forEach((v, i) => {
      content += `  ${i + 1}. ${v.status} (${Math.round(v.confidence * 100)}%): ${v.claim}\n`;
      if (v.source?.quote) {
        content += `      Source: "${v.source.quote.substring(0, 100)}..."\n`;
      }
    });
  }

  if (result.error) {
    content += `\nERROR: ${result.error}`;
  }

  showReportModal(`Validation: ${result.itemName}`, content);
}
