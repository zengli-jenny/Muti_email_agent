/**
 * Smart CS — Frontend Application
 * Claude-inspired intelligent customer service UI
 */

// ── Configuration ─────────────────────────
const API_URL = () => document.getElementById('apiUrl')?.value || 'http://127.0.0.1:8001';

// ── State ─────────────────────────────────
const state = {
  history: JSON.parse(localStorage.getItem('smartcs_history') || '[]'),
  isProcessing: false,
};

// ── DOM References ────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
  sidebar: $('#sidebar'),
  sidebarToggle: $('#sidebarToggle'),
  mobileMenu: $('#mobileMenu'),
  navItems: $$('.nav-item'),
  viewTitle: $('#viewTitle'),
  modelBadge: $('#modelBadge'),
  statusDot: $('.status-dot'),
  statusText: $('.status-text'),
  // Compose
  customerEmail: $('#customerEmail'),
  brand: $('#brand'),
  subject: $('#subject'),
  body: $('#body'),
  oldEmails: $('#oldEmails'),
  autoExecute: $('#autoExecute'),
  submitBtn: $('#submitBtn'),
  clearBtn: $('#clearBtn'),
  // Output
  emptyState: $('#emptyState'),
  loadingState: $('#loadingState'),
  resultState: $('#resultState'),
  traceFeed: $('#traceFeed'),
  thinkingText: $('.thinking-text'),
  // Result
  policyBadge: $('#policyBadge'),
  langBadge: $('#langBadge'),
  reviewBadge: $('#reviewBadge'),
  replyContent: $('#replyContent'),
  humanTasks: $('#humanTasks'),
  humanTaskList: $('#humanTaskList'),
  copyBtn: $('#copyBtn'),
  thoughtTrace: $('#thoughtTrace'),
  toolResults: $('#toolResults'),
  basicInfo: $('#basicInfo'),
  knowledgeInfo: $('#knowledgeInfo'),
  // History
  historyEmpty: $('#historyEmpty'),
  historyList: $('#historyList'),
  // Settings
  apiUrl: $('#apiUrl'),
  testConnection: $('#testConnection'),
  connectionResult: $('#connectionResult'),
  // Toast
  toastContainer: $('#toastContainer'),
};

// ── Utilities ─────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  dom.toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Navigation ────────────────────────────
const viewMap = {
  compose: { view: '#composeView', title: 'New Reply' },
  history: { view: '#historyView', title: 'History' },
  settings: { view: '#settingsView', title: 'Settings' },
};

function switchView(name) {
  $$('.view').forEach(v => v.classList.remove('active'));
  dom.navItems.forEach(n => n.classList.remove('active'));
  const cfg = viewMap[name];
  if (!cfg) return;
  $(cfg.view).classList.add('active');
  dom.viewTitle.textContent = cfg.title;
  const navBtn = $(`.nav-item[data-view="${name}"]`);
  if (navBtn) navBtn.classList.add('active');
  // Close mobile sidebar
  dom.sidebar.classList.remove('mobile-open');
  const overlay = $('.sidebar-overlay');
  if (overlay) overlay.classList.remove('active');
  // Refresh history when switching to it
  if (name === 'history') renderHistory();
}

dom.navItems.forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// ── Sidebar Toggle ────────────────────────
dom.sidebarToggle.addEventListener('click', () => {
  dom.sidebar.classList.toggle('collapsed');
});

dom.mobileMenu.addEventListener('click', () => {
  dom.sidebar.classList.add('mobile-open');
  let overlay = $('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', () => {
      dom.sidebar.classList.remove('mobile-open');
      overlay.classList.remove('active');
    });
  }
  overlay.classList.add('active');
});

// ── Output State Management ───────────────
function showOutput(which) {
  dom.emptyState.hidden = which !== 'empty';
  dom.loadingState.hidden = which !== 'loading';
  dom.resultState.hidden = which !== 'result';
}

function addTrace(text, icon) {
  const item = document.createElement('div');
  item.className = 'trace-item';
  const iconSvg = icon === 'tool'
    ? '<svg class="trace-icon" viewBox="0 0 16 16" fill="none"><path d="M10 2l4 4-8 8H2v-4l8-8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>'
    : icon === 'check'
    ? '<svg class="trace-icon" viewBox="0 0 16 16" fill="none"><path d="M3 8.5l3.5 3.5 6.5-8" stroke="#059669" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    : '<svg class="trace-icon" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.3"/><path d="M8 5v3.5l2.5 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';
  item.innerHTML = iconSvg + `<span>${escapeHtml(text)}</span>`;
  dom.traceFeed.appendChild(item);
  dom.traceFeed.scrollTop = dom.traceFeed.scrollHeight;
}

// ── Submit Handler ────────────────────────
async function handleSubmit() {
  if (state.isProcessing) return;

  const brand = dom.brand.value;
  const body = dom.body.value.trim();
  if (!body) {
    toast('Please enter the email body', 'error');
    dom.body.focus();
    return;
  }

  state.isProcessing = true;
  dom.submitBtn.disabled = true;
  dom.submitBtn.querySelector('.btn-text').hidden = true;
  dom.submitBtn.querySelector('.btn-loader').hidden = false;
  dom.traceFeed.innerHTML = '';
  showOutput('loading');

  // Simulate trace steps
  const thinkingEl = dom.loadingState.querySelector('.thinking-text');
  thinkingEl.textContent = 'Analyzing email...';
  addTrace('Received customer email', 'clock');

  const payload = {
    customer_email: dom.customerEmail.value.trim(),
    brand,
    subject: dom.subject.value.trim(),
    body,
    old_emails: dom.oldEmails.value.trim(),
    auto_execute: dom.autoExecute.checked,
  };

  // Simulate progress traces
  const traceTimer = setTimeout(() => {
    addTrace('Routing to policy...', 'clock');
    thinkingEl.textContent = 'Routing to policy...';
  }, 1500);
  const traceTimer2 = setTimeout(() => {
    addTrace('Searching knowledge base...', 'tool');
    thinkingEl.textContent = 'Searching knowledge base...';
  }, 3500);
  const traceTimer3 = setTimeout(() => {
    addTrace('Reasoning with ReAct loop...', 'clock');
    thinkingEl.textContent = 'Generating reply...';
  }, 6000);

  try {
    const resp = await fetch(`${API_URL()}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    clearTimeout(traceTimer);
    clearTimeout(traceTimer2);
    clearTimeout(traceTimer3);

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    addTrace('Reply generated successfully', 'check');
    renderResult(data);
    saveToHistory(payload, data);
    showOutput('result');
    toast('Reply generated', 'success');
  } catch (err) {
    clearTimeout(traceTimer);
    clearTimeout(traceTimer2);
    clearTimeout(traceTimer3);
    addTrace(`Error: ${err.message}`, 'clock');
    showOutput('loading');
    toast(`Failed: ${err.message}`, 'error');
  } finally {
    state.isProcessing = false;
    dom.submitBtn.disabled = false;
    dom.submitBtn.querySelector('.btn-text').hidden = false;
    dom.submitBtn.querySelector('.btn-loader').hidden = true;
  }
}

dom.submitBtn.addEventListener('click', handleSubmit);

// ── Render Result ─────────────────────────
function renderResult(data) {
  // Badges
  dom.policyBadge.textContent = data.selected_policy || 'N/A';
  dom.policyBadge.hidden = !data.selected_policy;

  dom.langBadge.textContent = (data.detected_language || 'en').toUpperCase();

  dom.reviewBadge.textContent = data.review_passed ? 'Review Passed' : 'Review Failed';
  dom.reviewBadge.className = `result-badge review-badge ${data.review_passed ? 'passed' : 'failed'}`;

  // Reply content
  dom.replyContent.textContent = data.final_reply || '(No reply generated)';

  // Human tasks
  if (data.requires_human && data.human_tasks && data.human_tasks.length > 0) {
    dom.humanTasks.hidden = false;
    dom.humanTaskList.innerHTML = data.human_tasks
      .map(t => `<li>${escapeHtml(typeof t === 'string' ? t : (t.description || t.task || JSON.stringify(t)))}</li>`)
      .join('');
  } else {
    dom.humanTasks.hidden = true;
  }

  // Thought trace
  if (data.thought_history && data.thought_history.length > 0) {
    dom.thoughtTrace.innerHTML = data.thought_history.map((step, i) => {
      const thought = step.thought || step.content || JSON.stringify(step);
      const decision = step.decision || '';
      return `<div class="thought-step">
        <div class="step-label">Step ${i + 1}${decision ? ' — ' + escapeHtml(decision) : ''}</div>
        <div class="step-content">${escapeHtml(thought)}</div>
      </div>`;
    }).join('');
  } else {
    dom.thoughtTrace.innerHTML = '<p style="color:var(--text-tertiary)">No reasoning trace available.</p>';
  }

  // Tool results
  if (data.tool_results && Object.keys(data.tool_results).length > 0) {
    dom.toolResults.innerHTML = `<pre>${escapeHtml(JSON.stringify(data.tool_results, null, 2))}</pre>`;
  } else {
    dom.toolResults.innerHTML = '<p style="color:var(--text-tertiary)">No tool calls were made.</p>';
  }

  // Basic info
  if (data.basic_info && Object.keys(data.basic_info).length > 0) {
    const rows = Object.entries(data.basic_info)
      .map(([k, v]) => `<div><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v))}</div>`)
      .join('');
    dom.basicInfo.innerHTML = rows;
  } else {
    dom.basicInfo.innerHTML = '<p style="color:var(--text-tertiary)">No extracted info.</p>';
  }

  // Knowledge
  if (data.retrieved_knowledge) {
    dom.knowledgeInfo.innerHTML = `<pre>${escapeHtml(data.retrieved_knowledge)}</pre>`;
  } else {
    dom.knowledgeInfo.innerHTML = '<p style="color:var(--text-tertiary)">No knowledge retrieved.</p>';
  }
}

// ── Copy Button ───────────────────────────
dom.copyBtn.addEventListener('click', () => {
  const text = dom.replyContent.textContent;
  navigator.clipboard.writeText(text).then(() => {
    toast('Copied to clipboard', 'success');
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('Copied to clipboard', 'success');
  });
});

// ── Clear Button ──────────────────────────
dom.clearBtn.addEventListener('click', () => {
  dom.customerEmail.value = '';
  dom.subject.value = '';
  dom.body.value = '';
  dom.oldEmails.value = '';
  dom.autoExecute.checked = false;
  showOutput('empty');
  dom.body.focus();
});

// ── History ───────────────────────────────
function saveToHistory(payload, data) {
  const entry = {
    id: Date.now(),
    timestamp: Date.now(),
    brand: payload.brand,
    subject: payload.subject || '(No subject)',
    customerEmail: payload.customer_email,
    body: payload.body,
    reply: data.final_reply,
    policy: data.selected_policy,
    language: data.detected_language,
    reviewPassed: data.review_passed,
    data: data,
  };
  state.history.unshift(entry);
  if (state.history.length > 50) state.history = state.history.slice(0, 50);
  localStorage.setItem('smartcs_history', JSON.stringify(state.history));
}

function renderHistory() {
  if (state.history.length === 0) {
    dom.historyEmpty.hidden = false;
    dom.historyList.hidden = true;
    return;
  }
  dom.historyEmpty.hidden = true;
  dom.historyList.hidden = false;
  dom.historyList.innerHTML = state.history.map(entry => `
    <div class="history-card" data-id="${entry.id}">
      <div class="history-card-header">
        <span class="hc-brand">${escapeHtml(entry.brand)}</span>
        <span class="hc-time">${formatTime(entry.timestamp)}</span>
      </div>
      <div class="history-card-subject">${escapeHtml(entry.subject)}</div>
      <div class="history-card-preview">${escapeHtml((entry.reply || '').substring(0, 120))}</div>
    </div>
  `).join('');

  // Click to load history entry
  dom.historyList.querySelectorAll('.history-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = parseInt(card.dataset.id);
      const entry = state.history.find(h => h.id === id);
      if (!entry) return;
      // Fill form
      dom.customerEmail.value = entry.customerEmail || '';
      dom.brand.value = entry.brand || 'ohuhu';
      dom.subject.value = entry.subject || '';
      dom.body.value = entry.body || '';
      // Show result
      renderResult(entry.data);
      showOutput('result');
      switchView('compose');
    });
  });
}

// ── Settings ──────────────────────────────
dom.testConnection.addEventListener('click', async () => {
  dom.connectionResult.className = 'connection-result';
  dom.connectionResult.style.display = 'none';
  dom.testConnection.disabled = true;
  dom.testConnection.textContent = 'Testing...';

  try {
    const resp = await fetch(`${API_URL()}/health`, { signal: AbortSignal.timeout(5000) });
    const data = await resp.json();
    if (data.status === 'ok') {
      dom.connectionResult.className = 'connection-result success';
      dom.connectionResult.textContent = 'Connected successfully!';
      dom.connectionResult.style.display = 'block';
      setSystemStatus('online');
    } else {
      throw new Error('Unexpected response');
    }
  } catch (err) {
    dom.connectionResult.className = 'connection-result error';
    dom.connectionResult.textContent = `Connection failed: ${err.message}`;
    dom.connectionResult.style.display = 'block';
    setSystemStatus('error');
  } finally {
    dom.testConnection.disabled = false;
    dom.testConnection.textContent = 'Test Connection';
  }
});

// ── System Status ─────────────────────────
function setSystemStatus(status) {
  dom.statusDot.className = 'status-dot';
  if (status === 'online') {
    dom.statusDot.classList.add('online');
    dom.statusText.textContent = 'System Online';
  } else if (status === 'error') {
    dom.statusDot.classList.add('error');
    dom.statusText.textContent = 'Disconnected';
  } else {
    dom.statusText.textContent = 'Connecting...';
  }
}

// ── Keyboard Shortcut ─────────────────────
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    handleSubmit();
  }
});

// ── Init ──────────────────────────────────
async function init() {
  // Check backend health
  try {
    const resp = await fetch(`${API_URL()}/health`, { signal: AbortSignal.timeout(5000) });
    const data = await resp.json();
    if (data.status === 'ok') {
      setSystemStatus('online');
    }
  } catch {
    setSystemStatus('error');
  }

  // Fetch system info
  try {
    const resp = await fetch(`${API_URL()}/info`, { signal: AbortSignal.timeout(5000) });
    const info = await resp.json();
    dom.modelBadge.textContent = info.llm_model || '--';
  } catch {
    dom.modelBadge.textContent = '--';
  }

  // Render initial history
  renderHistory();
}

init();
