(function () {
  'use strict';

  var KEYS = {
    recentViews: 'cloudAppEnhRecentViews.v1',
    recentSearches: 'cloudAppEnhRecentSearches.v1',
    notes: 'cloudAppEnhQuickNotes.v1',
    panelOpen: 'cloudAppEnhPanelOpen.v1'
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

  function currentTabId() {
    var active = $('.main-content.active');
    return active ? active.id : 'tab1';
  }

  function currentTabLabel() {
    var tabId = currentTabId();
    var label = $('#tabLabelText_' + tabId);
    return label ? label.textContent.trim() : tabId;
  }

  function activeTabIndex() {
    var tabId = currentTabId();
    var match = tabId.match(/tab(\d+)/);
    return match ? match[1] : '1';
  }

  function textOf(id, fallback) {
    var el = document.getElementById(id);
    return el ? String(el.textContent || '').trim() : (fallback || '0');
  }

  function getActiveStats() {
    var idx = activeTabIndex();
    var tabId = currentTabId();
    return {
      tabId: tabId,
      tabLabel: currentTabLabel(),
      total: textOf('totalJudgments' + idx, '0'),
      favorites: textOf('favoritesCount' + idx, '0'),
      visibleCards: String($all('#' + tabId + ' .judgment-card').length),
      downloadedVisible: String($all('#' + tabId + ' .judgment-btn-download.downloaded').length),
      searchValue: ($('#searchInput') && $('#searchInput').value ? $('#searchInput').value.trim() : ''),
      connection: (textOf('connectionStatus', '') || '').replace(/\s+/g, ' ').trim(),
      user: textOf('currentUserInfo', 'غير محدد')
    };
  }

  function pushUnique(key, payload, maxItems, uniqueField) {
    var items = readJson(key, []);
    items = Array.isArray(items) ? items : [];
    items = items.filter(function (item) {
      return item && item[uniqueField] !== payload[uniqueField];
    });
    items.unshift(payload);
    items = items.slice(0, maxItems);
    writeJson(key, items);
    return items;
  }

  function addRecentView(title) {
    title = String(title || '').trim();
    if (!title) return;
    pushUnique(KEYS.recentViews, {
      title: title,
      tabId: currentTabId(),
      tabLabel: currentTabLabel(),
      at: nowText()
    }, 8, 'title');
    renderEnhancements();
  }

  function addRecentSearch(term) {
    term = String(term || '').trim();
    if (!term || term.length < 2) return;
    pushUnique(KEYS.recentSearches, {
      term: term,
      tabId: currentTabId(),
      tabLabel: currentTabLabel(),
      at: nowText()
    }, 10, 'term');
    renderEnhancements();
  }

  function getRecentViews() {
    var items = readJson(KEYS.recentViews, []);
    return Array.isArray(items) ? items : [];
  }

  function getRecentSearches() {
    var items = readJson(KEYS.recentSearches, []);
    return Array.isArray(items) ? items : [];
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        alert('✅ تم نسخ الملخص.');
      }).catch(function () {
        fallbackCopy(text);
      });
      return;
    }
    fallbackCopy(text);
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    try {
      document.execCommand('copy');
      alert('✅ تم نسخ الملخص.');
    } catch (e) {
      alert('⚠️ تعذر النسخ التلقائي، انسخ النص يدوياً من النافذة التالية:\n\n' + text);
    }
    document.body.removeChild(ta);
  }

  function exportLocalSettings() {
    var payload = {};
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i);
      if (!key) continue;
      if (key.indexOf('cloudApp') === 0 || key.indexOf('theme') === 0) {
        payload[key] = localStorage.getItem(key);
      }
    }
    payload.__exportedAt = nowText();
    payload.__exportedBy = 'enhancements';
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'court-app-local-backup.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      try { URL.revokeObjectURL(url); } catch (e) {}
      if (a.parentNode) a.parentNode.removeChild(a);
    }, 500);
  }

  function importLocalSettings(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(String(reader.result || '{}'));
        Object.keys(parsed).forEach(function (key) {
          if (key.indexOf('cloudApp') === 0 || key.indexOf('theme') === 0) {
            localStorage.setItem(key, parsed[key]);
          }
        });
        alert('✅ تم استيراد النسخة المحلية. سيُعاد تحميل التطبيق الآن.');
        setTimeout(function () { window.location.reload(); }, 120);
      } catch (e) {
        alert('❌ ملف النسخة المحلية غير صالح.');
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function clearEnhancementsData() {
    if (!confirm('سيتم حذف سجل البحث وآخر الملفات المفتوحة والملاحظات السريعة فقط. هل تريد المتابعة؟')) return;
    [KEYS.recentViews, KEYS.recentSearches, KEYS.notes].forEach(function (key) {
      localStorage.removeItem(key);
    });
    renderEnhancements();
  }

  function fillSearchAndDispatch(value) {
    var input = $('#searchInput');
    if (!input) return;
    input.value = value || '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (value) addRecentSearch(value);
  }

  function togglePanel(forceOpen) {
    var panel = $('#enhancementsPanel');
    if (!panel) return;
    var shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !panel.classList.contains('active');
    panel.classList.toggle('active', shouldOpen);
    writeJson(KEYS.panelOpen, shouldOpen);
    renderEnhancements();
  }

  function getSummaryText() {
    var stats = getActiveStats();
    var latestView = getRecentViews()[0];
    var latestSearch = getRecentSearches()[0];
    return [
      'ملخص سريع للتطبيق',
      'التبويب الحالي: ' + stats.tabLabel,
      'إجمالي الملفات في التبويب: ' + stats.total,
      'المفضلة في التبويب: ' + stats.favorites,
      'العناصر الظاهرة حالياً: ' + stats.visibleCards,
      'الملفات المحملة الظاهرة: ' + stats.downloadedVisible,
      'البحث الحالي: ' + (stats.searchValue || 'لا يوجد'),
      'آخر ملف تم فتحه: ' + (latestView ? latestView.title : 'لا يوجد'),
      'آخر بحث: ' + (latestSearch ? latestSearch.term : 'لا يوجد'),
      'المستخدم الحالي: ' + stats.user,
      'الحالة: ' + (stats.connection || 'غير معروفة'),
      'وقت إنشاء الملخص: ' + nowText()
    ].join('\n');
  }

  function injectStyles() {
    if ($('#enhancementsStyle')) return;
    var style = document.createElement('style');
    style.id = 'enhancementsStyle';
    style.textContent = '' +
      '.enh-fab{position:fixed;left:16px;bottom:18px;z-index:3600;border:none;border-radius:18px;padding:14px 16px;background:linear-gradient(135deg,#7C3AED,#2563EB);color:#fff;font-family:var(--font);font-weight:900;box-shadow:0 18px 40px rgba(37,99,235,.28);cursor:pointer;display:flex;align-items:center;gap:8px;}' +
      '.enh-fab:active{transform:scale(.98);}' +
      '.enh-panel{position:fixed;left:16px;bottom:78px;z-index:3599;width:min(420px,calc(100vw - 32px));max-height:min(78vh,720px);overflow:auto;background:rgba(255,255,255,.96);backdrop-filter:blur(18px);border:1px solid rgba(148,163,184,.26);border-radius:22px;box-shadow:0 30px 90px rgba(15,23,42,.24);padding:16px;display:none;}' +
      'html.dark-mode .enh-panel{background:rgba(15,23,42,.94);color:#f8fafc;border-color:rgba(148,163,184,.18);}' +
      '.enh-panel.active{display:block;animation:enhPop .22s ease;}' +
      '@keyframes enhPop{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}' +
      '.enh-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;}' +
      '.enh-title{font-size:18px;font-weight:900;display:flex;align-items:center;gap:8px;}' +
      '.enh-badge{font-size:11px;padding:5px 8px;border-radius:999px;background:rgba(99,102,241,.12);color:#4338ca;font-weight:900;}' +
      'html.dark-mode .enh-badge{background:rgba(129,140,248,.18);color:#c7d2fe;}' +
      '.enh-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:12px;}' +
      '.enh-card{background:linear-gradient(180deg,rgba(99,102,241,.08),rgba(14,165,233,.06));border:1px solid rgba(99,102,241,.12);border-radius:16px;padding:12px;}' +
      '.enh-card strong{display:block;font-size:22px;margin-top:6px;}' +
      '.enh-section{margin-top:12px;padding:12px;border-radius:16px;background:rgba(148,163,184,.08);border:1px solid rgba(148,163,184,.12);}' +
      'html.dark-mode .enh-section{background:rgba(51,65,85,.45);border-color:rgba(148,163,184,.14);}' +
      '.enh-section h3{margin:0 0 10px 0;font-size:14px;font-weight:900;display:flex;align-items:center;gap:6px;}' +
      '.enh-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;}' +
      '.enh-btn{border:none;border-radius:14px;padding:11px 10px;font-family:var(--font);font-weight:900;cursor:pointer;background:rgba(99,102,241,.12);color:inherit;}' +
      '.enh-btn.primary{background:linear-gradient(135deg,#2563EB,#7C3AED);color:#fff;}' +
      '.enh-btn.warn{background:rgba(239,68,68,.14);color:#b91c1c;}' +
      'html.dark-mode .enh-btn.warn{color:#fecaca;}' +
      '.enh-chip-list{display:flex;flex-wrap:wrap;gap:8px;}' +
      '.enh-chip{border:none;border-radius:999px;padding:8px 12px;background:rgba(14,165,233,.10);font-family:var(--font);font-weight:800;cursor:pointer;max-width:100%;}' +
      '.enh-chip small{display:block;opacity:.75;font-weight:700;}' +
      '.enh-empty{font-size:12px;opacity:.75;}' +
      '.enh-notes{width:100%;min-height:96px;border-radius:14px;border:1px solid rgba(148,163,184,.24);background:transparent;color:inherit;font-family:var(--font);padding:12px;resize:vertical;box-sizing:border-box;}' +
      '.enh-mini{font-size:12px;opacity:.8;line-height:1.7;}' +
      '.enh-inline{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;}' +
      '.enh-close{border:none;background:transparent;font-size:20px;cursor:pointer;color:inherit;opacity:.8;}' +
      '@media (max-width:640px){.enh-grid,.enh-actions{grid-template-columns:1fr}.enh-panel{left:12px;right:12px;width:auto;bottom:74px}.enh-fab{left:12px;bottom:14px}}';
    document.head.appendChild(style);
  }

  function injectUi() {
    if ($('#enhancementsFab')) return;
    var fab = document.createElement('button');
    fab.id = 'enhancementsFab';
    fab.className = 'enh-fab';
    fab.innerHTML = '<span>✨</span><span>إضافات</span>';

    var panel = document.createElement('div');
    panel.id = 'enhancementsPanel';
    panel.className = 'enh-panel';
    panel.innerHTML = '' +
      '<div class="enh-head">' +
        '<div class="enh-title"><span>🚀</span><span>لوحة الإضافات الذكية</span></div>' +
        '<div class="enh-inline">' +
          '<span class="enh-badge" id="enhCurrentTabBadge">جاهز</span>' +
          '<button class="enh-close" id="enhCloseBtn" title="إغلاق">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="enh-grid">' +
        '<div class="enh-card"><div>📁 إجمالي التبويب</div><strong id="enhTotal">0</strong></div>' +
        '<div class="enh-card"><div>⭐ المفضلة</div><strong id="enhFavorites">0</strong></div>' +
        '<div class="enh-card"><div>👁️ الظاهر حالياً</div><strong id="enhVisible">0</strong></div>' +
        '<div class="enh-card"><div>📥 المحمّل الظاهر</div><strong id="enhDownloaded">0</strong></div>' +
      '</div>' +
      '<div class="enh-section">' +
        '<h3>⚡ إجراءات سريعة</h3>' +
        '<div class="enh-actions">' +
          '<button class="enh-btn primary" id="enhCopySummaryBtn">📋 نسخ ملخص سريع</button>' +
          '<button class="enh-btn" id="enhClearSearchBtn">🧹 مسح البحث الحالي</button>' +
          '<button class="enh-btn" id="enhTopBtn">⬆️ إلى أعلى</button>' +
          '<button class="enh-btn" id="enhThemeBtn">🌓 تبديل المظهر</button>' +
          '<button class="enh-btn" id="enhExportBtn">💾 تصدير الإعدادات المحلية</button>' +
          '<button class="enh-btn" id="enhImportBtn">📂 استيراد الإعدادات المحلية</button>' +
          '<button class="enh-btn warn" id="enhResetDataBtn">🗑️ حذف بيانات الإضافات</button>' +
          '<button class="enh-btn" id="enhRefreshBtn">🔄 تحديث اللوحة</button>' +
        '</div>' +
      '</div>' +
      '<div class="enh-section">' +
        '<h3>🕘 آخر الملفات المفتوحة</h3>' +
        '<div id="enhRecentViews" class="enh-chip-list"></div>' +
      '</div>' +
      '<div class="enh-section">' +
        '<h3>🔎 سجل البحث السريع</h3>' +
        '<div id="enhRecentSearches" class="enh-chip-list"></div>' +
      '</div>' +
      '<div class="enh-section">' +
        '<h3>📝 ملاحظات سريعة على الجهاز</h3>' +
        '<textarea id="enhNotes" class="enh-notes" placeholder="اكتب هنا أي ملاحظة سريعة تريد الاحتفاظ بها على هذا الجهاز فقط..."></textarea>' +
      '</div>' +
      '<div class="enh-section enh-mini" id="enhMetaInfo"></div>' +
      '<input type="file" id="enhImportFile" accept="application/json" style="display:none;" />';

    document.body.appendChild(panel);
    document.body.appendChild(fab);

    fab.addEventListener('click', function () { togglePanel(); });
    $('#enhCloseBtn').addEventListener('click', function () { togglePanel(false); });
    $('#enhCopySummaryBtn').addEventListener('click', function () { copyText(getSummaryText()); });
    $('#enhClearSearchBtn').addEventListener('click', function () { fillSearchAndDispatch(''); });
    $('#enhTopBtn').addEventListener('click', function () {
      var active = $('.main-content.active');
      if (active && typeof active.scrollTo === 'function') active.scrollTo({ top: 0, behavior: 'smooth' });
    });
    $('#enhThemeBtn').addEventListener('click', function () {
      var themeBtn = $('#themeToggle');
      if (themeBtn) themeBtn.click();
      setTimeout(renderEnhancements, 80);
    });
    $('#enhExportBtn').addEventListener('click', exportLocalSettings);
    $('#enhImportBtn').addEventListener('click', function () { $('#enhImportFile').click(); });
    $('#enhImportFile').addEventListener('change', function (e) {
      importLocalSettings(e && e.target && e.target.files ? e.target.files[0] : null);
      e.target.value = '';
    });
    $('#enhResetDataBtn').addEventListener('click', clearEnhancementsData);
    $('#enhRefreshBtn').addEventListener('click', renderEnhancements);
    $('#enhNotes').addEventListener('input', function (e) {
      localStorage.setItem(KEYS.notes, e.target.value || '');
    });

    if (readJson(KEYS.panelOpen, false)) {
      panel.classList.add('active');
    }
  }

  function renderList(containerId, items, type) {
    var el = document.getElementById(containerId);
    if (!el) return;
    if (!items.length) {
      el.innerHTML = '<div class="enh-empty">لا توجد بيانات بعد.</div>';
      return;
    }
    el.innerHTML = items.map(function (item) {
      if (type === 'views') {
        return '<button class="enh-chip" data-search="' + escapeHtml(item.title) + '"><span>' + escapeHtml(item.title) + '</span><small>' + escapeHtml(item.tabLabel || '') + ' • ' + escapeHtml(item.at || '') + '</small></button>';
      }
      return '<button class="enh-chip" data-search="' + escapeHtml(item.term) + '"><span>' + escapeHtml(item.term) + '</span><small>' + escapeHtml(item.tabLabel || '') + ' • ' + escapeHtml(item.at || '') + '</small></button>';
    }).join('');
    $all('#' + containerId + ' .enh-chip').forEach(function (btn) {
      btn.addEventListener('click', function () {
        fillSearchAndDispatch(btn.getAttribute('data-search') || '');
      });
    });
  }

  function renderEnhancements() {
    var stats = getActiveStats();
    if ($('#enhCurrentTabBadge')) $('#enhCurrentTabBadge').textContent = 'التبويب الحالي: ' + stats.tabLabel;
    if ($('#enhTotal')) $('#enhTotal').textContent = stats.total;
    if ($('#enhFavorites')) $('#enhFavorites').textContent = stats.favorites;
    if ($('#enhVisible')) $('#enhVisible').textContent = stats.visibleCards;
    if ($('#enhDownloaded')) $('#enhDownloaded').textContent = stats.downloadedVisible;
    if ($('#enhNotes')) $('#enhNotes').value = localStorage.getItem(KEYS.notes) || '';
    renderList('enhRecentViews', getRecentViews(), 'views');
    renderList('enhRecentSearches', getRecentSearches(), 'searches');
    var latestView = getRecentViews()[0];
    var meta = [
      'المستخدم الحالي: ' + escapeHtml(stats.user),
      'الحالة: ' + escapeHtml(stats.connection || 'غير معروفة'),
      'البحث الحالي: ' + escapeHtml(stats.searchValue || 'لا يوجد'),
      'آخر ملف مفتوح: ' + escapeHtml(latestView ? latestView.title : 'لا يوجد'),
      'آخر تحديث للوحة: ' + escapeHtml(nowText())
    ].join('<br>');
    if ($('#enhMetaInfo')) $('#enhMetaInfo').innerHTML = meta;
  }

  function setupSearchTracking() {
    var input = $('#searchInput');
    if (!input || input.__enhTracked) return;
    input.__enhTracked = true;
    var timer = null;
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var term = String(input.value || '').trim();
        if (term) addRecentSearch(term);
        renderEnhancements();
      }, 650);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        addRecentSearch(input.value || '');
      }
    });
  }

  function setupViewerTracking() {
    var modal = $('#viewerModal');
    if (!modal || modal.__enhObserved) return;
    modal.__enhObserved = true;
    var observer = new MutationObserver(function () {
      if (modal.classList.contains('active')) {
        setTimeout(function () {
          var title = textOf('viewerTitle', '');
          if (title) addRecentView(title);
          renderEnhancements();
        }, 120);
      } else {
        renderEnhancements();
      }
    });
    observer.observe(modal, { attributes: true, attributeFilter: ['class'] });
  }

  function patchWindowFunctions() {
    if (typeof window.switchTab === 'function' && !window.switchTab.__enhanced) {
      var originalSwitchTab = window.switchTab;
      var wrappedSwitch = function () {
        var result = originalSwitchTab.apply(this, arguments);
        setTimeout(renderEnhancements, 60);
        return result;
      };
      wrappedSwitch.__enhanced = true;
      window.switchTab = wrappedSwitch;
    }

    if (typeof window.toggleFavorite === 'function' && !window.toggleFavorite.__enhanced) {
      var originalToggleFavorite = window.toggleFavorite;
      var wrappedToggle = function () {
        var result = originalToggleFavorite.apply(this, arguments);
        setTimeout(renderEnhancements, 60);
        return result;
      };
      wrappedToggle.__enhanced = true;
      window.toggleFavorite = wrappedToggle;
    }

    if (typeof window.downloadCurrentViewedFile === 'function' && !window.downloadCurrentViewedFile.__enhanced) {
      var originalDownloadCurrent = window.downloadCurrentViewedFile;
      var wrappedDownloadCurrent = function () {
        var result = originalDownloadCurrent.apply(this, arguments);
        setTimeout(renderEnhancements, 180);
        return result;
      };
      wrappedDownloadCurrent.__enhanced = true;
      window.downloadCurrentViewedFile = wrappedDownloadCurrent;
    }
  }

  function bootEnhancements() {
    injectStyles();
    injectUi();
    setupSearchTracking();
    setupViewerTracking();
    patchWindowFunctions();
    renderEnhancements();
    setInterval(function () {
      patchWindowFunctions();
      renderEnhancements();
    }, 1800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootEnhancements);
  } else {
    bootEnhancements();
  }
})();
