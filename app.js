/* Dayspring Personal Finance — single-file SPA */
(() => {
  'use strict';

  // ---------- Storage ----------
  const STORAGE_KEY = 'dayspring_finance_v1';

  const defaultState = () => ({
    settings: { currency: '₹', locale: 'en-IN' },
    accounts: [],
    cards: [],
    loans: [],
    people: [],     // { id, name, type:'lend'|'borrow', amount, dueDate, note, settled }
    txns: [],       // { id, type:'income'|'expense', amount, category, date, note, accountId? }
    categories: ['Food', 'Transport', 'Bills', 'Shopping', 'Entertainment', 'Health', 'Education', 'Rent', 'Salary', 'Investment', 'Other']
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return Object.assign(defaultState(), parsed);
    } catch (e) {
      return defaultState();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  // ---------- Utils ----------
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const fmt = (n) => {
    const num = Number(n) || 0;
    return state.settings.currency + num.toLocaleString(state.settings.locale, { maximumFractionDigits: 2, minimumFractionDigits: num % 1 === 0 ? 0 : 2 });
  };

  const fmtDate = (d) => {
    if (!d) return '—';
    const date = new Date(d);
    if (isNaN(date)) return '—';
    return date.toLocaleDateString(state.settings.locale, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const daysUntil = (d) => {
    if (!d) return null;
    const target = new Date(d);
    if (isNaN(target)) return null;
    const now = new Date(); now.setHours(0,0,0,0);
    target.setHours(0,0,0,0);
    return Math.round((target - now) / 86400000);
  };

  const escape = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  const toast = (msg) => {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast._tm);
    toast._tm = setTimeout(() => t.classList.remove('show'), 2200);
  };

  const confirmDialog = (msg) => new Promise(res => {
    openSheet('Confirm', `
      <p style="margin:0 0 18px 0;color:var(--text-dim);">${escape(msg)}</p>
      <div class="btn-row">
        <button class="btn secondary" id="cnfNo">Cancel</button>
        <button class="btn danger" id="cnfYes">Confirm</button>
      </div>
    `, () => {
      $('#cnfNo').onclick = () => { closeSheet(); res(false); };
      $('#cnfYes').onclick = () => { closeSheet(); res(true); };
    });
  });

  // ---------- Router ----------
  const routes = {};
  let currentRoute = 'home';

  function navigate(route) {
    currentRoute = route;
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.route === route));
    const view = routes[route] || routes.home;
    $('#app').innerHTML = view.render();
    $('#screenTitle').textContent = view.title;
    if (view.mount) view.mount();
    window.scrollTo(0, 0);
  }

  $$('.tab').forEach(t => t.addEventListener('click', () => navigate(t.dataset.route)));

  // ---------- Sheet ----------
  function openSheet(title, bodyHtml, onMount) {
    const root = $('#sheetRoot');
    root.innerHTML = `
      <div class="sheet-backdrop" id="shBack"></div>
      <div class="sheet" id="sh">
        <div class="sheet-handle"></div>
        <div class="sheet-header">
          <h3>${escape(title)}</h3>
          <button class="icon-btn" id="shClose" aria-label="Close">
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
        <div class="sheet-body">${bodyHtml}</div>
      </div>
    `;
    requestAnimationFrame(() => {
      $('#shBack').classList.add('open');
      $('#sh').classList.add('open');
    });
    $('#shClose').onclick = closeSheet;
    $('#shBack').onclick = closeSheet;
    if (onMount) onMount();
  }

  function closeSheet() {
    const back = $('#shBack');
    const sh = $('#sh');
    if (!back || !sh) return;
    back.classList.remove('open');
    sh.classList.remove('open');
    setTimeout(() => { $('#sheetRoot').innerHTML = ''; }, 250);
  }

  // ---------- Computed ----------
  const totals = () => {
    const bankTotal = state.accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
    const cardSpent = state.cards.reduce((s, c) => s + Number(c.spent || 0), 0);
    const loanRemain = state.loans.reduce((s, l) => s + Number(l.remaining || 0), 0);
    const lentOut = state.people.filter(p => p.type === 'lend' && !p.settled).reduce((s, p) => s + Number(p.amount || 0), 0);
    const borrowed = state.people.filter(p => p.type === 'borrow' && !p.settled).reduce((s, p) => s + Number(p.amount || 0), 0);
    const netWorth = bankTotal + lentOut - cardSpent - loanRemain - borrowed;
    const thisMonth = monthTotals();
    return { bankTotal, cardSpent, loanRemain, lentOut, borrowed, netWorth, ...thisMonth };
  };

  const monthTotals = () => {
    const now = new Date();
    const m = now.getMonth(), y = now.getFullYear();
    let inc = 0, exp = 0;
    state.txns.forEach(t => {
      const d = new Date(t.date);
      if (d.getMonth() === m && d.getFullYear() === y) {
        if (t.type === 'income') inc += Number(t.amount || 0);
        else exp += Number(t.amount || 0);
      }
    });
    return { monthIncome: inc, monthExpense: exp };
  };

  // ---------- HOME ----------
  routes.home = {
    title: 'Dashboard',
    render() {
      const t = totals();
      const recent = [...state.txns].sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
      const upcoming = upcomingDues();
      return `
        <div class="card">
          <h2>Net worth</h2>
          <div class="big" style="color: ${t.netWorth >= 0 ? 'var(--accent)' : 'var(--danger)'};">${fmt(t.netWorth)}</div>
          <div class="sub mt-8">${fmt(t.bankTotal)} in bank · ${fmt(t.cardSpent + t.loanRemain)} owed</div>
        </div>

        <div class="stat-grid">
          <div class="stat"><div class="label">In bank</div><div class="value pos">${fmt(t.bankTotal)}</div></div>
          <div class="stat"><div class="label">Card spent</div><div class="value neg">${fmt(t.cardSpent)}</div></div>
          <div class="stat"><div class="label">Loans left</div><div class="value neg">${fmt(t.loanRemain)}</div></div>
          <div class="stat"><div class="label">Lent out</div><div class="value pos">${fmt(t.lentOut)}</div></div>
        </div>

        <div class="stat-grid">
          <div class="stat"><div class="label">This month in</div><div class="value pos">${fmt(t.monthIncome)}</div></div>
          <div class="stat"><div class="label">This month out</div><div class="value neg">${fmt(t.monthExpense)}</div></div>
        </div>

        <div class="section-title">
          <span>Upcoming dues</span>
        </div>
        ${upcoming.length === 0 ? `<div class="card"><div class="text-dim" style="font-size:13.5px;">Nothing due in the next 14 days.</div></div>` :
          upcoming.map(u => `
            <div class="list-item">
              <div class="avatar" style="color:${u.color};">${u.icon}</div>
              <div class="meta">
                <div class="title">${escape(u.title)}</div>
                <div class="sub">${escape(u.sub)} · ${u.days <= 0 ? '<span class="text-danger">Overdue</span>' : 'in ' + u.days + 'd'}</div>
              </div>
              <div class="amount">${fmt(u.amount)}</div>
            </div>
          `).join('')}

        <div class="section-title">
          <span>Recent activity</span>
          <button onclick="App.navigate('more')">All</button>
        </div>
        ${recent.length === 0 ? `<div class="card"><div class="text-dim" style="font-size:13.5px;">No transactions yet. Tap + to add.</div></div>` :
          `<div class="card">${recent.map(txRowHtml).join('')}</div>`}

        <button class="fab" id="fabAdd" aria-label="Add">+</button>
      `;
    },
    mount() {
      $('#fabAdd').onclick = () => openTxForm();
    }
  };

  function upcomingDues() {
    const items = [];
    state.cards.forEach(c => {
      const days = daysUntil(c.dueDate);
      if (days !== null && days <= 14) {
        items.push({
          title: c.name + (c.last4 ? ' ····' + c.last4 : ''),
          sub: 'Card due ' + fmtDate(c.dueDate),
          amount: c.spent,
          days,
          icon: '💳',
          color: 'var(--info)'
        });
      }
    });
    state.loans.forEach(l => {
      const days = daysUntil(l.nextDueDate);
      if (days !== null && days <= 14) {
        items.push({
          title: l.name,
          sub: 'EMI due ' + fmtDate(l.nextDueDate),
          amount: l.emi,
          days,
          icon: '🏦',
          color: 'var(--warning)'
        });
      }
    });
    state.people.forEach(p => {
      if (p.settled) return;
      const days = daysUntil(p.dueDate);
      if (days !== null && days <= 14) {
        items.push({
          title: p.name,
          sub: (p.type === 'lend' ? 'They owe you' : 'You owe') + ' · ' + fmtDate(p.dueDate),
          amount: p.amount,
          days,
          icon: p.type === 'lend' ? '🤝' : '⏳',
          color: p.type === 'lend' ? 'var(--accent)' : 'var(--danger)'
        });
      }
    });
    return items.sort((a, b) => a.days - b.days);
  }

  function txRowHtml(t) {
    const isInc = t.type === 'income';
    const cat = t.category || 'Other';
    return `
      <div class="tx-row">
        <div class="tx-icon">${isInc ? '⬇️' : categoryIcon(cat)}</div>
        <div class="meta">
          <div class="title">${escape(t.note || cat)}</div>
          <div class="sub">${escape(cat)} · ${fmtDate(t.date)}</div>
        </div>
        <div class="amt ${isInc ? 'pos' : 'neg'}">${isInc ? '+' : '−'}${fmt(t.amount)}</div>
      </div>
    `;
  }

  function categoryIcon(c) {
    const map = { Food: '🍽️', Transport: '🚗', Bills: '🧾', Shopping: '🛍️', Entertainment: '🎬', Health: '⚕️', Education: '📚', Rent: '🏠', Salary: '💰', Investment: '📈', Other: '•' };
    return map[c] || '•';
  }

  // ---------- ACCOUNTS ----------
  routes.accounts = {
    title: 'Bank Accounts',
    render() {
      const total = state.accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
      return `
        <div class="card">
          <h2>Total balance</h2>
          <div class="big">${fmt(total)}</div>
          <div class="sub mt-8">${state.accounts.length} account${state.accounts.length === 1 ? '' : 's'}</div>
        </div>

        <div class="section-title">
          <span>Your accounts</span>
          <button id="addAcc">+ Add</button>
        </div>

        ${state.accounts.length === 0 ? emptyHtml('🏦', 'No bank accounts yet', 'Add your savings or checking accounts to track balances.') :
          state.accounts.map(a => `
            <div class="acc-card tappable" data-id="${a.id}">
              <div class="top">
                <div>
                  <div class="bank">${escape(a.bank || a.name)}</div>
                  <div class="last4">${a.type || 'Savings'}${a.last4 ? ' · ····' + escape(a.last4) : ''}</div>
                </div>
                <button class="icon-btn edit-acc" data-id="${a.id}" aria-label="Edit">
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
                </button>
              </div>
              <div class="balance">${fmt(a.balance)}</div>
            </div>
          `).join('')}

        <button class="fab" id="fabAcc" aria-label="Add account">+</button>
      `;
    },
    mount() {
      $('#fabAcc').onclick = () => openAccountForm();
      $('#addAcc')?.addEventListener('click', () => openAccountForm());
      $$('.edit-acc').forEach(b => b.addEventListener('click', (e) => {
        e.stopPropagation();
        openAccountForm(b.dataset.id);
      }));
    }
  };

  function openAccountForm(id) {
    const a = id ? state.accounts.find(x => x.id === id) : { id: uid(), bank: '', type: 'Savings', last4: '', balance: 0 };
    openSheet(id ? 'Edit account' : 'Add bank account', `
      <div class="field">
        <label>Bank name</label>
        <input id="fBank" value="${escape(a.bank || '')}" placeholder="e.g. HDFC Bank" />
      </div>
      <div class="field-row">
        <div class="field">
          <label>Type</label>
          <select id="fType">
            ${['Savings','Current','Salary','NRE','NRO','Other'].map(t => `<option ${a.type===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Last 4 digits</label>
          <input id="fLast4" value="${escape(a.last4 || '')}" inputmode="numeric" maxlength="4" />
        </div>
      </div>
      <div class="field">
        <label>Balance</label>
        <input id="fBal" type="number" step="0.01" value="${a.balance || 0}" />
      </div>
      <div class="btn-row">
        ${id ? '<button class="btn danger" id="fDel">Delete</button>' : ''}
        <button class="btn" id="fSave">${id ? 'Save' : 'Add account'}</button>
      </div>
    `, () => {
      $('#fSave').onclick = () => {
        a.bank = $('#fBank').value.trim();
        a.type = $('#fType').value;
        a.last4 = $('#fLast4').value.trim();
        a.balance = Number($('#fBal').value) || 0;
        if (!a.bank) { toast('Bank name required'); return; }
        if (!id) state.accounts.push(a);
        save(); closeSheet(); navigate('accounts'); toast(id ? 'Account updated' : 'Account added');
      };
      $('#fDel')?.addEventListener('click', async () => {
        if (await confirmDialog('Delete this account?')) {
          state.accounts = state.accounts.filter(x => x.id !== id);
          save(); closeSheet(); navigate('accounts'); toast('Account deleted');
        }
      });
    });
  }

  // ---------- CARDS ----------
  routes.cards = {
    title: 'Credit Cards',
    render() {
      const totalSpent = state.cards.reduce((s, c) => s + Number(c.spent || 0), 0);
      const totalLimit = state.cards.reduce((s, c) => s + Number(c.limit || 0), 0);
      const util = totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 100) : 0;
      return `
        <div class="card">
          <h2>Total card spend</h2>
          <div class="big">${fmt(totalSpent)}</div>
          <div class="sub mt-8">${state.cards.length} card${state.cards.length===1?'':'s'} · ${util}% utilization ${totalLimit ? 'of ' + fmt(totalLimit) : ''}</div>
          ${totalLimit > 0 ? `<div class="bar"><div class="${util > 80 ? 'danger' : util > 50 ? 'warning' : 'success'}" style="width:${Math.min(util,100)}%"></div></div>` : ''}
        </div>

        <div class="section-title">
          <span>Your cards</span>
          <button id="addCard">+ Add</button>
        </div>

        ${state.cards.length === 0 ? emptyHtml('💳', 'No credit cards yet', 'Track statement spend and due dates across all your cards.') :
          state.cards.map((c, i) => {
            const days = daysUntil(c.dueDate);
            const dueBadge = days === null ? '' :
              days < 0 ? `<span class="pill danger">Overdue ${Math.abs(days)}d</span>` :
              days === 0 ? `<span class="pill danger">Due today</span>` :
              days <= 5 ? `<span class="pill warning">Due in ${days}d</span>` :
              `<span class="pill">${days}d</span>`;
            const grad = 'cc-grad-' + ((i % 8) + 1);
            return `
              <div class="cc-card ${grad}" data-id="${c.id}" id="cc-${c.id}">
                <div class="row-top">
                  <div>
                    <div class="name">${escape(c.name)}${c.last4 ? ' ····' + escape(c.last4) : ''}</div>
                    <div class="net">${escape(c.network || 'Credit Card')}</div>
                  </div>
                  ${dueBadge}
                </div>
                <div class="spent-label">Statement spent</div>
                <div class="spent">${fmt(c.spent)}</div>
                <div class="dates">
                  <div><div class="lbl">Statement</div>${fmtDate(c.statementDate)}</div>
                  <div><div class="lbl">Due</div>${fmtDate(c.dueDate)}</div>
                  <div><div class="lbl">Limit</div>${c.limit ? fmt(c.limit) : '—'}</div>
                </div>
              </div>
            `;
          }).join('')}

        <button class="fab" id="fabCard" aria-label="Add card">+</button>
      `;
    },
    mount() {
      $('#fabCard').onclick = () => openCardForm();
      $('#addCard')?.addEventListener('click', () => openCardForm());
      $$('.cc-card').forEach(el => el.addEventListener('click', () => openCardForm(el.dataset.id)));
    }
  };

  function openCardForm(id) {
    const c = id ? state.cards.find(x => x.id === id) : { id: uid(), name: '', network: 'Visa', last4: '', spent: 0, limit: 0, statementDate: '', dueDate: '' };
    openSheet(id ? 'Edit card' : 'Add credit card', `
      <div class="field">
        <label>Card name / Bank</label>
        <input id="fName" value="${escape(c.name)}" placeholder="e.g. HDFC Regalia" />
      </div>
      <div class="field-row">
        <div class="field">
          <label>Network</label>
          <select id="fNet">
            ${['Visa','Mastercard','Amex','Rupay','Discover','Diners','Other'].map(n => `<option ${c.network===n?'selected':''}>${n}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Last 4 digits</label>
          <input id="fLast4" value="${escape(c.last4 || '')}" inputmode="numeric" maxlength="4" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Statement spent</label>
          <input id="fSpent" type="number" step="0.01" value="${c.spent || 0}" />
        </div>
        <div class="field">
          <label>Credit limit</label>
          <input id="fLim" type="number" step="0.01" value="${c.limit || 0}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Statement date</label>
          <input id="fStmt" type="date" value="${c.statementDate || ''}" />
        </div>
        <div class="field">
          <label>Due date</label>
          <input id="fDue" type="date" value="${c.dueDate || ''}" />
        </div>
      </div>
      <div class="btn-row">
        ${id ? '<button class="btn danger" id="fDel">Delete</button>' : ''}
        <button class="btn" id="fSave">${id ? 'Save' : 'Add card'}</button>
      </div>
    `, () => {
      $('#fSave').onclick = () => {
        c.name = $('#fName').value.trim();
        c.network = $('#fNet').value;
        c.last4 = $('#fLast4').value.trim();
        c.spent = Number($('#fSpent').value) || 0;
        c.limit = Number($('#fLim').value) || 0;
        c.statementDate = $('#fStmt').value;
        c.dueDate = $('#fDue').value;
        if (!c.name) { toast('Card name required'); return; }
        if (!id) state.cards.push(c);
        save(); closeSheet(); navigate('cards'); toast(id ? 'Card updated' : 'Card added');
      };
      $('#fDel')?.addEventListener('click', async () => {
        if (await confirmDialog('Delete this card?')) {
          state.cards = state.cards.filter(x => x.id !== id);
          save(); closeSheet(); navigate('cards'); toast('Card deleted');
        }
      });
    });
  }

  // ---------- LOANS ----------
  routes.loans = {
    title: 'Loans',
    render() {
      const totalRem = state.loans.reduce((s, l) => s + Number(l.remaining || 0), 0);
      const totalEmi = state.loans.reduce((s, l) => s + Number(l.emi || 0), 0);
      return `
        <div class="card">
          <h2>Total outstanding</h2>
          <div class="big">${fmt(totalRem)}</div>
          <div class="sub mt-8">${state.loans.length} loan${state.loans.length===1?'':'s'} · ${fmt(totalEmi)}/mo in EMIs</div>
        </div>

        <div class="section-title">
          <span>Your loans</span>
          <button id="addLoan">+ Add</button>
        </div>

        ${state.loans.length === 0 ? emptyHtml('🏠', 'No loans yet', 'Track home, car, and personal loans here.') :
          state.loans.map(l => {
            const pct = l.principal > 0 ? Math.round(((l.principal - l.remaining) / l.principal) * 100) : 0;
            const days = daysUntil(l.nextDueDate);
            const dueLabel = days === null ? '—' :
              days < 0 ? `<span class="text-danger">Overdue ${Math.abs(days)}d</span>` :
              days === 0 ? `<span class="text-danger">Due today</span>` :
              `In ${days}d`;
            return `
              <div class="card loan-card tappable" data-id="${l.id}">
                <div class="top">
                  <div>
                    <div class="name">${escape(l.name)}</div>
                    <div class="principal">${escape(l.type || 'Loan')} · ${fmt(l.principal || 0)} principal</div>
                  </div>
                  <span class="pill ${days !== null && days <= 5 ? 'warning' : ''}">${pct}% paid</span>
                </div>
                <div class="remaining">${fmt(l.remaining)}</div>
                <div class="bar"><div class="success" style="width:${pct}%"></div></div>
                <div class="stats">
                  <div><div class="lbl">EMI</div><div class="v">${fmt(l.emi || 0)}</div></div>
                  <div><div class="lbl">Next due</div><div class="v">${dueLabel}</div></div>
                  <div><div class="lbl">Rate</div><div class="v">${l.rate ? l.rate + '%' : '—'}</div></div>
                </div>
              </div>
            `;
          }).join('')}

        <button class="fab" id="fabLoan" aria-label="Add loan">+</button>
      `;
    },
    mount() {
      $('#fabLoan').onclick = () => openLoanForm();
      $('#addLoan')?.addEventListener('click', () => openLoanForm());
      $$('.loan-card').forEach(el => el.addEventListener('click', () => openLoanForm(el.dataset.id)));
    }
  };

  function openLoanForm(id) {
    const l = id ? state.loans.find(x => x.id === id) : { id: uid(), name: '', type: 'Home', principal: 0, remaining: 0, emi: 0, rate: 0, nextDueDate: '', startDate: '' };
    openSheet(id ? 'Edit loan' : 'Add loan', `
      <div class="field">
        <label>Loan name / Lender</label>
        <input id="fName" value="${escape(l.name)}" placeholder="e.g. HDFC Home Loan" />
      </div>
      <div class="field">
        <label>Type</label>
        <select id="fType">
          ${['Home','Car','Personal','Education','Business','Gold','Other'].map(t => `<option ${l.type===t?'selected':''}>${t}</option>`).join('')}
        </select>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Principal</label>
          <input id="fPrin" type="number" step="0.01" value="${l.principal || 0}" />
        </div>
        <div class="field">
          <label>Remaining</label>
          <input id="fRem" type="number" step="0.01" value="${l.remaining || 0}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Monthly EMI</label>
          <input id="fEmi" type="number" step="0.01" value="${l.emi || 0}" />
        </div>
        <div class="field">
          <label>Interest rate (%)</label>
          <input id="fRate" type="number" step="0.01" value="${l.rate || 0}" />
        </div>
      </div>
      <div class="field">
        <label>Next EMI due date</label>
        <input id="fDue" type="date" value="${l.nextDueDate || ''}" />
      </div>
      <div class="btn-row">
        ${id ? '<button class="btn danger" id="fDel">Delete</button>' : ''}
        <button class="btn" id="fSave">${id ? 'Save' : 'Add loan'}</button>
      </div>
    `, () => {
      $('#fSave').onclick = () => {
        l.name = $('#fName').value.trim();
        l.type = $('#fType').value;
        l.principal = Number($('#fPrin').value) || 0;
        l.remaining = Number($('#fRem').value) || 0;
        l.emi = Number($('#fEmi').value) || 0;
        l.rate = Number($('#fRate').value) || 0;
        l.nextDueDate = $('#fDue').value;
        if (!l.name) { toast('Loan name required'); return; }
        if (!id) state.loans.push(l);
        save(); closeSheet(); navigate('loans'); toast(id ? 'Loan updated' : 'Loan added');
      };
      $('#fDel')?.addEventListener('click', async () => {
        if (await confirmDialog('Delete this loan?')) {
          state.loans = state.loans.filter(x => x.id !== id);
          save(); closeSheet(); navigate('loans'); toast('Loan deleted');
        }
      });
    });
  }

  // ---------- PEOPLE (lend/borrow) ----------
  routes.people = {
    title: 'Lending & Borrowing',
    render() {
      const lent = state.people.filter(p => p.type === 'lend' && !p.settled);
      const borrowed = state.people.filter(p => p.type === 'borrow' && !p.settled);
      const settled = state.people.filter(p => p.settled);
      const lentSum = lent.reduce((s, p) => s + Number(p.amount || 0), 0);
      const borrowSum = borrowed.reduce((s, p) => s + Number(p.amount || 0), 0);
      const net = lentSum - borrowSum;
      return `
        <div class="card">
          <h2>Net position</h2>
          <div class="big" style="color: ${net >= 0 ? 'var(--accent)' : 'var(--danger)'};">${net >= 0 ? '+' : '−'}${fmt(Math.abs(net))}</div>
          <div class="sub mt-8">${fmt(lentSum)} to receive · ${fmt(borrowSum)} to pay</div>
        </div>

        <div class="section-title">
          <span>People owe you</span>
          <button id="addLend">+ Lent</button>
        </div>
        ${lent.length === 0 ? `<div class="card"><div class="text-dim" style="font-size:13px;">No one owes you anything.</div></div>` :
          lent.map(p => personRow(p)).join('')}

        <div class="section-title">
          <span>You owe</span>
          <button id="addBorrow">+ Borrowed</button>
        </div>
        ${borrowed.length === 0 ? `<div class="card"><div class="text-dim" style="font-size:13px;">You don't owe anyone right now.</div></div>` :
          borrowed.map(p => personRow(p)).join('')}

        ${settled.length > 0 ? `
          <div class="section-title"><span>Settled</span></div>
          ${settled.map(p => personRow(p)).join('')}
        ` : ''}

        <button class="fab" id="fabP" aria-label="Add">+</button>
      `;
    },
    mount() {
      $('#fabP').onclick = () => openPersonForm(null, 'lend');
      $('#addLend')?.addEventListener('click', () => openPersonForm(null, 'lend'));
      $('#addBorrow')?.addEventListener('click', () => openPersonForm(null, 'borrow'));
      $$('.person-row').forEach(el => el.addEventListener('click', () => openPersonForm(el.dataset.id)));
    }
  };

  function personRow(p) {
    const days = daysUntil(p.dueDate);
    const dueBadge = p.settled ? '<span class="pill success">Settled</span>' :
      days === null ? '' :
      days < 0 ? `<span class="pill danger">Overdue ${Math.abs(days)}d</span>` :
      days === 0 ? `<span class="pill danger">Today</span>` :
      days <= 7 ? `<span class="pill warning">${days}d</span>` : '';
    return `
      <div class="list-item person-row tappable" data-id="${p.id}">
        <div class="avatar">${escape((p.name || '?').charAt(0).toUpperCase())}</div>
        <div class="meta">
          <div class="title">${escape(p.name)}</div>
          <div class="sub">${p.type === 'lend' ? 'Lent on' : 'Borrowed on'} ${fmtDate(p.date)} ${p.note ? '· ' + escape(p.note) : ''}</div>
        </div>
        <div class="amount">
          <div class="${p.type==='lend'?'receive':'owe'}">${p.type === 'lend' ? '+' : '−'}${fmt(p.amount)}</div>
          ${dueBadge}
        </div>
      </div>
    `;
  }

  function openPersonForm(id, defaultType = 'lend') {
    const p = id ? state.people.find(x => x.id === id) :
      { id: uid(), name: '', type: defaultType, amount: 0, date: new Date().toISOString().slice(0,10), dueDate: '', note: '', settled: false };
    openSheet(id ? 'Edit entry' : (defaultType === 'lend' ? 'Money you lent' : 'Money you borrowed'), `
      <div class="segmented" style="margin-bottom:14px;">
        <button data-t="lend" class="${p.type==='lend'?'active':''}">I lent</button>
        <button data-t="borrow" class="${p.type==='borrow'?'active':''}">I borrowed</button>
      </div>
      <div class="field">
        <label>Person's name</label>
        <input id="fName" value="${escape(p.name)}" placeholder="e.g. Rahul" />
      </div>
      <div class="field-row">
        <div class="field">
          <label>Amount</label>
          <input id="fAmt" type="number" step="0.01" value="${p.amount || 0}" />
        </div>
        <div class="field">
          <label>Date</label>
          <input id="fDate" type="date" value="${p.date || ''}" />
        </div>
      </div>
      <div class="field">
        <label>Due date (optional)</label>
        <input id="fDue" type="date" value="${p.dueDate || ''}" />
      </div>
      <div class="field">
        <label>Note (optional)</label>
        <input id="fNote" value="${escape(p.note || '')}" placeholder="e.g. for emergency" />
      </div>
      ${id ? `
        <div class="field">
          <label>Status</label>
          <div class="segmented">
            <button id="stOpen" class="${!p.settled?'active':''}">Open</button>
            <button id="stSettle" class="${p.settled?'active':''}">Settled</button>
          </div>
        </div>
      ` : ''}
      <div class="btn-row">
        ${id ? '<button class="btn danger" id="fDel">Delete</button>' : ''}
        <button class="btn" id="fSave">${id ? 'Save' : 'Add'}</button>
      </div>
    `, () => {
      $$('.segmented [data-t]').forEach(b => b.onclick = () => {
        p.type = b.dataset.t;
        $$('.segmented [data-t]').forEach(x => x.classList.toggle('active', x.dataset.t === p.type));
      });
      if (id) {
        $('#stOpen').onclick = () => { p.settled = false; $('#stOpen').classList.add('active'); $('#stSettle').classList.remove('active'); };
        $('#stSettle').onclick = () => { p.settled = true; $('#stSettle').classList.add('active'); $('#stOpen').classList.remove('active'); };
      }
      $('#fSave').onclick = () => {
        p.name = $('#fName').value.trim();
        p.amount = Number($('#fAmt').value) || 0;
        p.date = $('#fDate').value;
        p.dueDate = $('#fDue').value;
        p.note = $('#fNote').value.trim();
        if (!p.name) { toast('Name required'); return; }
        if (!id) state.people.push(p);
        save(); closeSheet(); navigate('people'); toast(id ? 'Updated' : 'Added');
      };
      $('#fDel')?.addEventListener('click', async () => {
        if (await confirmDialog('Delete this entry?')) {
          state.people = state.people.filter(x => x.id !== id);
          save(); closeSheet(); navigate('people'); toast('Deleted');
        }
      });
    });
  }

  // ---------- MORE / EXPENSES ----------
  routes.more = {
    title: 'Expenses & More',
    render() {
      const txns = [...state.txns].sort((a,b) => new Date(b.date) - new Date(a.date));
      const monthGroups = groupByMonth(txns);
      const monthsKeys = Object.keys(monthGroups);
      const byCat = byCategoryThisMonth();
      const topCats = byCat.slice(0, 5);
      const t = monthTotals();
      return `
        <div class="stat-grid">
          <div class="stat"><div class="label">Income (mo)</div><div class="value pos">${fmt(t.monthIncome)}</div></div>
          <div class="stat"><div class="label">Spent (mo)</div><div class="value neg">${fmt(t.monthExpense)}</div></div>
        </div>

        ${topCats.length > 0 ? `
          <div class="section-title"><span>Top categories this month</span></div>
          <div class="card">
            ${topCats.map(c => {
              const max = topCats[0].amount;
              const pct = max > 0 ? Math.round((c.amount / max) * 100) : 0;
              return `
                <div style="margin-bottom:12px;">
                  <div class="row-between" style="font-size:13.5px;">
                    <div>${categoryIcon(c.cat)} ${escape(c.cat)}</div>
                    <div style="font-weight:600;">${fmt(c.amount)}</div>
                  </div>
                  <div class="bar"><div style="width:${pct}%"></div></div>
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}

        <div class="section-title">
          <span>All transactions</span>
          <button id="addTx">+ Add</button>
        </div>

        ${monthsKeys.length === 0 ? emptyHtml('💸', 'No transactions yet', 'Track every expense and income here.') :
          monthsKeys.map(mk => `
            <div class="text-mute" style="font-size:11.5px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;margin:14px 4px 6px;">${escape(mk)}</div>
            <div class="card">${monthGroups[mk].map(t => `
              <div class="tx-row tappable" data-id="${t.id}">
                <div class="tx-icon">${t.type==='income' ? '⬇️' : categoryIcon(t.category)}</div>
                <div class="meta">
                  <div class="title">${escape(t.note || t.category || 'Transaction')}</div>
                  <div class="sub">${escape(t.category || '')} · ${fmtDate(t.date)}</div>
                </div>
                <div class="amt ${t.type==='income'?'pos':'neg'}">${t.type==='income'?'+':'−'}${fmt(t.amount)}</div>
              </div>
            `).join('')}</div>
          `).join('')}

        <div class="section-title"><span>Data</span></div>
        <div class="card">
          <div class="btn-row">
            <button class="btn secondary" id="exportBtn">Export JSON</button>
            <button class="btn secondary" id="importBtn">Import JSON</button>
          </div>
          <div class="btn-row" style="margin-top:10px;">
            <button class="btn danger" id="resetBtn" style="flex:1;">Reset all data</button>
          </div>
          <input type="file" id="importFile" accept="application/json" style="display:none;" />
        </div>

        <button class="fab" id="fabTx" aria-label="Add transaction">+</button>
      `;
    },
    mount() {
      $('#fabTx').onclick = () => openTxForm();
      $('#addTx')?.addEventListener('click', () => openTxForm());
      $$('.tx-row.tappable').forEach(el => el.addEventListener('click', () => openTxForm(el.dataset.id)));
      $('#exportBtn').onclick = exportData;
      $('#importBtn').onclick = () => $('#importFile').click();
      $('#importFile').onchange = importData;
      $('#resetBtn').onclick = async () => {
        if (await confirmDialog('Erase everything and start fresh?')) {
          localStorage.removeItem(STORAGE_KEY);
          state = defaultState();
          navigate('home');
          toast('All data reset');
        }
      };
    }
  };

  function groupByMonth(txns) {
    const out = {};
    txns.forEach(t => {
      const d = new Date(t.date);
      if (isNaN(d)) return;
      const key = d.toLocaleString(state.settings.locale, { month: 'long', year: 'numeric' });
      (out[key] ||= []).push(t);
    });
    return out;
  }

  function byCategoryThisMonth() {
    const now = new Date();
    const m = now.getMonth(), y = now.getFullYear();
    const map = {};
    state.txns.forEach(t => {
      if (t.type !== 'expense') return;
      const d = new Date(t.date);
      if (d.getMonth() !== m || d.getFullYear() !== y) return;
      const cat = t.category || 'Other';
      map[cat] = (map[cat] || 0) + Number(t.amount || 0);
    });
    return Object.entries(map).map(([cat, amount]) => ({ cat, amount })).sort((a,b) => b.amount - a.amount);
  }

  function openTxForm(id) {
    const t = id ? state.txns.find(x => x.id === id) :
      { id: uid(), type: 'expense', amount: 0, category: 'Food', date: new Date().toISOString().slice(0,10), note: '', accountId: '' };
    const cats = state.categories;
    openSheet(id ? 'Edit transaction' : 'Add transaction', `
      <div class="segmented" style="margin-bottom:14px;">
        <button data-t="expense" class="${t.type==='expense'?'active':''}">Expense</button>
        <button data-t="income" class="${t.type==='income'?'active':''}">Income</button>
      </div>
      <div class="field">
        <label>Amount</label>
        <input id="fAmt" type="number" step="0.01" value="${t.amount || ''}" placeholder="0.00" autofocus />
      </div>
      <div class="field">
        <label>Category</label>
        <div class="chip-row" id="catRow">
          ${cats.map(c => `<button class="chip ${t.category===c?'active':''}" data-c="${escape(c)}">${categoryIcon(c)} ${escape(c)}</button>`).join('')}
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Date</label>
          <input id="fDate" type="date" value="${t.date || ''}" />
        </div>
        <div class="field">
          <label>From account (optional)</label>
          <select id="fAcc">
            <option value="">—</option>
            ${state.accounts.map(a => `<option value="${a.id}" ${t.accountId===a.id?'selected':''}>${escape(a.bank || a.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label>Note (optional)</label>
        <input id="fNote" value="${escape(t.note || '')}" placeholder="e.g. groceries" />
      </div>
      <div class="btn-row">
        ${id ? '<button class="btn danger" id="fDel">Delete</button>' : ''}
        <button class="btn" id="fSave">${id ? 'Save' : 'Add'}</button>
      </div>
    `, () => {
      $$('.segmented [data-t]').forEach(b => b.onclick = () => {
        t.type = b.dataset.t;
        $$('.segmented [data-t]').forEach(x => x.classList.toggle('active', x.dataset.t === t.type));
      });
      $$('#catRow .chip').forEach(b => b.onclick = () => {
        t.category = b.dataset.c;
        $$('#catRow .chip').forEach(x => x.classList.toggle('active', x.dataset.c === t.category));
      });
      $('#fSave').onclick = () => {
        t.amount = Number($('#fAmt').value) || 0;
        t.date = $('#fDate').value;
        t.note = $('#fNote').value.trim();
        t.accountId = $('#fAcc').value;
        if (t.amount <= 0) { toast('Enter an amount'); return; }
        if (!id) state.txns.push(t);
        if (t.accountId) {
          const a = state.accounts.find(x => x.id === t.accountId);
          if (a) {
            const delta = (t.type === 'income' ? 1 : -1) * t.amount;
            a.balance = Number(a.balance || 0) + delta;
          }
        }
        save(); closeSheet(); navigate(currentRoute); toast(id ? 'Updated' : 'Added');
      };
      $('#fDel')?.addEventListener('click', async () => {
        if (await confirmDialog('Delete this transaction?')) {
          state.txns = state.txns.filter(x => x.id !== id);
          save(); closeSheet(); navigate(currentRoute); toast('Deleted');
        }
      });
    });
  }

  // ---------- Empty state helper ----------
  function emptyHtml(emoji, title, sub) {
    return `<div class="empty"><div class="emoji">${emoji}</div><h3>${escape(title)}</h3><p>${escape(sub)}</p></div>`;
  }

  // ---------- Import/Export ----------
  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dayspring-finance-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Exported');
  }

  function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        state = Object.assign(defaultState(), data);
        save();
        navigate(currentRoute);
        toast('Imported successfully');
      } catch (err) {
        toast('Invalid file');
      }
    };
    reader.readAsText(file);
  }

  // ---------- Boot ----------
  window.App = { navigate };
  navigate('home');
})();
