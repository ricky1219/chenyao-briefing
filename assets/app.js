/* 陈瑶的商业晨报 · 交互脚本（轻量，无全页 MutationObserver / 轮播 / 重度特效） */
(function () {
  'use strict';

  /* 刷新按钮：仅用时间戳重载当前页，不做全页框架刷新 */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-refresh]');
    if (!btn) return;
    var url = location.pathname + location.search;
    var sep = location.search ? '&' : '?';
    location.href = url + sep + 'v=' + Date.now();
  });

  /* 分类/地区筛选：按 data-group 隐藏非当前组卡片 */
  function bindFilters(scopeSel, groupAttr) {
    var scope = document.querySelector(scopeSel);
    if (!scope) return;
    var buttons = Array.prototype.slice.call(scope.querySelectorAll('button[data-f]'));
    var cards = Array.prototype.slice.call(document.querySelectorAll('article.card[data-group]'));
    if (!buttons.length || !cards.length) return;
    var note = document.querySelector('[data-filter-note]');
    var current = 'all';

    function apply() {
      var shown = 0;
      cards.forEach(function (card) {
        var show = current === 'all' || card.getAttribute('data-group') === current;
        card.style.display = show ? '' : 'none';
        if (show) shown++;
      });
      /* 隐藏无可见卡片的分类容器 */
      document.querySelectorAll('.grid[data-group]').forEach(function (g) {
        var visible = Array.prototype.some.call(g.querySelectorAll('article.card[data-group]'), function (c) {
          return c.style.display !== 'none';
        });
        g.style.display = visible ? '' : 'none';
      });
      document.body.classList.toggle('filtering', current !== 'all');
      if (note) note.textContent = current === 'all'
        ? '显示全部 ' + shown + ' 条'
        : '筛选「' + (currentText()) + '」· 共 ' + shown + ' 条';
    }
    function currentText() {
      var b = scope.querySelector('button[data-f].active');
      return b ? b.textContent.trim() : '';
    }
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        buttons.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        current = btn.getAttribute('data-f');
        apply();
      });
    });
    apply();
  }

  /* 底部导航当前项由服务端标注 .current；此处仅保证唯一 */
  function normalizeNav() {
    var nav = document.querySelector('.bottomnav');
    if (!nav) return;
    var cur = nav.querySelectorAll('a.current');
    if (cur.length > 1) {
      for (var i = 1; i < cur.length; i++) cur[i].classList.remove('current');
    }
  }

  bindFilters('[data-filterbar]', 'data-group');
  normalizeNav();
})();
