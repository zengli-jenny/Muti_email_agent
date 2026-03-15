/**
 * Smart CS — Frontend Application
 * Anthropic Claude-style intelligent customer service UI
 * Real-time streaming with node open/close animation
 */

// ── Configuration ─────────────────────────
const API_URL = () => document.getElementById('apiUrl')?.value || 'http://127.0.0.1:8001';

// ── State ─────────────────────────────────
const state = {
  history: JSON.parse(localStorage.getItem('smartcs_history') || '[]'),
  isProcessing: false,
  defaultPrompts: {},    // fetched from GET /prompts
  customPrompts: JSON.parse(localStorage.getItem('smartcs_prompts') || '{}'),
  lastPayload: null,     // for conversation re-calls
  lastFullState: null,   // for conversation updates
};

// ── DOM References ────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {};

function cacheDom() {
  dom.sidebar = $('#sidebar');
  dom.sidebarToggle = $('#sidebarToggle');
  dom.mobileMenu = $('#mobileMenu');
  dom.navItems = $$('.nav-item');
  dom.viewTitle = $('#viewTitle');
  dom.modelBadge = $('#modelBadge');
  dom.statusDot = $('.status-dot');
  dom.statusText = $('.status-text');
  dom.customerEmail = $('#customerEmail');
  dom.brand = $('#brand');
  dom.subject = $('#subject');
  dom.body = $('#body');
  dom.oldEmails = $('#oldEmails');
  dom.autoExecute = $('#autoExecute');
  dom.submitBtn = $('#submitBtn');
  dom.clearBtn = $('#clearBtn');
  dom.emptyState = $('#emptyState');
  dom.loadingState = $('#loadingState');
  dom.resultState = $('#resultState');
  dom.chainTimeline = $('#chainTimeline');
  dom.policyBadge = $('#policyBadge');
  dom.langBadge = $('#langBadge');
  dom.reviewBadge = $('#reviewBadge');
  dom.replyContent = $('#replyContent');
  dom.humanTasks = $('#humanTasks');
  dom.humanTaskList = $('#humanTaskList');
  dom.copyBtn = $('#copyBtn');
  dom.historyEmpty = $('#historyEmpty');
  dom.historyList = $('#historyList');
  dom.apiUrl = $('#apiUrl');
  dom.testConnection = $('#testConnection');
  dom.connectionResult = $('#connectionResult');
  dom.toastContainer = $('#toastContainer');
}

// ── Chain Icons ───────────────────────────
const CHAIN_ICONS = {
  router: '<svg viewBox="0 0 16 16" fill="none"><path d="M8 2v4M8 10v4M2 8h4M10 8h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.5"/></svg>',
  retriever: '<svg viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.5"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  solver: '<svg viewBox="0 0 16 16" fill="none"><path d="M3 8a5 5 0 0110 0" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M8 3v3l2 1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  tool: '<svg viewBox="0 0 16 16" fill="none"><path d="M10 2l4 4-8 8H2v-4l8-8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>',
  generator: '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M5 7h6M5 9.5h4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  reviewer: '<svg viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  context: '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.4"/><path d="M5 5h6M5 8h4M5 11h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>',
  done: '<svg viewBox="0 0 16 16" fill="none"><path d="M4 8l3 3 5-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const CHEVRON_SVG = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 2.5l3.5 3.5-3.5 3.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// ── Node Metadata ─────────────────────────
const NODE_META = {
  load_context: { type: 'context', title: 'ContextLoader 上下文', sub: '加载客户记忆、品牌技能、语言检测' },
  router: { type: 'router', title: 'Router 路由', sub: '分析邮件意图，匹配标准流程' },
  retriever: { type: 'retriever', title: 'Retriever 检索', sub: '搜索知识库，匹配相关 FAQ' },
  solver: { type: 'solver', title: 'Solver 推理', sub: 'ReAct 循环：思考 → 决策 → 工具调用' },
  tool_executor: { type: 'tool', title: '工具执行', sub: '调用 TCS API 查询业务数据' },
  reply_generator: { type: 'generator', title: 'Generator 生成', sub: '格式化草稿为专业邮件' },
  reviewer: { type: 'reviewer', title: 'Reviewer 审核', sub: '事实准确性、合规性、品牌调性检查' },
  finalize: { type: 'done', title: '完成', sub: '流程结束' },
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
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Navigation ────────────────────────────
const viewMap = {
  compose: { view: '#composeView', title: '新建回复' },
  history: { view: '#historyView', title: '历史记录' },
  settings: { view: '#settingsView', title: '设置' },
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
  dom.sidebar.classList.remove('mobile-open');
  const overlay = $('.sidebar-overlay');
  if (overlay) overlay.classList.remove('active');
  if (name === 'history') renderHistory();
}

function bindNavigation() {
  dom.navItems.forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
}

// ── Sidebar Toggle ────────────────────────
function bindSidebar() {
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
}

// ── Output State Management ───────────────
function showOutput(which) {
  dom.emptyState.hidden = which !== 'empty';
  dom.loadingState.hidden = which !== 'loading';
  dom.resultState.hidden = which !== 'result';
}

// ── Chain Step: Create active step with streaming area ──
function createActiveStep(container, type, title, subtitle) {
  const el = document.createElement('div');
  el.className = 'chain-step active-step open';
  el.dataset.type = type;

  el.innerHTML = `
    <div class="chain-step-header">
      <div class="chain-dot dot-${type} dot-active">
        <span class="dot-ring"></span>
        ${CHAIN_ICONS[type] || ''}
      </div>
      <div class="chain-step-info">
        <div class="chain-step-title">${escapeHtml(title)}</div>
        <div class="chain-step-subtitle shimmer-text">执行中...</div>
      </div>
      <span class="chain-step-status status-active"><span class="status-spinner"></span>执行中</span>
      <span class="chain-chevron">${CHEVRON_SVG}</span>
    </div>
    <div class="chain-step-body">
      <div class="chain-step-content">
        <div class="chain-step-streaming">
          <div class="streaming-placeholder">
            <div class="streaming-dots"><span></span><span></span><span></span></div>
            <span>处理中...</span>
          </div>
        </div>
      </div>
    </div>
  `;

  const header = el.querySelector('.chain-step-header');
  header.addEventListener('click', () => el.classList.toggle('open'));

  container.appendChild(el);
  scrollToBottom(container);
  return el;
}

// ── Chain Step: Populate with real data and collapse ──
function populateAndCollapseStep(stepEl, type, title, subtitle, blocks) {
  if (!stepEl) return;

  // Update header
  stepEl.classList.remove('active-step');
  const titleEl = stepEl.querySelector('.chain-step-title');
  const subEl = stepEl.querySelector('.chain-step-subtitle');
  const statusEl = stepEl.querySelector('.chain-step-status');
  const dotEl = stepEl.querySelector('.chain-dot');

  if (titleEl) titleEl.textContent = title;
  if (subEl) {
    subEl.textContent = subtitle;
    subEl.classList.remove('shimmer-text');
  }
  if (statusEl) {
    statusEl.className = 'chain-step-status status-done';
    statusEl.innerHTML = '完成';
  }
  if (dotEl) {
    dotEl.classList.remove('dot-active');
    const ring = dotEl.querySelector('.dot-ring');
    if (ring) ring.remove();
  }

  // Replace body content with blocks
  const bodyEl = stepEl.querySelector('.chain-step-body');
  const hasBlocks = blocks && blocks.length > 0;

  if (hasBlocks && bodyEl) {
    const contentEl = bodyEl.querySelector('.chain-step-content');
    if (contentEl) {
      contentEl.innerHTML = blocks.map(b => `
        <div class="chain-block">
          <div class="chain-block-header">
            <svg class="chain-block-icon" viewBox="0 0 16 16" fill="none">
              ${b.type === 'data'
                ? '<rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5 7h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>'
                : '<circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.3"/><path d="M8 5.5v5M5.5 8h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>'}
            </svg>
            <span class="chain-block-label">${escapeHtml(b.label)}</span>
            <span class="chain-block-chevron">${CHEVRON_SVG}</span>
          </div>
          <div class="chain-block-body">
            <div class="chain-block-content">${b.content}</div>
          </div>
        </div>
      `).join('');

      // Bind block toggles
      contentEl.querySelectorAll('.chain-block-header').forEach(bh => {
        bh.addEventListener('click', (e) => {
          e.stopPropagation();
          bh.closest('.chain-block').classList.toggle('open');
        });
      });
    }
  } else if (bodyEl) {
    bodyEl.innerHTML = '';
    // Remove chevron if no blocks
    const chevron = stepEl.querySelector('.chain-chevron');
    if (chevron) chevron.style.display = 'none';
  }

  // Auto-collapse after a brief delay
  setTimeout(() => {
    stepEl.classList.remove('open');
  }, 300);
}

// ── Legacy addLiveStep (for static rendering, e.g., history) ──
function addLiveStep(container, type, title, subtitle, isActive, blocks) {
  const el = document.createElement('div');
  el.className = 'chain-step' + (isActive ? ' active-step' : '');
  el.dataset.type = type;
  const hasBlocks = blocks && blocks.length > 0;

  const blocksHtml = hasBlocks ? blocks.map(b => `
    <div class="chain-block">
      <div class="chain-block-header">
        <svg class="chain-block-icon" viewBox="0 0 16 16" fill="none">
          ${b.type === 'data'
            ? '<rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5 7h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>'
            : '<circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.3"/><path d="M8 5.5v5M5.5 8h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>'}
        </svg>
        <span class="chain-block-label">${escapeHtml(b.label)}</span>
        <span class="chain-block-chevron">${CHEVRON_SVG}</span>
      </div>
      <div class="chain-block-body">
        <div class="chain-block-content">${b.content}</div>
      </div>
    </div>
  `).join('') : '';

  el.innerHTML = `
    <div class="chain-step-header">
      <div class="chain-dot dot-${type}">${CHAIN_ICONS[type] || ''}</div>
      <div class="chain-step-info">
        <div class="chain-step-title">${escapeHtml(title)}</div>
        <div class="chain-step-subtitle">${escapeHtml(subtitle)}</div>
      </div>
      ${isActive
        ? '<span class="chain-step-status status-active"><span class="status-spinner"></span>执行中</span>'
        : '<span class="chain-step-status status-done">完成</span>'}
      ${hasBlocks ? `<span class="chain-chevron">${CHEVRON_SVG}</span>` : ''}
    </div>
    ${hasBlocks ? `<div class="chain-step-body"><div class="chain-step-content">${blocksHtml}</div></div>` : ''}
  `;

  const header = el.querySelector('.chain-step-header');
  if (header && hasBlocks) {
    header.addEventListener('click', () => el.classList.toggle('open'));
  }
  el.querySelectorAll('.chain-block-header').forEach(bh => {
    bh.addEventListener('click', (e) => {
      e.stopPropagation();
      bh.closest('.chain-block').classList.toggle('open');
    });
  });

  container.appendChild(el);
  scrollToBottom(container);
  return el;
}

function scrollToBottom(el) {
  if (el) el.scrollTop = el.scrollHeight;
}

// ── Build blocks from SSE event data ──────
function buildLiveBlocks(nodeName, event) {
  const blocks = [];

  // Reasoning (real thinking tokens)
  let reasoning = '';
  if (event.trace) {
    for (const t of event.trace) {
      if (t.reasoning) { reasoning = t.reasoning; break; }
    }
  }
  if (reasoning) {
    blocks.push({ label: '思维链 (Thinking)', content: `<div class="chain-thought">${escapeHtml(reasoning)}</div>`, type: 'thought' });
  }

  // Router: basic_info
  if (nodeName === 'router' && event.basic_info && Object.keys(event.basic_info).length > 0) {
    const rows = Object.entries(event.basic_info).map(([k, v]) =>
      `<div><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v || ''))}</div>`
    ).join('');
    blocks.push({ label: '提取信息', content: rows, type: 'info' });
  }

  // Retriever: knowledge
  if (nodeName === 'retriever' && event.retrieved_knowledge) {
    blocks.push({ label: '知识库结果', content: `<pre>${escapeHtml(event.retrieved_knowledge)}</pre>`, type: 'data' });
  }

  // Solver: thought_history
  if (nodeName === 'solver' && event.thought_history) {
    event.thought_history.forEach(th => {
      if (th.thought) blocks.push({ label: '推理过程', content: `<div class="chain-thought">${escapeHtml(th.thought)}</div>`, type: 'thought' });
      if (th.action) blocks.push({ label: '决策', content: `<pre>${escapeHtml(th.action)}</pre>`, type: 'data' });
    });
  }

  // Tool executor: results
  if (nodeName === 'tool_executor' && event.tool_results) {
    Object.entries(event.tool_results).forEach(([name, result]) => {
      blocks.push({ label: `${name} 返回`, content: `<pre>${escapeHtml(JSON.stringify(result, null, 2))}</pre>`, type: 'data' });
    });
  }

  // Reviewer: feedback + result
  if (nodeName === 'reviewer') {
    const passed = event.review_passed;
    blocks.push({ label: '审核结果', content: `<div class="chain-thought">${passed ? '审核通过' : '审核未通过'}</div>`, type: 'thought' });
    if (event.review_feedback) {
      blocks.push({ label: '审核反馈', content: `<div class="chain-thought">${escapeHtml(event.review_feedback)}</div>`, type: 'thought' });
    }
  }

  // Generator: draft_reply
  if (nodeName === 'reply_generator' && event.draft_reply) {
    blocks.push({ label: '生成的邮件草稿', content: `<div class="chain-thought">${escapeHtml(event.draft_reply)}</div>`, type: 'thought' });
  }

  // Finalize
  if (nodeName === 'finalize' && event.final_reply) {
    blocks.push({ label: '最终回复', content: `<div class="chain-thought">${escapeHtml(event.final_reply)}</div>`, type: 'thought' });
  }

  return blocks;
}

// ── Node Config ───────────────────────────
function getNodeConfig() {
  const nodes = ['router', 'solver', 'reply_generator', 'reviewer'];
  const config = {};
  nodes.forEach(node => {
    const cb = $(`.thinking-checkbox[data-node="${node}"]`);
    config[node] = { enable_thinking: cb ? cb.checked : false };
  });
  // Merge custom prompts
  Object.entries(state.customPrompts).forEach(([nodeKey, prompt]) => {
    if (!config[nodeKey]) config[nodeKey] = {};
    config[nodeKey].custom_prompt = prompt;
  });
  return config;
}

// ── Build request payload ─────────────────
function buildPayload() {
  return {
    customer_email: dom.customerEmail.value.trim(),
    brand: dom.brand.value,
    subject: dom.subject.value.trim(),
    body: dom.body.value.trim(),
    old_emails: dom.oldEmails.value.trim(),
    auto_execute: dom.autoExecute.checked,
    llm_temperature: parseFloat($('#globalTemperature')?.value || '0.1'),
    max_react_iterations: parseInt($('#maxReactIterations')?.value || '7'),
    max_reflections: parseInt($('#maxReflections')?.value || '2'),
    node_config: getNodeConfig(),
  };
}

// ── SSE Stream Processor ──────────────────
// Processes SSE events from a ReadableStream reader.
// Returns the accumulated fullState.
async function processSSEStream(reader, timeline, fullState, callbacks) {
  const decoder = new TextDecoder();
  let buffer = '';
  let currentStep = null;
  let solverCount = callbacks.solverCount || 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      let event;
      try { event = JSON.parse(line.slice(6)); } catch { continue; }

      const nodeName = event.node;
      if (nodeName === '__done__' || nodeName === '__error__') continue;

      const status = event.status || 'done';
      const meta = NODE_META[nodeName] || { type: nodeName, title: nodeName, sub: '' };

      // "start" event: show active node with streaming area open
      if (status === 'start') {
        // Collapse previous step if any
        if (currentStep) {
          populateAndCollapseStep(currentStep, currentStep.dataset.type,
            currentStep.querySelector('.chain-step-title')?.textContent || '',
            currentStep.querySelector('.chain-step-subtitle')?.textContent || '',
            []);
        }

        let title = meta.title;
        if (nodeName === 'solver') {
          solverCount++;
          title = `Solver 推理 #${solverCount}`;
        }

        currentStep = createActiveStep(timeline, meta.type, title, meta.sub);
        continue;
      }

      // "done" event: merge data into fullState, populate step with blocks
      if (event.trace) fullState.trace_log.push(...event.trace);
      if (event.thought_history) fullState.thought_history.push(...event.thought_history);
      if (event.tool_results) Object.assign(fullState.tool_results, event.tool_results);
      for (const k of ['basic_info', 'selected_policy', 'retrieved_knowledge', 'detected_language',
                        'review_passed', 'final_reply', 'requires_human', 'human_tasks', 'reply_type',
                        'review_feedback', 'draft_reply', 'solver_decision']) {
        if (k in event) fullState[k] = event[k];
      }

      let title = meta.title;
      let sub = meta.sub;

      if (nodeName === 'router' && event.selected_policy) {
        sub = `匹配策略: ${event.selected_policy}`;
      } else if (nodeName === 'solver') {
        title = `Solver 推理 #${solverCount}`;
        if (event.solver_decision === 'call_tool') {
          const tn = event.thought_history?.[0]?.action?.replace('调用工具: ', '').split('(')[0] || '';
          sub = `决策: 调用工具 ${tn}`;
        } else if (event.solver_decision) {
          sub = `决策: ${event.solver_decision}`;
        }
      } else if (nodeName === 'tool_executor' && event.trace?.[0]) {
        sub = event.trace[0].detail || sub;
      } else if (nodeName === 'reviewer' && event.review_passed !== undefined) {
        sub = event.review_passed ? '质量检查通过' : '审核未通过';
      }

      const blocks = buildLiveBlocks(nodeName, event);

      if (currentStep) {
        populateAndCollapseStep(currentStep, meta.type, title, sub, blocks);
        currentStep = null;
      } else {
        // No matching "start" event; create a completed step directly
        addLiveStep(timeline, meta.type, title, sub, false, blocks);
      }

      // Human assist check: solver requests human intervention
      if (nodeName === 'solver' && event.solver_decision === 'need_human') {
        const humanInput = await showHumanAssistDialog(event.human_tasks || fullState.human_tasks);
        if (humanInput) {
          callbacks.payload.old_emails = (callbacks.payload.old_emails || '') + `\n\n[人工客服指令]: ${humanInput}`;
          callbacks.payload.body = callbacks.payload.body + `\n\n[人工客服补充]: ${humanInput}`;

          addLiveStep(timeline, 'context', '人工指令已注入', '基于客服指令继续生成', false, [
            { label: '客服指令', content: `<div class="chain-thought">${escapeHtml(humanInput)}</div>`, type: 'thought' }
          ]);

          reader.cancel();

          // Restart stream
          const resp2 = await fetch(`${API_URL()}/reply/stream`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(callbacks.payload),
          });

          if (resp2.ok) {
            const r2 = resp2.body.getReader();
            callbacks.solverCount = solverCount;
            await processSSEStream(r2, timeline, fullState, callbacks);
          }
          return fullState;
        }
      }
    }
  }

  // Collapse last step if still active
  if (currentStep) {
    populateAndCollapseStep(currentStep, currentStep.dataset.type,
      currentStep.querySelector('.chain-step-title')?.textContent || '',
      currentStep.querySelector('.chain-step-subtitle')?.textContent || '',
      []);
  }

  callbacks.solverCount = solverCount;
  return fullState;
}

// ── Submit Handler ────────────────────────
async function handleSubmit() {
  if (state.isProcessing) return;

  const bodyText = dom.body.value.trim();
  if (!bodyText) {
    toast('请输入邮件正文', 'error');
    dom.body.focus();
    return;
  }

  state.isProcessing = true;
  dom.submitBtn.disabled = true;
  dom.submitBtn.querySelector('.btn-text').setAttribute('hidden', '');
  dom.submitBtn.querySelector('.btn-loader').removeAttribute('hidden');

  showOutput('result');
  const timeline = dom.chainTimeline;
  timeline.innerHTML = '';
  dom.replyContent.textContent = '';
  dom.humanTasks.hidden = true;
  const replySection = $('.chain-reply-section');
  if (replySection) replySection.setAttribute('hidden', '');

  // Remove any existing final-reply-card and conversation panel
  const existingCard = timeline.parentElement?.querySelector('.final-reply-card');
  if (existingCard) existingCard.remove();
  const existingConv = timeline.parentElement?.querySelector('.conversation-panel');
  if (existingConv) existingConv.remove();
  const existingFaq = timeline.parentElement?.querySelector('.faq-panel');
  if (existingFaq) existingFaq.remove();

  const payload = buildPayload();
  state.lastPayload = { ...payload };

  const fullState = {
    trace_log: [], thought_history: [], tool_results: {},
    basic_info: {}, selected_policy: '', retrieved_knowledge: '',
    detected_language: 'en', review_passed: false, final_reply: '',
    requires_human: false, human_tasks: [], reply_type: 'NewEmail',
    review_feedback: '', draft_reply: '', solver_decision: '',
  };

  try {
    const resp = await fetch(`${API_URL()}/reply/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: resp.statusText }));
      throw new Error(err.error || `HTTP ${resp.status}`);
    }

    const reader = resp.body.getReader();
    await processSSEStream(reader, timeline, fullState, { payload, solverCount: 0 });

    state.lastFullState = fullState;

    // Render final display
    renderResultFinal(fullState);
    saveToHistory(payload, fullState);
    toast('回复已生成', 'success');
  } catch (err) {
    addLiveStep(timeline, 'router', '错误', err.message, false, []);
    toast(`失败：${err.message}`, 'error');
  } finally {
    state.isProcessing = false;
    dom.submitBtn.disabled = false;
    dom.submitBtn.querySelector('.btn-text').removeAttribute('hidden');
    dom.submitBtn.querySelector('.btn-loader').setAttribute('hidden', '');
  }
}

// ── Human Assist Dialog ───────────────────
function showHumanAssistDialog(tasks) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'human-dialog-overlay';

    // Check if tasks contain FAQ-format questions with options
    const hasFaqFormat = (tasks || []).some(t =>
      typeof t === 'object' && t.options && Array.isArray(t.options)
    );

    let bodyHtml = '';

    if (hasFaqFormat) {
      // FAQ-style with selectable options
      const faqItems = tasks.map((t, idx) => {
        if (typeof t === 'object' && t.options && Array.isArray(t.options)) {
          const question = t.question || t.description || t.task || '';
          const optionsHtml = t.options.map((opt, oi) =>
            `<button class="faq-option-btn" data-q="${idx}" data-val="${escapeHtml(String(opt))}">${escapeHtml(String(opt))}</button>`
          ).join('');
          return `
            <div class="faq-question-group" data-idx="${idx}">
              <div class="faq-question-label">${escapeHtml(question)}</div>
              <div class="faq-options">${optionsHtml}
                <button class="faq-option-btn faq-custom-btn" data-q="${idx}" data-val="__custom__">自定义回答</button>
              </div>
              <div class="faq-custom-input" hidden>
                <input type="text" placeholder="请输入自定义回答..." class="faq-custom-text" data-q="${idx}">
              </div>
              <input type="hidden" class="faq-answer" data-q="${idx}" value="">
            </div>
          `;
        }
        const text = typeof t === 'string' ? t : (t.description || t.task || JSON.stringify(t));
        return `<li>${escapeHtml(text)}</li>`;
      }).join('');
      bodyHtml = `<div class="human-dialog-tasks faq-tasks">${faqItems}</div>`;
    } else {
      const taskList = (tasks || []).map(t => {
        const text = typeof t === 'string' ? t : (t.description || t.task || JSON.stringify(t));
        return `<li>${escapeHtml(text)}</li>`;
      }).join('');
      bodyHtml = taskList ? `<div class="human-dialog-tasks"><h4>待处理事项</h4><ul>${taskList}</ul></div>` : '';
    }

    overlay.innerHTML = `
      <div class="human-dialog">
        <div class="human-dialog-header">
          <div class="human-dialog-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="8" r="4" stroke="currentColor" stroke-width="1.8"/>
              <path d="M4 20c0-4 4-7 8-7s8 3 8 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
            </svg>
          </div>
          <div>
            <h3>需要人工客服协助</h3>
            <p>AI 无法独立完成此请求，请提供指导</p>
          </div>
        </div>
        ${bodyHtml}
        <div class="human-dialog-input">
          <label>请输入处理指令</label>
          <textarea id="humanAssistInput" rows="4" placeholder="例如：已确认客户订单，同意全额退款并重新发货..."></textarea>
        </div>
        <div class="human-dialog-actions">
          <button class="btn btn-secondary" id="humanSkipBtn">跳过（不处理）</button>
          <button class="btn btn-primary" id="humanSubmitBtn">提交并继续生成</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('active'));

    // FAQ option selection logic
    if (hasFaqFormat) {
      overlay.querySelectorAll('.faq-option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const qIdx = btn.dataset.q;
          const val = btn.dataset.val;
          const group = overlay.querySelector(`.faq-question-group[data-idx="${qIdx}"]`);
          if (!group) return;

          // Deselect siblings
          group.querySelectorAll('.faq-option-btn').forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');

          const customInput = group.querySelector('.faq-custom-input');
          const hiddenAnswer = group.querySelector('.faq-answer');

          if (val === '__custom__') {
            if (customInput) customInput.hidden = false;
            if (hiddenAnswer) hiddenAnswer.value = '';
          } else {
            if (customInput) customInput.hidden = true;
            if (hiddenAnswer) hiddenAnswer.value = val;
          }
        });
      });

      overlay.querySelectorAll('.faq-custom-text').forEach(input => {
        input.addEventListener('input', () => {
          const qIdx = input.dataset.q;
          const group = overlay.querySelector(`.faq-question-group[data-idx="${qIdx}"]`);
          if (!group) return;
          const hiddenAnswer = group.querySelector('.faq-answer');
          if (hiddenAnswer) hiddenAnswer.value = input.value;
        });
      });
    }

    const input = overlay.querySelector('#humanAssistInput');
    input.focus();

    function collectAnswer() {
      let result = input.value.trim();

      // Collect FAQ answers
      if (hasFaqFormat) {
        const faqAnswers = [];
        overlay.querySelectorAll('.faq-question-group').forEach(group => {
          const question = group.querySelector('.faq-question-label')?.textContent || '';
          const answer = group.querySelector('.faq-answer')?.value || '';
          if (answer) {
            faqAnswers.push(`${question}: ${answer}`);
          }
        });
        if (faqAnswers.length > 0) {
          result = faqAnswers.join('\n') + (result ? '\n' + result : '');
        }
      }
      return result || null;
    }

    overlay.querySelector('#humanSubmitBtn').addEventListener('click', () => {
      const val = collectAnswer();
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 300);
      resolve(val);
    });

    overlay.querySelector('#humanSkipBtn').addEventListener('click', () => {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 300);
      resolve(null);
    });
  });
}

// ── FAQ Selection Panel ───────────────────
function createFaqPanel(parentEl, data) {
  // Check for FAQ-type tasks
  const faqTasks = (data.human_tasks || []).filter(t =>
    typeof t === 'object' && t.options && Array.isArray(t.options)
  );
  if (faqTasks.length === 0 && data.reply_type !== 'FaqList') return null;

  const panel = document.createElement('div');
  panel.className = 'faq-panel';

  const questionsHtml = faqTasks.map((t, idx) => {
    const question = t.question || t.description || t.task || '';
    const optionsHtml = t.options.map(opt =>
      `<button class="faq-select-btn" data-q="${idx}" data-val="${escapeHtml(String(opt))}">${escapeHtml(String(opt))}</button>`
    ).join('');
    return `
      <div class="faq-item" data-idx="${idx}">
        <div class="faq-item-question">${escapeHtml(question)}</div>
        <div class="faq-item-options">
          ${optionsHtml}
          <button class="faq-select-btn faq-select-custom" data-q="${idx}" data-val="__custom__">自定义回答</button>
        </div>
        <div class="faq-item-custom" hidden>
          <input type="text" class="faq-item-custom-input" data-q="${idx}" placeholder="请输入自定义回答...">
        </div>
        <input type="hidden" class="faq-item-answer" data-q="${idx}" value="">
      </div>
    `;
  }).join('');

  panel.innerHTML = `
    <div class="faq-panel-header">
      <span class="faq-panel-title">请选择回答</span>
      <span class="faq-panel-subtitle">AI 需要您对以下问题做出选择</span>
    </div>
    <div class="faq-panel-body">${questionsHtml}</div>
    <div class="faq-panel-footer">
      <button class="btn btn-primary faq-confirm-btn">确认提交</button>
    </div>
  `;

  // Bind option selection
  panel.querySelectorAll('.faq-select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qIdx = btn.dataset.q;
      const val = btn.dataset.val;
      const item = panel.querySelector(`.faq-item[data-idx="${qIdx}"]`);
      if (!item) return;

      item.querySelectorAll('.faq-select-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');

      const customDiv = item.querySelector('.faq-item-custom');
      const hiddenAnswer = item.querySelector('.faq-item-answer');

      if (val === '__custom__') {
        if (customDiv) customDiv.hidden = false;
      } else {
        if (customDiv) customDiv.hidden = true;
        if (hiddenAnswer) hiddenAnswer.value = val;
      }
    });
  });

  panel.querySelectorAll('.faq-item-custom-input').forEach(input => {
    input.addEventListener('input', () => {
      const qIdx = input.dataset.q;
      const item = panel.querySelector(`.faq-item[data-idx="${qIdx}"]`);
      if (!item) return;
      const hiddenAnswer = item.querySelector('.faq-item-answer');
      if (hiddenAnswer) hiddenAnswer.value = input.value;
    });
  });

  // Confirm button: collect answers and inject into conversation
  panel.querySelector('.faq-confirm-btn').addEventListener('click', async () => {
    const answers = [];
    panel.querySelectorAll('.faq-item').forEach(item => {
      const question = item.querySelector('.faq-item-question')?.textContent || '';
      const answer = item.querySelector('.faq-item-answer')?.value || '';
      if (answer) answers.push(`${question}: ${answer}`);
    });

    if (answers.length === 0) {
      toast('请至少选择一个回答', 'error');
      return;
    }

    const feedbackText = answers.join('\n');
    panel.remove();

    // Inject into conversation if it exists
    const convPanel = parentEl.querySelector('.conversation-panel');
    if (convPanel) {
      const input = convPanel.querySelector('.conversation-input');
      if (input) {
        input.value = feedbackText;
        convPanel.querySelector('.conversation-send-btn')?.click();
      }
    }
  });

  parentEl.appendChild(panel);
  return panel;
}

// ── Render Final Result ───────────────────
function renderResultFinal(data) {
  // Badges
  dom.policyBadge.textContent = data.selected_policy || '';
  dom.policyBadge.hidden = !data.selected_policy;
  dom.langBadge.textContent = (data.detected_language || 'en').toUpperCase();
  dom.reviewBadge.textContent = data.review_passed ? '审核通过' : '审核未通过';
  dom.reviewBadge.className = `result-badge review-badge ${data.review_passed ? 'passed' : 'failed'}`;

  // Show reply section
  dom.replyContent.textContent = data.final_reply || '（未生成回复）';
  const replySection = $('.chain-reply-section');
  if (replySection) replySection.removeAttribute('hidden');

  const timeline = dom.chainTimeline;
  const parentEl = timeline.parentElement;

  // Remove existing final elements
  const existing = parentEl.querySelector('.final-reply-card');
  if (existing) existing.remove();
  const existingConv = parentEl.querySelector('.conversation-panel');
  if (existingConv) existingConv.remove();
  const existingFaq = parentEl.querySelector('.faq-panel');
  if (existingFaq) existingFaq.remove();

  // Final reply card at bottom of timeline
  if (data.final_reply) {
    const card = document.createElement('div');
    card.className = 'final-reply-card';
    card.innerHTML = `
      <div class="final-reply-card-header">
        <span class="final-reply-card-label">最终生成邮件</span>
        <div class="final-reply-card-badges">
          <span class="result-badge policy-badge">${escapeHtml(data.selected_policy || '')}</span>
          <span class="result-badge lang-badge">${escapeHtml((data.detected_language || 'en').toUpperCase())}</span>
          <span class="result-badge review-badge ${data.review_passed ? 'passed' : 'failed'}">${data.review_passed ? '审核通过' : '审核未通过'}</span>
        </div>
      </div>
      <div class="final-reply-card-body">${escapeHtml(data.final_reply)}</div>
      <div class="final-reply-card-actions">
        <button class="btn btn-secondary final-copy-btn">复制邮件</button>
        <button class="btn btn-primary final-approve-btn">确认发送</button>
        <button class="btn btn-secondary final-feedback-btn">修改意见</button>
      </div>
    `;

    // Bind action buttons
    card.querySelector('.final-copy-btn').addEventListener('click', () => {
      copyToClipboard(data.final_reply);
    });

    card.querySelector('.final-approve-btn').addEventListener('click', () => {
      toast('邮件已确认，可以发送', 'success');
      card.querySelector('.final-approve-btn').disabled = true;
      card.querySelector('.final-approve-btn').textContent = '已确认';
    });

    card.querySelector('.final-feedback-btn').addEventListener('click', () => {
      // Scroll to conversation panel and focus input
      const convPanel = parentEl.querySelector('.conversation-panel');
      if (convPanel) {
        convPanel.scrollIntoView({ behavior: 'smooth' });
        const input = convPanel.querySelector('.conversation-input');
        if (input) input.focus();
      }
    });

    // Insert after timeline, before reply section
    if (timeline.nextSibling) {
      parentEl.insertBefore(card, timeline.nextSibling);
    } else {
      parentEl.appendChild(card);
    }
  }

  // FAQ panel (if needed)
  const hasFaq = (data.human_tasks || []).some(t =>
    typeof t === 'object' && t.options && Array.isArray(t.options)
  ) || data.reply_type === 'FaqList';

  if (hasFaq) {
    createFaqPanel(parentEl, data);
  }

  // Conversation panel
  if (data.final_reply) {
    createConversationPanel(parentEl, data);
  }

  // Human tasks
  if (data.requires_human && data.human_tasks && data.human_tasks.length > 0) {
    dom.humanTasks.removeAttribute('hidden');
    dom.humanTaskList.innerHTML = data.human_tasks
      .map(t => `<li>${escapeHtml(typeof t === 'string' ? t : (t.description || t.task || JSON.stringify(t)))}</li>`)
      .join('');
  } else {
    dom.humanTasks.setAttribute('hidden', '');
  }
}

// ── Clipboard ─────────────────────────────
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    toast('已复制到剪贴板', 'success');
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('已复制到剪贴板', 'success');
  });
}

// ── Conversation Panel (Human-in-the-loop) ──
function createConversationPanel(parentEl, data) {
  const panel = document.createElement('div');
  panel.className = 'conversation-panel';

  const initialMessages = [];

  if (data.final_reply) {
    initialMessages.push({
      role: 'ai',
      text: '邮件已生成完毕。如果需要修改或有任何问题，请在下方告诉我。',
      time: new Date(),
    });
  }

  if (data.requires_human && data.human_tasks && data.human_tasks.length > 0) {
    const taskText = data.human_tasks.map(t =>
      typeof t === 'string' ? t : (t.description || t.task || JSON.stringify(t))
    ).join('\n- ');
    initialMessages.push({
      role: 'ai',
      text: `我需要您的协助来处理以下事项：\n- ${taskText}\n\n请提供相关信息或指示，我将据此重新生成邮件。`,
      time: new Date(),
    });
  }

  const messagesHtml = initialMessages.map(m => renderConversationMsg(m)).join('');

  panel.innerHTML = `
    <div class="conversation-panel-header">
      <svg viewBox="0 0 24 24" fill="none">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2v10z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="conversation-panel-title">对话协作</span>
      <span class="conversation-panel-subtitle">人工客服 &harr; AI 助手</span>
    </div>
    <div class="conversation-messages">${messagesHtml}</div>
    <div class="conversation-input-area">
      <textarea class="conversation-input" rows="1" placeholder="输入修改意见、补充信息或提问...（Enter 发送，Shift+Enter 换行）"></textarea>
      <button class="conversation-send-btn" title="发送">
        <svg viewBox="0 0 24 24" fill="none">
          <path d="M22 2L11 13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M22 2L15 22l-4-9-9-4L22 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>
  `;

  parentEl.appendChild(panel);

  panel._convData = { ...data, messages: [...initialMessages] };

  const input = panel.querySelector('.conversation-input');
  const sendBtn = panel.querySelector('.conversation-send-btn');
  const messagesContainer = panel.querySelector('.conversation-messages');

  async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    // Add human message
    const humanMsg = { role: 'human', text, time: new Date() };
    panel._convData.messages.push(humanMsg);
    messagesContainer.insertAdjacentHTML('beforeend', renderConversationMsg(humanMsg));
    input.value = '';
    input.style.height = 'auto';
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Show typing indicator
    const typingEl = document.createElement('div');
    typingEl.className = 'conversation-typing';
    typingEl.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div> AI 正在思考...';
    messagesContainer.appendChild(typingEl);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    sendBtn.disabled = true;

    try {
      const origPayload = buildPayload();
      origPayload.old_emails = (origPayload.old_emails || '') + `\n\n[人工客服指令]: ${text}`;

      const resp = await fetch(`${API_URL()}/reply/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(origPayload),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let newFinalReply = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }
          if (event.final_reply) newFinalReply = event.final_reply;
        }
      }

      typingEl.remove();

      if (newFinalReply) {
        // Update the final reply card
        const replyCard = parentEl.querySelector('.final-reply-card');
        if (replyCard) {
          replyCard.querySelector('.final-reply-card-body').textContent = newFinalReply;
        }
        dom.replyContent.textContent = newFinalReply;
        state.lastFullState.final_reply = newFinalReply;

        const aiMsg = {
          role: 'ai',
          text: '邮件已根据您的反馈重新生成，请查看上方更新后的邮件内容。如需进一步修改，请继续告诉我。',
          time: new Date(),
        };
        panel._convData.messages.push(aiMsg);
        messagesContainer.insertAdjacentHTML('beforeend', renderConversationMsg(aiMsg));
      } else {
        const aiMsg = {
          role: 'ai',
          text: '已收到您的信息。目前暂无新的邮件生成，请确认您的指令或补充更多信息。',
          time: new Date(),
        };
        panel._convData.messages.push(aiMsg);
        messagesContainer.insertAdjacentHTML('beforeend', renderConversationMsg(aiMsg));
      }
    } catch (err) {
      typingEl.remove();
      const errMsg = {
        role: 'ai',
        text: `处理时出错：${err.message}，请重试。`,
        time: new Date(),
      };
      panel._convData.messages.push(errMsg);
      messagesContainer.insertAdjacentHTML('beforeend', renderConversationMsg(errMsg));
    } finally {
      sendBtn.disabled = false;
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  input.addEventListener('input', () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 100) + 'px';
  });
}

function renderConversationMsg(msg) {
  const isAI = msg.role === 'ai';
  const timeStr = msg.time
    ? new Date(msg.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '';
  return `
    <div class="conversation-msg ${isAI ? 'msg-ai' : 'msg-human'}">
      <div class="conversation-msg-avatar">${isAI ? 'AI' : '客服'}</div>
      <div>
        <div class="conversation-msg-bubble">${escapeHtml(msg.text)}</div>
        <div class="conversation-msg-time">${timeStr}</div>
      </div>
    </div>
  `;
}

// ── Render Result (static, for history) ───
function renderResult(data) {
  dom.policyBadge.textContent = data.selected_policy || '';
  dom.policyBadge.hidden = !data.selected_policy;
  dom.langBadge.textContent = (data.detected_language || 'en').toUpperCase();
  dom.reviewBadge.textContent = data.review_passed ? '审核通过' : '审核未通过';
  dom.reviewBadge.className = `result-badge review-badge ${data.review_passed ? 'passed' : 'failed'}`;

  dom.replyContent.textContent = data.final_reply || '（未生成回复）';
  const replySection = $('.chain-reply-section');
  if (replySection) replySection.hidden = false;

  if (data.requires_human && data.human_tasks && data.human_tasks.length > 0) {
    dom.humanTasks.hidden = false;
    dom.humanTaskList.innerHTML = data.human_tasks
      .map(t => `<li>${escapeHtml(typeof t === 'string' ? t : (t.description || t.task || JSON.stringify(t)))}</li>`)
      .join('');
  } else {
    dom.humanTasks.hidden = true;
  }

  // Build static chain timeline
  const timeline = dom.chainTimeline;
  timeline.innerHTML = '';
  const steps = buildChainSteps(data);
  steps.forEach(step => {
    const el = createChainStepEl(step);
    timeline.appendChild(el);
  });

  // Bind toggle events
  timeline.querySelectorAll('.chain-step-header').forEach(h => {
    h.addEventListener('click', () => h.closest('.chain-step').classList.toggle('open'));
  });
  timeline.querySelectorAll('.chain-block-header').forEach(h => {
    h.addEventListener('click', (e) => {
      e.stopPropagation();
      h.closest('.chain-block').classList.toggle('open');
    });
  });
}

// ── Build chain steps from trace_log ──────
function buildChainSteps(data) {
  const steps = [];
  const trace = data.trace_log || [];

  // 1. Context Loader
  const ctxTrace = trace.find(t => t.node === 'load_context');
  steps.push({
    type: 'context', title: 'ContextLoader 上下文',
    subtitle: ctxTrace ? ctxTrace.detail : '加载客户记忆、品牌技能、语言检测',
    preview: `语言: ${data.detected_language || '?'}`,
    blocks: [],
  });

  // 2. Router
  if (data.selected_policy) {
    const infoEntries = data.basic_info && Object.keys(data.basic_info).length > 0
      ? Object.entries(data.basic_info).map(([k, v]) =>
          `<div><strong>${escapeHtml(k)}:</strong> ${escapeHtml(String(v || ''))}</div>`
        ).join('')
      : '';
    steps.push({
      type: 'router', title: 'Router 路由',
      subtitle: `匹配策略: ${data.selected_policy}`,
      preview: data.selected_policy,
      blocks: infoEntries ? [{ label: '提取的基本信息', content: infoEntries, type: 'info' }] : [],
    });
  }

  // 3. Retriever
  if (data.retrieved_knowledge) {
    steps.push({
      type: 'retriever', title: 'Retriever 检索',
      subtitle: `检索到 ${data.retrieved_knowledge.length} 字符`,
      preview: data.retrieved_knowledge.substring(0, 80),
      blocks: [{ label: '知识库匹配结果', content: `<pre>${escapeHtml(data.retrieved_knowledge)}</pre>`, type: 'data' }],
    });
  }

  // 4. Solver iterations + Tool calls
  if (data.thought_history && data.thought_history.length > 0) {
    let iterCount = 0;
    data.thought_history.forEach((step) => {
      const thought = step.thought || '';
      const action = step.action || '';

      if (action && action.startsWith('调用工具')) {
        const toolName = action.replace('调用工具: ', '').split('(')[0];
        const toolResult = data.tool_results ? data.tool_results[toolName] : null;
        if (thought) {
          iterCount++;
          steps.push({
            type: 'solver', title: `Solver 推理 #${iterCount}`,
            subtitle: `决策: 调用工具 ${toolName}`,
            preview: thought.substring(0, 80),
            blocks: [{ label: '思维过程', content: `<div class="chain-thought">${escapeHtml(thought)}</div>`, type: 'thought' }],
          });
        }
        steps.push({
          type: 'tool', title: `工具: ${toolName}`,
          subtitle: action,
          preview: '',
          blocks: [
            { label: '调用参数', content: `<pre>${escapeHtml(action)}</pre>`, type: 'data' },
            toolResult ? { label: '返回结果', content: `<pre>${escapeHtml(JSON.stringify(toolResult, null, 2))}</pre>`, type: 'data' } : null,
          ].filter(Boolean),
        });
      } else if (action === '生成回复') {
        if (thought) {
          iterCount++;
          steps.push({
            type: 'solver', title: `Solver 推理 #${iterCount}`,
            subtitle: '决策: 生成回复',
            preview: thought.substring(0, 80),
            blocks: [{ label: '思维过程', content: `<div class="chain-thought">${escapeHtml(thought)}</div>`, type: 'thought' }],
          });
        }
        steps.push({
          type: 'generator', title: 'Generator 生成',
          subtitle: '格式化为专业邮件',
          preview: '', blocks: [],
        });
      } else if (action === '标记人工处理') {
        if (thought) {
          steps.push({
            type: 'solver', title: 'Solver 推理',
            subtitle: '决策: 需要人工介入',
            preview: thought.substring(0, 80),
            blocks: [{ label: '思维过程', content: `<div class="chain-thought">${escapeHtml(thought)}</div>`, type: 'thought' }],
          });
        }
      }
    });
  }

  // 5. Reviewer
  if (data.review_passed !== undefined) {
    steps.push({
      type: 'reviewer', title: 'Reviewer 审核',
      subtitle: data.review_passed ? '质量检查通过' : '审核未通过，需要修改',
      preview: '', blocks: [],
    });
  }

  return steps;
}

// ── Create chain step DOM (for static rendering) ──
function createChainStepEl(step) {
  const el = document.createElement('div');
  el.className = 'chain-step';
  const hasBlocks = step.blocks && step.blocks.length > 0;

  const blocksHtml = hasBlocks ? step.blocks.map(b => `
    <div class="chain-block">
      <div class="chain-block-header">
        <svg class="chain-block-icon" viewBox="0 0 16 16" fill="none">
          ${b.type === 'data'
            ? '<rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/><path d="M5 7h6" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>'
            : '<circle cx="8" cy="8" r="5" stroke="currentColor" stroke-width="1.3"/><path d="M8 5.5v5M5.5 8h5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>'}
        </svg>
        <span class="chain-block-label">${escapeHtml(b.label)}</span>
        <span class="chain-block-status">完成</span>
        <span class="chain-block-chevron">${CHEVRON_SVG}</span>
      </div>
      <div class="chain-block-body">
        <div class="chain-block-content">${b.content}</div>
      </div>
    </div>
  `).join('') : '';

  el.innerHTML = `
    <div class="chain-step-header">
      <div class="chain-dot dot-${step.type}">${CHAIN_ICONS[step.type] || ''}</div>
      <div class="chain-step-info">
        <div class="chain-step-title">${escapeHtml(step.title)}</div>
        <div class="chain-step-subtitle">${escapeHtml(step.subtitle)}</div>
        ${step.preview ? `<div class="chain-preview">${escapeHtml(step.preview)}</div>` : ''}
      </div>
      <span class="chain-step-status status-done">完成</span>
      ${hasBlocks ? `<span class="chain-chevron">${CHEVRON_SVG}</span>` : ''}
    </div>
    ${hasBlocks ? `<div class="chain-step-body"><div class="chain-step-content">${blocksHtml}</div></div>` : ''}
  `;
  return el;
}

// ── Copy Button ───────────────────────────
function bindCopyBtn() {
  dom.copyBtn.addEventListener('click', () => {
    copyToClipboard(dom.replyContent.textContent);
  });
}

// ── Clear Button ──────────────────────────
function bindClearBtn() {
  dom.clearBtn.addEventListener('click', () => {
    dom.customerEmail.value = '';
    dom.subject.value = '';
    dom.body.value = '';
    dom.oldEmails.value = '';
    dom.autoExecute.checked = false;
    showOutput('empty');

    // Clean up dynamic elements
    const timeline = dom.chainTimeline;
    if (timeline) timeline.innerHTML = '';
    const parent = timeline?.parentElement;
    if (parent) {
      const fc = parent.querySelector('.final-reply-card');
      if (fc) fc.remove();
      const cp = parent.querySelector('.conversation-panel');
      if (cp) cp.remove();
      const fp = parent.querySelector('.faq-panel');
      if (fp) fp.remove();
    }

    dom.body.focus();
  });
}

// ── History ───────────────────────────────
function saveToHistory(payload, data) {
  const entry = {
    id: Date.now(),
    timestamp: Date.now(),
    brand: payload.brand,
    subject: payload.subject || '（无主题）',
    customerEmail: payload.customer_email,
    body: payload.body,
    reply: data.final_reply,
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

  dom.historyList.querySelectorAll('.history-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = parseInt(card.dataset.id);
      const entry = state.history.find(h => h.id === id);
      if (!entry) return;
      dom.customerEmail.value = entry.customerEmail || '';
      dom.brand.value = entry.brand || 'ohuhu';
      dom.subject.value = entry.subject || '';
      dom.body.value = entry.body || '';
      renderResult(entry.data);
      showOutput('result');
      switchView('compose');
    });
  });
}

// ── Settings: Sliders ─────────────────────
function bindSliders() {
  ['globalTemperature', 'maxReactIterations', 'maxReflections'].forEach(id => {
    const slider = $(`#${id}`);
    const display = $(`#${id}Value`);
    if (slider && display) {
      slider.addEventListener('input', () => {
        display.textContent = slider.value;
        saveSettings();
      });
    }
  });
  $$('.thinking-checkbox').forEach(cb => {
    cb.addEventListener('change', saveSettings);
  });
}

function saveSettings() {
  const settings = {
    temperature: $('#globalTemperature')?.value,
    maxReactIterations: $('#maxReactIterations')?.value,
    maxReflections: $('#maxReflections')?.value,
    thinking: {},
  };
  $$('.thinking-checkbox').forEach(cb => {
    settings.thinking[cb.dataset.node] = cb.checked;
  });
  localStorage.setItem('smartcs_settings', JSON.stringify(settings));
}

function loadSettings() {
  try {
    const raw = localStorage.getItem('smartcs_settings');
    if (!raw) return;
    const s = JSON.parse(raw);
    if (s.temperature != null) {
      const el = $('#globalTemperature');
      const d = $('#globalTemperatureValue');
      if (el) el.value = s.temperature;
      if (d) d.textContent = s.temperature;
    }
    if (s.maxReactIterations != null) {
      const el = $('#maxReactIterations');
      const d = $('#maxReactIterationsValue');
      if (el) el.value = s.maxReactIterations;
      if (d) d.textContent = s.maxReactIterations;
    }
    if (s.maxReflections != null) {
      const el = $('#maxReflections');
      const d = $('#maxReflectionsValue');
      if (el) el.value = s.maxReflections;
      if (d) d.textContent = s.maxReflections;
    }
    if (s.thinking) {
      Object.entries(s.thinking).forEach(([node, val]) => {
        const cb = $(`.thinking-checkbox[data-node="${node}"]`);
        if (cb) cb.checked = val;
      });
    }
  } catch { /* ignore */ }
}

// ── Settings: Connection Test ─────────────
function bindConnectionTest() {
  dom.testConnection.addEventListener('click', async () => {
    dom.connectionResult.className = 'connection-result';
    dom.connectionResult.style.display = 'none';
    dom.testConnection.disabled = true;
    dom.testConnection.textContent = '测试中...';
    try {
      const resp = await fetch(`${API_URL()}/health`, { signal: AbortSignal.timeout(5000) });
      const data = await resp.json();
      if (data.status === 'ok') {
        dom.connectionResult.className = 'connection-result success';
        dom.connectionResult.textContent = '连接成功！';
        dom.connectionResult.style.display = 'block';
        setSystemStatus('online');
      } else {
        throw new Error('异常响应');
      }
    } catch (err) {
      dom.connectionResult.className = 'connection-result error';
      dom.connectionResult.textContent = `连接失败：${err.message}`;
      dom.connectionResult.style.display = 'block';
      setSystemStatus('error');
    } finally {
      dom.testConnection.disabled = false;
      dom.testConnection.textContent = '测试连接';
    }
  });
}

// ── System Status ─────────────────────────
function setSystemStatus(status) {
  dom.statusDot.className = 'status-dot';
  if (status === 'online') {
    dom.statusDot.classList.add('online');
    dom.statusText.textContent = '系统在线';
  } else if (status === 'error') {
    dom.statusDot.classList.add('error');
    dom.statusText.textContent = '连接断开';
  } else {
    dom.statusText.textContent = '连接中...';
  }
}

// ── Prompt Config ─────────────────────────
const PROMPT_NODES = {
  router: { label: 'Router 系统提示词', key: 'router' },
  solver: { label: 'Solver 系统提示词', key: 'solver' },
  generator: { label: 'Generator 系统提示词', key: 'reply_generator' },
  reviewer: { label: 'Reviewer 系统提示词', key: 'reviewer' },
};

let currentPromptTab = 'router';

function switchPromptTab(tab) {
  currentPromptTab = tab;
  $$('.prompt-tab').forEach(t => t.classList.toggle('active', t.dataset.prompt === tab));
  const cfg = PROMPT_NODES[tab];
  const labelEl = $('#promptEditorLabel');
  const editor = $('#promptEditor');
  if (labelEl) labelEl.textContent = cfg.label;
  if (editor) {
    // Show custom prompt if set, otherwise show default (as placeholder or read-only hint)
    const customVal = state.customPrompts[cfg.key] || '';
    editor.value = customVal;
    // If no custom prompt, show default as placeholder
    const defaultPrompt = state.defaultPrompts[cfg.key] || '';
    editor.placeholder = defaultPrompt
      ? `默认提示词（只读预览）：\n${defaultPrompt.substring(0, 200)}${defaultPrompt.length > 200 ? '...' : ''}\n\n在此输入自定义提示词以覆盖默认值...`
      : '留空则使用后端默认提示词...';
    updateCharCount();
  }
}

function updateCharCount() {
  const editor = $('#promptEditor');
  const counter = $('#promptCharCount');
  if (editor && counter) counter.textContent = `${editor.value.length} 字符`;
}

function bindPromptConfig() {
  // Tab clicks
  $$('.prompt-tab').forEach(tab => {
    tab.addEventListener('click', () => switchPromptTab(tab.dataset.prompt));
  });

  // Editor input
  const promptEditor = $('#promptEditor');
  if (promptEditor) {
    promptEditor.addEventListener('input', updateCharCount);
  }

  // Save button
  const promptSaveBtn = $('#promptSaveBtn');
  if (promptSaveBtn) {
    promptSaveBtn.addEventListener('click', () => {
      const cfg = PROMPT_NODES[currentPromptTab];
      const editor = $('#promptEditor');
      if (!editor) return;
      const val = editor.value.trim();
      if (val) {
        state.customPrompts[cfg.key] = val;
      } else {
        delete state.customPrompts[cfg.key];
      }
      localStorage.setItem('smartcs_prompts', JSON.stringify(state.customPrompts));
      toast('提示词已保存', 'success');
    });
  }

  // Reset button
  const promptResetBtn = $('#promptResetBtn');
  if (promptResetBtn) {
    promptResetBtn.addEventListener('click', () => {
      const cfg = PROMPT_NODES[currentPromptTab];
      delete state.customPrompts[cfg.key];
      localStorage.setItem('smartcs_prompts', JSON.stringify(state.customPrompts));
      const editor = $('#promptEditor');
      if (editor) editor.value = '';
      updateCharCount();
      toast('已恢复默认提示词', 'success');
    });
  }

  // Init first tab
  switchPromptTab('router');
}

// ── Fetch default prompts from backend ────
async function fetchDefaultPrompts() {
  try {
    const resp = await fetch(`${API_URL()}/prompts`, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = await resp.json();
      state.defaultPrompts = data || {};
      // Refresh current prompt tab placeholder
      switchPromptTab(currentPromptTab);
    }
  } catch {
    // Silently fail; prompts will just have generic placeholder
  }
}

// ── Keyboard Shortcut ─────────────────────
function bindKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  });
}

// ── Init ──────────────────────────────────
async function init() {
  cacheDom();
  bindNavigation();
  bindSidebar();
  bindCopyBtn();
  bindClearBtn();
  bindSliders();
  bindConnectionTest();
  bindPromptConfig();
  bindKeyboardShortcuts();

  // Submit button
  dom.submitBtn.addEventListener('click', handleSubmit);

  // Load saved settings
  loadSettings();

  // Check system health
  try {
    const resp = await fetch(`${API_URL()}/health`, { signal: AbortSignal.timeout(5000) });
    const data = await resp.json();
    if (data.status === 'ok') setSystemStatus('online');
  } catch {
    setSystemStatus('error');
  }

  // Fetch model info
  try {
    const resp = await fetch(`${API_URL()}/info`, { signal: AbortSignal.timeout(5000) });
    const info = await resp.json();
    dom.modelBadge.textContent = info.llm_model || '--';
  } catch {
    dom.modelBadge.textContent = '--';
  }

  // Fetch default prompts
  fetchDefaultPrompts();

  // Render history
  renderHistory();
}

init();
