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

  // Monthly check handlers
  document.getElementById('runMonthlyCheck').addEventListener('click', runMonthlyCheck);
  document.getElementById('openAllUrls').addEventListener('click', openAllUrls);

  // Filter handlers for Daily Output
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      filterTickerCards(e.target.dataset.filter);
    });
  });

  // Portfolio sort handler
  document.getElementById('portfolioSort')?.addEventListener('change', (e) => {
    updatePortfolioTab(e.target.value);
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

    updateOverview();
    updateValidation();
    updateDailyOutput();
    updateMacroTab();
    updatePortfolioTab();
    updateMonthlyCheck();
    updateVerificationFromD1(); // Load AI verification results from D1

    document.getElementById('lastUpdate').textContent = new Date().toLocaleTimeString();
    document.getElementById('logFile').textContent = dashboardData.validation?.logFile || '--';
  } catch (err) {
    console.error('Error loading data:', err);
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

function updateValidation() {
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
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="${data.calendar ? 'calendar-flag' : ''}">${data.calendar || ''}</td>
        <td>${ticker}</td>
        <td>${data.ingestor || '-'}</td>
        <td>${data.secCheck || '-'}</td>
        <td class="${data.match ? 'check-ok' : 'check-fail'}">${data.match ? '✓' : '✗'}</td>
        <td>${data.newFilings || '-'}</td>
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
  const sentTable = document.querySelector('#sentimentTable tbody');
  sentTable.innerHTML = '';
  ['Put/Call Ratios', 'AAII Sentiment', 'COT Futures'].forEach(name => {
    const data = macroData?.[name];
    if (data) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${name}</td>
        <td class="${data.checks?.url ? 'check-ok' : 'check-fail'}">${data.checks?.url ? '✓' : '✗'}</td>
        <td class="${data.checks?.format ? 'check-ok' : 'check-fail'}">${data.checks?.format ? '✓' : '✗'}</td>
        <td class="${data.checks?.data ? 'check-ok' : 'check-fail'}">${data.checks?.data ? '✓' : '✗'}</td>
        <td>${data.value || '-'}</td>
      `;
      sentTable.appendChild(tr);
    }
  });

  // Policy Table
  const policyTable = document.querySelector('#policyTable tbody');
  policyTable.innerHTML = '';
  val.logs?.filter(l => l.category === 'POLICY').forEach(log => {
    const match = log.message.match(/(\w+\s*\w*)\s+url:(.)\s+fmt:(.)\s+txt:(.)\s+ai:(.)\s+(.*)/);
    if (match) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${match[1].trim()}</td>
        <td class="${match[2] === '✓' ? 'check-ok' : 'check-fail'}">${match[2]}</td>
        <td class="${match[3] === '✓' ? 'check-ok' : 'check-fail'}">${match[3]}</td>
        <td class="${match[4] === '✓' ? 'check-ok' : 'check-fail'}">${match[4]}</td>
        <td>${match[6] || '-'}</td>
      `;
      policyTable.appendChild(tr);
    }
  });

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

// ============ DAILY OUTPUT TAB (REDESIGNED) ============

function updateDailyOutput() {
  // Daily Macro Summary (from BETA_10_Daily_macro)
  const dailyMacro = dashboardData.dailyMacro || {};
  document.getElementById('dailyMacroUpdate').textContent =
    `Last update: ${dailyMacro.creation_date || dashboardData.date || '--'}`;

  // Show which macros were published today as badges
  const badgesContainer = document.getElementById('macroPublishedToday');
  badgesContainer.innerHTML = '';

  if (dailyMacro.structure && Array.isArray(dailyMacro.structure)) {
    dailyMacro.structure.forEach(src => {
      const badge = document.createElement('span');
      badge.className = `type-badge badge-macro`;
      badge.textContent = src.type || src.name || 'MACRO';
      badge.title = src.date || '';
      badgesContainer.appendChild(badge);
    });
  } else {
    // Fallback: show recent macro updates from macro data
    const macroItems = dashboardData.macro?.Macro || [];
    macroItems.slice(0, 5).forEach(item => {
      const badge = document.createElement('span');
      badge.className = `type-badge badge-macro`;
      badge.textContent = item.heading?.split(' ')[0] || 'MACRO';
      badgesContainer.appendChild(badge);
    });
  }

  document.getElementById('dailyMacroSummary').textContent =
    dailyMacro.summary || 'No daily macro summary available. Run the daily-macro-summarizer worker to generate.';

  // Ticker Daily News (from ALPHA_05_Daily_news)
  const tickerGrid = document.getElementById('tickerNewsGrid');
  tickerGrid.innerHTML = '';

  const dailyNews = dashboardData.dailyNews || {};
  const reports = dashboardData.reports || {};
  const today = currentDate; // Use selected date for filtering

  let tickersAdded = 0;

  // If we have daily news data
  if (Object.keys(dailyNews).length > 0) {
    Object.entries(dailyNews).forEach(([ticker, data]) => {
      // Only show tickers updated today
      if (data.date === today) {
        tickerGrid.appendChild(createTickerCard(ticker, data, reports[ticker]));
        tickersAdded++;
      }
    });
  } else {
    // Fallback: create cards from news and press data - only today's updates
    const tickerUpdates = new Map(); // ticker -> { news: [], press: [] }

    // Collect news articles from today
    if (dashboardData.news) {
      Object.entries(dashboardData.news).forEach(([source, articles]) => {
        if (Array.isArray(articles)) {
          articles.forEach(article => {
            // Check if article is from today
            const articleDate = article.date || article.published_date || article.publishedAt;
            if (articleDate && articleDate.startsWith(today)) {
              if (article.tickers) {
                article.tickers.forEach(ticker => {
                  if (!tickerUpdates.has(ticker)) {
                    tickerUpdates.set(ticker, { news: [], press: [] });
                  }
                  tickerUpdates.get(ticker).news.push({ ...article, source });
                });
              }
            }
          });
        }
      });
    }

    // Collect press releases from today
    if (dashboardData.press) {
      Object.entries(dashboardData.press).forEach(([ticker, items]) => {
        if (Array.isArray(items)) {
          items.forEach(item => {
            const itemDate = item.date || item.published_date;
            if (itemDate && itemDate.startsWith(today)) {
              if (!tickerUpdates.has(ticker)) {
                tickerUpdates.set(ticker, { news: [], press: [] });
              }
              tickerUpdates.get(ticker).press.push(item);
            }
          });
        }
      });
    }

    // Create cards only for tickers with today's updates
    tickerUpdates.forEach((updates, ticker) => {
      const newsItems = updates.news;
      const pressItems = updates.press;

      // Only create card if there's something from today
      if (newsItems.length > 0 || pressItems.length > 0) {
        const fallbackData = {
          summary: `${newsItems.length} news items, ${pressItems.length} press releases`,
          todays_important: newsItems[0]?.summary || pressItems[0]?.summary || null,
          new_sec: null,
          types: {
            news: newsItems.length,
            press: pressItems.length
          }
        };

        tickerGrid.appendChild(createTickerCard(ticker, fallbackData, null));
        tickersAdded++;
      }
    });
  }

  // Show message if no tickers have updates today
  if (tickersAdded === 0) {
    tickerGrid.innerHTML = `
      <div class="no-updates-message" style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--text-secondary);">
        <p style="font-size: 1rem; margin-bottom: 0.5rem;">No ticker updates for ${today}</p>
        <p style="font-size: 0.875rem;">Run the daily pipeline to fetch new data.</p>
      </div>
    `;
  }
}

function createTickerCard(ticker, data, reportData) {
  const card = document.createElement('div');
  card.className = 'ticker-card';
  card.dataset.types = '';

  // Determine card border color and badges
  const badges = [];

  if (data.new_sec) {
    const secTypes = data.new_sec.split(',').map(s => s.trim());
    secTypes.forEach(type => {
      if (type.includes('10-K')) {
        badges.push({ class: 'badge-10k', text: '10-K' });
        card.classList.add('has-sec');
        card.dataset.types += 'sec ';
      } else if (type.includes('10-Q')) {
        badges.push({ class: 'badge-10q', text: '10-Q' });
        card.classList.add('has-sec');
        card.dataset.types += 'sec ';
      } else if (type.includes('8-K')) {
        badges.push({ class: 'badge-8k', text: '8-K' });
        card.classList.add('has-sec');
        card.dataset.types += 'sec ';
      } else if (type.includes('4') || type.includes('Form')) {
        badges.push({ class: 'badge-form4', text: 'Form 4' });
        card.dataset.types += 'sec ';
      }
    });
  }

  if (data.types?.press > 0 || data.hasPress) {
    badges.push({ class: 'badge-press', text: 'PRESS' });
    card.classList.add('has-press');
    card.dataset.types += 'press ';
  }

  if (data.types?.news > 0 || data.hasNews) {
    badges.push({ class: 'badge-news', text: 'NEWS' });
    card.dataset.types += 'news ';
  }

  // Build card HTML
  let html = `
    <div class="ticker-card-header">
      <span class="ticker-symbol">${ticker}</span>
      <div class="ticker-badges">
        ${badges.map(b => `<span class="type-badge ${b.class}">${b.text}</span>`).join('')}
      </div>
    </div>
    <div class="ticker-summary">${data.summary || 'No summary available'}</div>
  `;

  // Add important news section if present
  if (data.todays_important) {
    html += `
      <div class="ticker-important">
        <div class="ticker-important-label">Today's Important</div>
        <div class="ticker-important-text">${truncate(data.todays_important, 150)}</div>
      </div>
    `;
  }

  if (data.last_important && data.last_important !== data.todays_important) {
    html += `
      <div class="ticker-important">
        <div class="ticker-important-label">Previous (${data.last_important_date || 'recent'})</div>
        <div class="ticker-important-text">${truncate(data.last_important, 150)}</div>
      </div>
    `;
  }

  // Add report button if there's a 10-K or 10-Q report
  if (reportData && (data.new_sec?.includes('10-K') || data.new_sec?.includes('10-Q'))) {
    html += `
      <button class="report-expand-btn" data-ticker="${ticker}" data-report-id="${reportData.id}">
        View Report Summary
      </button>
    `;
  }

  card.innerHTML = html;

  // Add click handler for report button
  const reportBtn = card.querySelector('.report-expand-btn');
  if (reportBtn) {
    reportBtn.addEventListener('click', () => {
      showReportModal(
        `${ticker} - ${data.new_sec} Report Summary`,
        reportData?.summary || 'Report summary not available'
      );
    });
  }

  return card;
}

function filterTickerCards(filter) {
  const cards = document.querySelectorAll('.ticker-card');
  cards.forEach(card => {
    if (filter === 'all') {
      card.style.display = 'block';
    } else {
      card.style.display = card.dataset.types.includes(filter) ? 'block' : 'none';
    }
  });
}

function truncate(str, len) {
  if (!str) return '';
  return str.length > len ? str.substring(0, len) + '...' : str;
}

// ============ MACRO TAB ============

function updateMacroTab() {
  // FOMC Countdown
  const fomcData = dashboardData.calendar?.nextFOMC || getNextFOMCDate();
  const fomcDate = new Date(fomcData.date);
  const today = new Date();
  const daysUntil = Math.ceil((fomcDate - today) / (1000 * 60 * 60 * 24));

  document.getElementById('fomcNextDate').textContent = fomcDate.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
  document.getElementById('fomcDaysLeft').textContent =
    daysUntil <= 0 ? 'TODAY!' : `${daysUntil} days away`;

  // Temperature bar (fills from right, showing how close we are)
  // 45 days = cool, 0 days = hot
  const tempPercent = Math.max(0, Math.min(100, (45 - daysUntil) / 45 * 100));
  document.getElementById('fomcTempBar').style.width = `${100 - tempPercent}%`;

  // Macro Trend Summary (BETA_09_Trend)
  const macroTrend = dashboardData.macroTrend || {};
  document.getElementById('macroTrendUpdate').textContent =
    `Last update: ${macroTrend.date || macroTrend.created_at || '--'}`;
  document.getElementById('macroTrendSummary').textContent =
    macroTrend.summary || 'No weekly macro trend available. Run the beta-trend-builder worker to generate.';

  // Recent Macro Events
  const timeline = document.getElementById('macroEventsTimeline');
  timeline.innerHTML = '';

  const events = [];

  // Collect from macro data
  if (dashboardData.macro?.Macro) {
    dashboardData.macro.Macro.forEach(item => {
      events.push({
        date: item.date,
        title: item.heading,
        value: formatSummary(item.summary).substring(0, 80)
      });
    });
  }

  // Collect from sentiment data
  if (dashboardData.sentiment?.Sentiment) {
    dashboardData.sentiment.Sentiment.forEach(item => {
      events.push({
        date: item.date,
        title: item.heading,
        value: formatSummary(item.summary).substring(0, 80)
      });
    });
  }

  // Sort by date descending
  events.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Display
  events.slice(0, 10).forEach(event => {
    const div = document.createElement('div');
    div.className = 'event-item';
    div.innerHTML = `
      <span class="type-badge badge-macro">${event.title?.split(' ')[0] || 'DATA'}</span>
      <div class="event-content">
        <div class="event-title">${event.title}</div>
        <div class="event-value">${event.value}...</div>
      </div>
      <span class="event-date">${event.date}</span>
    `;
    timeline.appendChild(div);
  });

  if (events.length === 0) {
    timeline.innerHTML = '<div class="loading">No recent macro events</div>';
  }
}

function getNextFOMCDate() {
  // Fallback FOMC dates for 2026
  const fomcDates = [
    '2026-01-28', '2026-03-18', '2026-05-06', '2026-06-17',
    '2026-07-29', '2026-09-16', '2026-11-04', '2026-12-16'
  ];
  const today = new Date();
  const next = fomcDates.find(d => new Date(d) > today) || fomcDates[0];
  return { date: next };
}

// ============ PORTFOLIO TAB ============

function updatePortfolioTab(sortBy = 'earnings') {
  const grid = document.getElementById('portfolioGrid');
  grid.innerHTML = '';

  const trends = dashboardData.tickerTrends || {};
  const calendar = dashboardData.earningsCalendar || getDefaultEarningsCalendar();

  // Build portfolio data with earnings info
  const portfolioData = [];
  const tickers = Object.keys(trends).length > 0 ? Object.keys(trends) : PORTFOLIO_TICKERS;

  tickers.forEach(ticker => {
    const trendData = trends[ticker] || {};
    const earningsDate = calendar[ticker]?.nextEarnings || getEstimatedEarnings(ticker);
    const daysUntil = earningsDate ? Math.ceil((new Date(earningsDate) - new Date()) / (1000 * 60 * 60 * 24)) : 999;

    portfolioData.push({
      ticker,
      summary: trendData.summary || `No trend data available for ${ticker}`,
      lastUpdate: trendData.created_at || trendData.date || '--',
      earningsDate,
      earningsType: calendar[ticker]?.type || '10-Q',
      daysUntilEarnings: daysUntil
    });
  });

  // Sort
  if (sortBy === 'earnings') {
    portfolioData.sort((a, b) => a.daysUntilEarnings - b.daysUntilEarnings);
  } else if (sortBy === 'ticker') {
    portfolioData.sort((a, b) => a.ticker.localeCompare(b.ticker));
  } else if (sortBy === 'update') {
    portfolioData.sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate));
  }

  // Render cards
  portfolioData.forEach(data => {
    grid.appendChild(createPortfolioCard(data));
  });
}

function createPortfolioCard(data) {
  const card = document.createElement('div');
  card.className = 'portfolio-card';

  // Determine temperature class
  let tempClass = 'cool';
  if (data.daysUntilEarnings <= 7) tempClass = 'hot';
  else if (data.daysUntilEarnings <= 21) tempClass = 'warm';

  // Temperature marker position (0-80px range, closer = more right)
  const markerPos = Math.max(0, Math.min(80, 80 - (data.daysUntilEarnings / 60) * 80));

  card.innerHTML = `
    <div class="portfolio-card-header">
      <span class="portfolio-ticker">${data.ticker}</span>
      <div class="earnings-countdown">
        <span class="earnings-date">${data.earningsType} - ${data.earningsDate || 'TBD'}</span>
        <span class="earnings-days ${tempClass}">
          ${data.daysUntilEarnings > 900 ? 'TBD' : data.daysUntilEarnings + ' days'}
        </span>
        <div class="earnings-temp-bar">
          <div class="earnings-temp-marker" style="left: ${markerPos}px"></div>
        </div>
      </div>
    </div>
    <div class="portfolio-trend">${data.summary}</div>
    <div class="portfolio-meta">
      <span>Last updated: ${data.lastUpdate}</span>
    </div>
  `;

  return card;
}

function getEstimatedEarnings(ticker) {
  // Rough estimates for demo
  const estimates = {
    AAPL: '2026-04-30', MSFT: '2026-04-22', GOOGL: '2026-04-25', AMZN: '2026-04-28',
    NVDA: '2026-05-21', META: '2026-04-23', TSLA: '2026-04-19', 'BRK.B': '2026-05-03',
    JPM: '2026-04-11', GS: '2026-04-14', BAC: '2026-04-15', XOM: '2026-04-25',
    CVX: '2026-04-25', UNH: '2026-04-15', LLY: '2026-04-24', JNJ: '2026-04-15',
    PG: '2026-04-18', KO: '2026-04-22', HD: '2026-05-13', CAT: '2026-04-24',
    BA: '2026-04-23', INTC: '2026-04-24', AMD: '2026-04-29', NFLX: '2026-04-17',
    MS: '2026-04-16'
  };
  return estimates[ticker] || null;
}

function getDefaultEarningsCalendar() {
  const cal = {};
  PORTFOLIO_TICKERS.forEach(ticker => {
    cal[ticker] = { nextEarnings: getEstimatedEarnings(ticker), type: '10-Q' };
  });
  return cal;
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
    dashboardData.macro.Macro.forEach((item, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${item.heading}</td>
        <td>${formatSummary(item.summary).substring(0, 50)}...</td>
        <td>${item.date}</td>
        <td>
          <button class="btn btn-secondary verify-btn" data-type="macro" data-idx="${i}">✓</button>
          <button class="btn btn-secondary verify-btn" data-type="macro" data-idx="${i}" data-wrong="true">✗</button>
        </td>
      `;
      macroTable.appendChild(tr);
    });
  }

  // Press Releases table
  const pressTable = document.querySelector('#monthlyPressTable tbody');
  pressTable.innerHTML = '';
  const pressValidation = dashboardData.validation?.validations?.PRESS || {};

  Object.entries(PRESS_URLS).forEach(([ticker, url], i) => {
    const data = pressValidation[ticker] || {};
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${ticker}</td>
      <td><a href="${url}" target="_blank" class="url-link">${url.substring(0, 35)}...</a></td>
      <td>${data.latest?.substring(0, 30) || 'Not checked'}...</td>
      <td><button class="btn btn-secondary open-url-btn" data-url="${url}">Open</button></td>
      <td>
        <button class="btn btn-secondary verify-btn" data-type="press" data-idx="${i}">✓</button>
        <button class="btn btn-secondary verify-btn" data-type="press" data-idx="${i}" data-wrong="true">✗</button>
      </td>
    `;
    pressTable.appendChild(tr);
  });

  // FOMC table
  const fomcTable = document.querySelector('#monthlyFomcTable tbody');
  fomcTable.innerHTML = '';
  if (dashboardData.whitehouse?.WhiteHouse) {
    dashboardData.whitehouse.WhiteHouse.slice(0, 5).forEach((item, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>White House</td>
        <td>${item.title?.substring(0, 40)}...</td>
        <td>${item.date}</td>
        <td>
          <button class="btn btn-secondary verify-btn" data-type="wh" data-idx="${i}">✓</button>
          <button class="btn btn-secondary verify-btn" data-type="wh" data-idx="${i}" data-wrong="true">✗</button>
        </td>
      `;
      fomcTable.appendChild(tr);
    });
  }

  // Add click handlers
  document.querySelectorAll('.verify-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const isWrong = e.target.dataset.wrong === 'true';
      e.target.classList.add(isWrong ? 'wrong' : 'verified');
      updateVerifyProgress();
    });
  });

  document.querySelectorAll('.open-url-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      window.open(e.target.dataset.url, '_blank');
    });
  });

  document.getElementById('openPressUrls')?.addEventListener('click', () => {
    Object.values(PRESS_URLS).forEach(url => window.open(url, '_blank'));
  });
}

function updateVerifyProgress() {
  const total = document.querySelectorAll('.verify-btn:not([data-wrong])').length;
  const verified = document.querySelectorAll('.verify-btn.verified').length;
  const wrong = document.querySelectorAll('.verify-btn.wrong').length;

  document.getElementById('verifyProgress').style.width = `${((verified + wrong) / total) * 100}%`;
  document.getElementById('verifyCount').textContent = `${verified + wrong} / ${total} checked (${wrong} issues)`;
}

async function runMonthlyCheck() {
  document.getElementById('monthlyStatus').textContent = 'Running validation...';
  try {
    const res = await fetch('/api/run-validation', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      document.getElementById('monthlyStatus').textContent = 'Validation complete. Refresh to see results.';
      loadData(currentDate);
    } else {
      document.getElementById('monthlyStatus').textContent = 'Error: ' + data.error;
    }
  } catch (err) {
    document.getElementById('monthlyStatus').textContent = 'Error: ' + err.message;
  }
}

function openAllUrls() {
  const urls = [
    'https://www.bls.gov/cpi/',
    'https://www.bls.gov/ppi/',
    'https://www.bls.gov/news.release/empsit.nr0.htm',
    'https://fred.stlouisfed.org/series/WRESBAL',
    'https://www.federalreserve.gov/monetarypolicy.htm',
    'https://www.cboe.com/us/options/market_statistics/daily/',
    'https://www.aaii.com/sentiment-survey',
    'https://www.cftc.gov/dea/newcot/FinFutWk.txt',
    'https://www.whitehouse.gov/news/'
  ];

  fetch('/api/open-urls', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls })
  });
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
  validationResults = verificationData.results.map(r => ({
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
      analysis: r.analysis || '',
      issues: r.issues || [],
      verificationResults: (r.issues || []).map(issue => ({
        claim: issue.claim,
        problem: issue.problem,
        status: 'CONTRADICTED',
        confidence: 0.9,
        source: issue.source || {}
      }))
    }
  }));

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

  // Check Ticker Trends (ALPHA_04) - only tickers updated today
  if (dashboardData.tickerTrends) {
    Object.entries(dashboardData.tickerTrends).forEach(([ticker, data]) => {
      const updateDate = data.created_at || data.date;
      if (updateDate === today || data.summary) {
        todayUpdates.push({
          type: 'ticker-trend',
          name: `${ticker} Trend`,
          ticker,
          summary: data.summary,
          sources: []
        });
      }
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

  // Collect all issues
  const allIssues = [];
  let totalFacts = 0, verifiedFacts = 0, notFoundFacts = 0, contradictedFacts = 0;

  validationResults.forEach(result => {
    const score = result.verification?.summaryScore;
    if (score) {
      totalFacts += score.totalFacts || 0;
      verifiedFacts += score.verified || 0;
      notFoundFacts += score.notFound || 0;
      contradictedFacts += score.contradicted || 0;
    }

    if (result.verification?.issues) {
      result.verification.issues.forEach(issue => {
        allIssues.push({ ...issue, source: result.itemName, itemType: result.itemType });
      });
    }
  });

  // Update stats bar - for hallucination checking, show pass/fail counts
  const passedCount = validationResults.filter(r => r.status === 'PASS').length;
  const failedCount = validationResults.filter(r => r.status === 'FAIL').length;

  document.getElementById('statTotalItems').textContent = validationResults.length;
  document.getElementById('statTotalFacts').textContent = `${passedCount} passed`;
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
  const score = result.verification?.summaryScore;
  const scorePercent = score ? Math.round(score.verificationRate * 100) : 0;

  // Show analysis from hallucination checker
  let html = '';

  if (result.error) {
    return `<div class="fact-item"><span class="fact-status-icon">⚠</span><div class="fact-content"><div class="fact-claim-text">Error: ${result.error}</div></div></div>`;
  }

  // Show accuracy score prominently
  html += `
    <div class="fact-item verified">
      <span class="fact-status-icon">📊</span>
      <div class="fact-content">
        <div class="fact-claim-text"><strong>Accuracy Score: ${scorePercent}%</strong></div>
        <div class="fact-source-info">Summary compared against source content</div>
      </div>
    </div>
  `;

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
  } else if (scorePercent >= 80) {
    html += `
      <div class="fact-item verified">
        <span class="fact-status-icon">✓</span>
        <div class="fact-content">
          <div class="fact-claim-text">All claims in the summary are supported by the source content</div>
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
