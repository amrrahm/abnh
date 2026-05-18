(function () {
  'use strict';

  var KEYS = {
    session: 'alfredCenter.lastSession.v1',
    notes: 'alfredCenter.fileNotes.v1',
    preset: 'alfredCenter.themePreset.v1',
    shortcutsHint: 'alfredCenter.shortcutsHint.v1',
    focus: 'alfredCenter.focusMode.v1'
  };

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {}
  }

  function nowText() {
    try {
      return new Date().toLocaleString('ar-EG');
    } catch (e) {
      return new Date().toISOString();
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(message) {
    var host = document.getElementById('alfredToast');
    if (!host) {
      host = document.createElement('div');
      host.id = 'alfredToast';
      host.className = 'alfred-toast';
      document.body.appendChild(host);
    }
    host.textContent = message;
    host.classList.add('show');
    clearTimeout(host.__timer);
    host.__timer = setTimeout(function () {
      host.classList.remove('show');
    }, 2200);
  }

  function currentTabId() {
    var active = $('.main-content.active');
    return active ? active.id : 'tab1';
  }

  function currentTabLabel() {
    var tabId = currentTabId();
    var el = document.getElementById('tabLabelText_' + tabId);
    if (el && el.textContent.trim()) return el.textContent.trim();
    var activeBtn = $('.tab-btn.active');
    return activeBtn ? activeBtn.textContent.replace(/\s+/g, ' ').trim() : tabId;
  }

  function currentViewerTitle() {
    var el = document.getElementById('viewerTitle');
    return el ? String(el.textContent || '').trim() : '';
  }

  function activeRows() {
    return $all('#' + currentTabId() + ' .judgment-row');
  }

  function rowTitle(row) {
    var el = $('.main-name', row);
    return el ? String(el.textContent || '').trim() : '';
  }

  function rowMeta(row) {
    var el = $('.size-info', row);
    return el ? String(el.textContent || '').trim() : '';
  }

  function dispatchSearch(value) {
    var input = document.getElementById('searchInput');
    if (!input) return;
    input.value = value || '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function findRowByTitle(title) {
    title = String(title || '').trim();
    if (!title) return null;
    var rows = activeRows();
    for (var i = 0; i < rows.length; i++) {
      if (rowTitle(rows[i]) === title) return rows[i];
    }
    return null;
  }

  function smartOpenByTitle(title) {
    title = String(title || '').trim();
    if (!title) {
      toast('لا يوجد عنصر لفتحه الآن.');
      return;
    }
    dispatchSearch(title);
    setTimeout(function () {
      var row = findRowByTitle(title);
      if (!row) {
        toast('تم تجهيز البحث. اضغط على النتيجة المناسبة للفتح.');
        return;
      }
      row.click();
      toast('تم تجهيز الملف: ' + title);
    }, 160);
  }

  function getNotesMap() {
    var map = readJson(KEYS.notes, {});
    return map && typeof map === 'object' ? map : {};
  }

  function getCurrentNote() {
    var title = currentViewerTitle();
    if (!title) return '';
    return String(getNotesMap()[title] || '');
  }

  function saveCurrentNote(text) {
    var title = currentViewerTitle();
    if (!title) return;
    var map = getNotesMap();
    if (String(text || '').trim()) map[title] = String(text || '');
    else delete map[title];
    writeJson(KEYS.notes, map);
    renderAlfredSnapshot();
  }

  function getLastSession() {
    var session = readJson(KEYS.session, null);
    return session && typeof session === 'object' ? session : null;
  }

  function persistCurrentSession() {
    var title = currentViewerTitle();
    if (!title) return;
    writeJson(KEYS.session, {
      title: title,
      tabId: currentTabId(),
      tabLabel: currentTabLabel(),
      at: nowText()
    });
    renderAlfredSnapshot();
  }

  function applyThemePreset(name) {
    var presets = {
      royal: {
        label: 'ملكي',
        primary: '#6366F1',
        primaryDark: '#4338CA',
        primaryLight: '#818CF8',
        accent: '#EC4899',
        accent2: '#F59E0B'
      },
      emerald: {
        label: 'زمردي',
        primary: '#0F766E',
        primaryDark: '#115E59',
        primaryLight: '#14B8A6',
        accent: '#22C55E',
        accent2: '#06B6D4'
      },
      sunset: {
        label: 'غروب',
        primary: '#EA580C',
        primaryDark: '#C2410C',
        primaryLight: '#FB923C',
        accent: '#EF4444',
        accent2: '#FACC15'
      },
      midnight: {
        label: 'ليلي',
        primary: '#334155',
        primaryDark: '#0F172A',
        primaryLight: '#64748B',
        accent: '#8B5CF6',
        accent2: '#38BDF8'
      }
    };
    var preset = presets[name] || presets.royal;
    var root = document.documentElement;
    root.style.setProperty('--primary', preset.primary);
    root.style.setProperty('--primary-dark', preset.primaryDark);
    root.style.setProperty('--primary-light', preset.primaryLight);
    root.style.setProperty('--accent', preset.accent);
    root.style.setProperty('--accent2', preset.accent2);
    document.body.setAttribute('data-alfred-preset', name);
    localStorage.setItem(KEYS.preset, name);
    $all('.alfred-preset-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-preset') === name);
    });
    var badge = document.getElementById('alfredPresetBadge');
    if (badge) badge.textContent = 'الثيم الحالي: ' + preset.label;
  }

  function setFocusMode(force) {
    var viewer = document.getElementById('viewerModal');
    if (!viewer) return;
    var next = typeof force === 'boolean' ? force : !viewer.classList.contains('alfred-focus-mode');
    viewer.classList.toggle('alfred-focus-mode', next);
    localStorage.setItem(KEYS.focus, next ? '1' : '0');
    var btn = document.getElementById('alfredFocusBtn');
    if (btn) btn.textContent = next ? '🧘 إنهاء وضع التركيز' : '🎯 وضع التركيز';
    var viewerBtn = document.getElementById('alfredViewerFocusBtn');
    if (viewerBtn) viewerBtn.textContent = next ? '🧘 إنهاء التركيز' : '🎯 تركيز';
  }

  function copySnapshot() {
    var text = [];
    var rows = activeRows();
    var session = getLastSession();
    text.push('ملخص مركز ألفريد');
    text.push('التبويب الحالي: ' + currentTabLabel());
    text.push('العناصر الظاهرة حالياً: ' + rows.length);
    text.push('آخر جلسة قراءة: ' + (session ? session.title + ' - ' + session.at : 'لا يوجد'));
    text.push('عدد الملاحظات المحلية: ' + Object.keys(getNotesMap()).length);
    text.push('وقت الإنشاء: ' + nowText());
    var payload = text.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(payload).then(function () {
        toast('تم نسخ الملخص الذكي.');
      }).catch(function () {
        fallbackCopy(payload);
      });
      return;
    }
    fallbackCopy(payload);
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      toast('تم نسخ الملخص الذكي.');
    } catch (e) {
      alert(text);
    }
    if (ta.parentNode) ta.parentNode.removeChild(ta);
  }

  function renderInstantResults(query) {
    var box = document.getElementById('alfredSearchResults');
    if (!box) return;
    query = String(query || '').trim().toLowerCase();
    var rows = activeRows();
    if (!query) {
      var hints = rows.slice(0, 5).map(function (row) {
        return {
          title: rowTitle(row),
          meta: rowMeta(row)
        };
      }).filter(function (item) { return !!item.title; });
      box.innerHTML = hints.length ? hints.map(function (item) {
        return '<button class="alfred-result-item" data-title="' + escapeHtml(item.title) + '"><strong>' + escapeHtml(item.title) + '</strong><small>' + escapeHtml(item.meta || 'نتيجة جاهزة للفتح السريع') + '</small></button>';
      }).join('') : '<div class="alfred-empty">لا توجد عناصر ظاهرة حالياً.</div>';
      bindResultButtons();
      return;
    }

    var results = rows.map(function (row) {
      return {
        title: rowTitle(row),
        meta: rowMeta(row)
      };
    }).filter(function (item) {
      var hay = (item.title + ' ' + item.meta).toLowerCase();
      return item.title && hay.indexOf(query) !== -1;
    }).slice(0, 8);

    if (!results.length) {
      box.innerHTML = '<div class="alfred-empty">لا توجد نتيجة مطابقة داخل العناصر الظاهرة.</div>';
      return;
    }

    box.innerHTML = results.map(function (item) {
      return '<button class="alfred-result-item" data-title="' + escapeHtml(item.title) + '"><strong>' + escapeHtml(item.title) + '</strong><small>' + escapeHtml(item.meta || 'نتيجة مطابقة') + '</small></button>';
    }).join('');
    bindResultButtons();
  }

  function bindResultButtons() {
    $all('#alfredSearchResults .alfred-result-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        smartOpenByTitle(btn.getAttribute('data-title') || '');
      });
    });
  }

  function toggleNotesDrawer(force) {
    var drawer = document.getElementById('alfredNotesDrawer');
    if (!drawer) return;
    var next = typeof force === 'boolean' ? force : !drawer.classList.contains('active');
    drawer.classList.toggle('active', next);
    if (next) {
      var title = currentViewerTitle();
      var titleEl = document.getElementById('alfredNotesTitle');
      var textarea = document.getElementById('alfredCurrentNote');
      if (titleEl) titleEl.textContent = title || 'لا يوجد ملف مفتوح حالياً';
      if (textarea) textarea.value = getCurrentNote();
      if (textarea && title) setTimeout(function () { textarea.focus(); }, 50);
    }
  }

  function renderAlfredSnapshot() {
    var box = document.getElementById('alfredSnapshot');
    if (!box) return;
    var session = getLastSession();
    var viewerTitle = currentViewerTitle();
    var rows = activeRows();
    var notesCount = Object.keys(getNotesMap()).length;
    var quickTop = rows.slice(0, 3).map(function (row) { return rowTitle(row); }).filter(Boolean);
    box.innerHTML = '' +
      '<div class="alfred-snapshot-card"><span>📍 التبويب الحالي</span><strong>' + escapeHtml(currentTabLabel()) + '</strong></div>' +
      '<div class="alfred-snapshot-card"><span>👀 المعروض الآن</span><strong>' + rows.length + ' عنصر</strong></div>' +
      '<div class="alfred-snapshot-card"><span>📝 ملاحظات محفوظة</span><strong>' + notesCount + '</strong></div>' +
      '<div class="alfred-snapshot-card alfred-wide"><span>🕓 آخر جلسة</span><strong>' + escapeHtml(session ? session.title : 'لا يوجد') + '</strong><small>' + escapeHtml(session ? session.at : 'افتح أي ملف ليتم حفظ الجلسة') + '</small></div>' +
      '<div class="alfred-snapshot-card alfred-wide"><span>⚡ اقتراحات سريعة</span><strong>' + escapeHtml(quickTop.length ? quickTop.join(' • ') : 'ابدأ بالبحث أو افتح ملفاً') + '</strong><small>' + escapeHtml(viewerTitle ? 'الملف المفتوح الآن: ' + viewerTitle : 'لا يوجد ملف مفتوح حالياً') + '</small></div>';
  }

  function ensureViewerButtons() {
    var toolbar = document.querySelector('.viewer-toolbar');
    if (!toolbar || document.getElementById('alfredViewerFocusBtn')) return;

    var focusBtn = document.createElement('button');
    focusBtn.id = 'alfredViewerFocusBtn';
    focusBtn.className = 'viewer-action-btn';
    focusBtn.textContent = '🎯 تركيز';
    focusBtn.addEventListener('click', function () {
      setFocusMode();
    });

    var noteBtn = document.createElement('button');
    noteBtn.id = 'alfredViewerNotesBtn';
    noteBtn.className = 'viewer-action-btn';
    noteBtn.textContent = '📝 ملاحظتي';
    noteBtn.addEventListener('click', function () {
      toggleNotesDrawer(true);
    });

    toolbar.insertBefore(noteBtn, toolbar.firstChild);
    toolbar.insertBefore(focusBtn, toolbar.firstChild);
    setFocusMode(localStorage.getItem(KEYS.focus) === '1');
  }

  function injectStyles() {
    if (document.getElementById('alfredUpgradeStyle')) return;
    var style = document.createElement('style');
    style.id = 'alfredUpgradeStyle';
    style.textContent = '' +
      '.alfred-section{position:relative;overflow:hidden;background:linear-gradient(135deg,rgba(99,102,241,.12),rgba(14,165,233,.08))!important;border:1px solid rgba(99,102,241,.16)!important;}' +
      '.alfred-section::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at top left,rgba(255,255,255,.28),transparent 42%);pointer-events:none;}' +
      '.alfred-stack{display:flex;flex-direction:column;gap:12px;position:relative;z-index:1;}' +
      '.alfred-search-wrap{display:flex;flex-direction:column;gap:8px;}' +
      '.alfred-search-input{width:100%;border:1px solid rgba(99,102,241,.18);background:rgba(255,255,255,.76);color:#0f172a;border-radius:14px;padding:12px 14px;font-family:var(--font);font-weight:800;outline:none;}' +
      'html.dark-mode .alfred-search-input{background:rgba(15,23,42,.72);color:#f8fafc;border-color:rgba(148,163,184,.22);}' +
      '.alfred-results{display:flex;flex-direction:column;gap:8px;max-height:190px;overflow:auto;padding-inline-end:2px;}' +
      '.alfred-result-item{border:none;text-align:right;background:rgba(255,255,255,.72);padding:10px 12px;border-radius:14px;cursor:pointer;font-family:var(--font);display:flex;flex-direction:column;gap:4px;box-shadow:0 8px 20px rgba(15,23,42,.06);}' +
      '.alfred-result-item strong{font-size:13px;}' +
      '.alfred-result-item small{font-size:11px;opacity:.82;}' +
      'html.dark-mode .alfred-result-item{background:rgba(15,23,42,.76);color:#f8fafc;}' +
      '.alfred-empty{font-size:12px;opacity:.75;padding:10px 4px;}' +
      '.alfred-action-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}' +
      '.alfred-action-btn{border:none;border-radius:14px;padding:11px 10px;font-family:var(--font);font-weight:900;cursor:pointer;background:rgba(255,255,255,.76);color:inherit;}' +
      '.alfred-action-btn.primary{background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;}' +
      '.alfred-action-btn.ghost{background:rgba(15,23,42,.06);}' +
      'html.dark-mode .alfred-action-btn{background:rgba(15,23,42,.66);color:#f8fafc;}' +
      '.alfred-presets{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;}' +
      '.alfred-preset-btn{border:none;border-radius:14px;padding:10px 6px;font-family:var(--font);font-size:12px;font-weight:900;cursor:pointer;background:rgba(255,255,255,.76);}' +
      '.alfred-preset-btn.active{outline:2px solid rgba(99,102,241,.45);transform:translateY(-1px);}' +
      '.alfred-preset-btn[data-preset="royal"]{background:linear-gradient(135deg,#6366F1,#EC4899);color:#fff;}' +
      '.alfred-preset-btn[data-preset="emerald"]{background:linear-gradient(135deg,#0F766E,#22C55E);color:#fff;}' +
      '.alfred-preset-btn[data-preset="sunset"]{background:linear-gradient(135deg,#EA580C,#EF4444);color:#fff;}' +
      '.alfred-preset-btn[data-preset="midnight"]{background:linear-gradient(135deg,#0F172A,#8B5CF6);color:#fff;}' +
      '.alfred-preset-badge{font-size:11px;font-weight:800;opacity:.85;}' +
      '.alfred-snapshot{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}' +
      '.alfred-snapshot-card{background:rgba(255,255,255,.72);padding:10px 12px;border-radius:14px;display:flex;flex-direction:column;gap:4px;min-height:74px;}' +
      '.alfred-snapshot-card span{font-size:11px;opacity:.74;font-weight:800;}' +
      '.alfred-snapshot-card strong{font-size:13px;line-height:1.5;}' +
      '.alfred-snapshot-card small{font-size:11px;opacity:.75;line-height:1.5;}' +
      '.alfred-snapshot-card.alfred-wide{grid-column:1 / -1;}' +
      'html.dark-mode .alfred-snapshot-card{background:rgba(15,23,42,.72);color:#f8fafc;}' +
      '.alfred-notes-drawer{position:fixed;right:18px;bottom:96px;z-index:3605;width:min(400px,calc(100vw - 36px));background:rgba(255,255,255,.97);backdrop-filter:blur(18px);border:1px solid rgba(148,163,184,.22);border-radius:22px;box-shadow:0 25px 90px rgba(15,23,42,.24);padding:14px;display:none;}' +
      '.alfred-notes-drawer.active{display:block;animation:alfredSlide .22s ease;}' +
      '@keyframes alfredSlide{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}' +
      '.alfred-notes-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px;}' +
      '.alfred-notes-head strong{display:block;font-size:15px;line-height:1.5;}' +
      '.alfred-notes-head small{font-size:11px;opacity:.72;}' +
      '.alfred-notes-close{border:none;background:transparent;font-size:20px;cursor:pointer;color:inherit;}' +
      '.alfred-notes-text{width:100%;min-height:150px;border-radius:16px;border:1px solid rgba(148,163,184,.24);padding:12px;font-family:var(--font);resize:vertical;background:transparent;color:inherit;}' +
      '.alfred-note-actions{display:flex;gap:8px;margin-top:10px;}' +
      '.alfred-note-actions button{flex:1;border:none;border-radius:12px;padding:11px 10px;font-family:var(--font);font-weight:900;cursor:pointer;}' +
      '.alfred-note-save{background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;}' +
      '.alfred-note-copy{background:rgba(15,23,42,.08);}' +
      'html.dark-mode .alfred-notes-drawer{background:rgba(15,23,42,.97);color:#f8fafc;border-color:rgba(148,163,184,.16);}' +
      'html.dark-mode .alfred-note-copy{background:rgba(255,255,255,.08);color:#f8fafc;}' +
      '.alfred-toast{position:fixed;top:18px;left:50%;transform:translateX(-50%) translateY(-12px);background:rgba(15,23,42,.92);color:#fff;padding:12px 16px;border-radius:14px;z-index:3999;opacity:0;pointer-events:none;transition:all .22s ease;font-family:var(--font);font-weight:800;box-shadow:0 20px 40px rgba(15,23,42,.24);max-width:min(92vw,520px);text-align:center;}' +
      '.alfred-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}' +
      '#viewerModal.alfred-focus-mode{padding:0!important;background:rgba(2,6,23,.96)!important;backdrop-filter:blur(16px)!important;}' +
      '#viewerModal.alfred-focus-mode .viewer-header{border-radius:0!important;padding:14px 18px!important;}' +
      '#viewerModal.alfred-focus-mode .viewer-content{height:calc(100% - 72px)!important;}' +
      '#viewerModal.alfred-focus-mode #pdfFrame{filter:contrast(1.03) saturate(1.02);}' +
      '@media (max-width:720px){.alfred-action-grid,.alfred-snapshot{grid-template-columns:1fr}.alfred-presets{grid-template-columns:repeat(2,minmax(0,1fr))}.alfred-notes-drawer{right:12px;left:12px;width:auto;bottom:86px}}';
    document.head.appendChild(style);
  }

  function injectNotesDrawer() {
    if (document.getElementById('alfredNotesDrawer')) return;
    var drawer = document.createElement('div');
    drawer.id = 'alfredNotesDrawer';
    drawer.className = 'alfred-notes-drawer';
    drawer.innerHTML = '' +
      '<div class="alfred-notes-head">' +
        '<div><strong id="alfredNotesTitle">لا يوجد ملف مفتوح حالياً</strong><small>ملاحظة محلية محفوظة على هذا الجهاز فقط</small></div>' +
        '<button class="alfred-notes-close" id="alfredNotesCloseBtn">✕</button>' +
      '</div>' +
      '<textarea id="alfredCurrentNote" class="alfred-notes-text" placeholder="اكتب ملحوظاتك السريعة على الملف الحالي..."></textarea>' +
      '<div class="alfred-note-actions">' +
        '<button class="alfred-note-save" id="alfredSaveNoteBtn">💾 حفظ الملاحظة</button>' +
        '<button class="alfred-note-copy" id="alfredCopyNoteBtn">📋 نسخ</button>' +
      '</div>';
    document.body.appendChild(drawer);

    document.getElementById('alfredNotesCloseBtn').addEventListener('click', function () {
      toggleNotesDrawer(false);
    });
    document.getElementById('alfredSaveNoteBtn').addEventListener('click', function () {
      var textarea = document.getElementById('alfredCurrentNote');
      saveCurrentNote(textarea ? textarea.value : '');
      toast('تم حفظ ملاحظة الملف.');
    });
    document.getElementById('alfredCopyNoteBtn').addEventListener('click', function () {
      var textarea = document.getElementById('alfredCurrentNote');
      fallbackCopy(textarea ? textarea.value || '' : '');
    });
  }

  function enhancePanel() {
    var fab = document.getElementById('enhancementsFab');
    var panel = document.getElementById('enhancementsPanel');
    if (!fab || !panel) return false;

    if (!fab.__alfredUpgraded) {
      fab.__alfredUpgraded = true;
      fab.innerHTML = '<span>🧠</span><span>ألفريد</span>';
      fab.title = 'مركز ألفريد الذكي';
    }

    var titleLabel = document.querySelector('#enhancementsPanel .enh-title span:last-child');
    if (titleLabel) titleLabel.textContent = 'مركز ألفريد الذكي';
    var badge = document.getElementById('enhCurrentTabBadge');
    if (badge) badge.textContent = 'جاهز للقراءة الذكية';

    if (!document.getElementById('alfredSection')) {
      var section = document.createElement('div');
      section.id = 'alfredSection';
      section.className = 'enh-section alfred-section';
      section.innerHTML = '' +
        '<div class="alfred-stack">' +
          '<h3>🧠 وضع ألفريد المطوّر</h3>' +
          '<div class="alfred-search-wrap">' +
            '<input id="alfredSearchInput" class="alfred-search-input" type="text" placeholder="ابحث داخل العناصر الظاهرة أو اكتب اسم ملف للفتح السريع" />' +
            '<div id="alfredSearchResults" class="alfred-results"></div>' +
          '</div>' +
          '<div class="alfred-action-grid">' +
            '<button class="alfred-action-btn primary" id="alfredResumeBtn">▶️ متابعة آخر ملف</button>' +
            '<button class="alfred-action-btn" id="alfredFocusBtn">🎯 وضع التركيز</button>' +
            '<button class="alfred-action-btn" id="alfredNotesBtn">📝 ملاحظتي على الملف</button>' +
            '<button class="alfred-action-btn ghost" id="alfredCopySnapshotBtn">📋 نسخ ملخص ألفريد</button>' +
          '</div>' +
          '<div>' +
            '<div class="enh-inline" style="margin-bottom:8px;"><strong>🎨 ثيمات فورية</strong><span id="alfredPresetBadge" class="alfred-preset-badge"></span></div>' +
            '<div class="alfred-presets">' +
              '<button class="alfred-preset-btn" data-preset="royal">ملكي</button>' +
              '<button class="alfred-preset-btn" data-preset="emerald">زمردي</button>' +
              '<button class="alfred-preset-btn" data-preset="sunset">غروب</button>' +
              '<button class="alfred-preset-btn" data-preset="midnight">ليلي</button>' +
            '</div>' +
          '</div>' +
          '<div id="alfredSnapshot" class="alfred-snapshot"></div>' +
        '</div>';

      var firstSection = panel.querySelector('.enh-section');
      if (firstSection) panel.insertBefore(section, firstSection);
      else panel.appendChild(section);

      document.getElementById('alfredSearchInput').addEventListener('input', function (e) {
        renderInstantResults(e.target.value || '');
      });
      document.getElementById('alfredResumeBtn').addEventListener('click', function () {
        var session = getLastSession();
        if (!session || !session.title) {
          toast('لا توجد جلسة قراءة محفوظة بعد.');
          return;
        }
        if (session.tabId && typeof window.switchTab === 'function') window.switchTab(session.tabId);
        setTimeout(function () {
          smartOpenByTitle(session.title);
        }, 120);
      });
      document.getElementById('alfredFocusBtn').addEventListener('click', function () {
        setFocusMode();
      });
      document.getElementById('alfredNotesBtn').addEventListener('click', function () {
        if (!currentViewerTitle()) {
          toast('افتح ملفاً أولاً ثم أضف ملاحظتك عليه.');
          return;
        }
        toggleNotesDrawer(true);
      });
      document.getElementById('alfredCopySnapshotBtn').addEventListener('click', copySnapshot);
      $all('.alfred-preset-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          applyThemePreset(btn.getAttribute('data-preset') || 'royal');
          toast('تم تفعيل الثيم بنجاح.');
        });
      });
    }

    renderInstantResults('');
    renderAlfredSnapshot();
    return true;
  }

  function bindKeyboardShortcuts() {
    if (document.body.__alfredShortcutsBound) return;
    document.body.__alfredShortcutsBound = true;
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        var panel = document.getElementById('enhancementsPanel');
        if (panel && !panel.classList.contains('active')) {
          var fab = document.getElementById('enhancementsFab');
          if (fab) fab.click();
        }
        var input = document.getElementById('alfredSearchInput');
        if (input) {
          setTimeout(function () {
            input.focus();
            input.select();
          }, 50);
        }
      }
      if (e.key === 'Escape') {
        toggleNotesDrawer(false);
      }
    });

    if (!localStorage.getItem(KEYS.shortcutsHint)) {
      localStorage.setItem(KEYS.shortcutsHint, '1');
      setTimeout(function () {
        toast('جديد: افتح مركز ألفريد سريعاً عبر Ctrl + K');
      }, 900);
    }
  }

  function observeViewer() {
    var modal = document.getElementById('viewerModal');
    if (!modal || modal.__alfredObserved) return;
    modal.__alfredObserved = true;
    var observer = new MutationObserver(function () {
      ensureViewerButtons();
      if (modal.classList.contains('active')) {
        setTimeout(function () {
          persistCurrentSession();
          var textarea = document.getElementById('alfredCurrentNote');
          if (textarea && document.getElementById('alfredNotesDrawer') && document.getElementById('alfredNotesDrawer').classList.contains('active')) {
            textarea.value = getCurrentNote();
          }
          renderAlfredSnapshot();
        }, 120);
      } else {
        toggleNotesDrawer(false);
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  function refreshLoop() {
    enhancePanel();
    ensureViewerButtons();
    renderAlfredSnapshot();
    var input = document.getElementById('alfredSearchInput');
    if (input && document.activeElement !== input) {
      renderInstantResults(input.value || '');
    }
  }

  function boot() {
    injectStyles();
    injectNotesDrawer();
    bindKeyboardShortcuts();
    observeViewer();
    applyThemePreset(localStorage.getItem(KEYS.preset) || 'royal');
    enhancePanel();
    ensureViewerButtons();
    renderAlfredSnapshot();
    setInterval(refreshLoop, 1800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
