// ==UserScript==
// @name         Udemy Complete All Lectures
// @namespace    https://github.com/chirag127/userscripts
// @version      2.1.0
// @description  One click marks every remaining lecture, quiz and lab in a Udemy course (or TCS Global Udemy) as complete, through the app's own completion API. No watching, no downloading.
// @author       chirag127
// @match        https://www.udemy.com/course/*
// @match        https://tcsglobal.udemy.com/course/*
// @grant        none
// @license      MIT
// @homepageURL  https://github.com/chirag127/udemy-complete-all-userscript
// @updateURL    https://raw.githubusercontent.com/chirag127/udemy-complete-all-userscript/main/udemy-complete-all-userscript.user.js
// @downloadURL  https://raw.githubusercontent.com/chirag127/udemy-complete-all-userscript/main/udemy-complete-all-userscript.user.js
// ==/UserScript==

(() => {
  'use strict';
  if (document.getElementById('ucav-root')) return;

  const TYPES = 'chapter,lecture,practice,quiz,role-play,graded-lab,graded-role-play';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = (min, max) => Math.round(min + Math.random() * (max - min));

  const slug = (() => {
    const m = location.pathname.match(/\/course\/([^/]+)/);
    return m ? m[1] : null;
  })();
  const knownId = slug && localStorage.getItem('ucav_course_id_' + slug);

  // Cache the course id on the public landing page, where /api-2.0/courses/{slug}/
  // is queryable anonymously. On /learn/ pages (app-only) the same call would
  // trip a bot-wall, so it stays out of the flow entirely.
  if (slug && !knownId && !location.pathname.includes('/learn/')) {
    fetch(`/api-2.0/courses/${slug}/?fields[course]=id,title`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && j.id && localStorage.setItem('ucav_course_id_' + slug, String(j.id)))
      .catch(() => {});
  }

  async function completeAll() {
    if (!slug) {
      flash('Not on a course page.');
      return;
    }
    if (!knownId) {
      flash(
        `No cached course id for “${slug}”. Visit the public course page (udemy.com/course/${slug}/) once, then retry — or go through /learn/ with a fresh tab first.`
      );
      return;
    }
    const courseId = knownId;

    async function allItems() {
      const out = [];
      let url = `/api-2.0/courses/${courseId}/subscriber-curriculum-items/?curriculum_types=${TYPES}&page_size=200`;
      while (url) {
        const r = await fetch(url, { credentials: 'include' });
        if (!r.ok) throw new Error(`curriculum fetch ${r.status}`);
        const j = await r.json();
        for (const it of j.results || []) out.push({ id: it.id, cls: it._class });
        url = j.next;
      }
      return out;
    }

    async function completedSets() {
      const r = await fetch(
        `/api-2.0/users/me/subscribed-courses/${courseId}/progress/?fields[course]=completed_lecture_ids,completed_quiz_ids,completed_assignment_ids,completed_graded_lab_ids,completed_role_play_ids,completed_graded_role_play_ids`,
        { credentials: 'include' }
      );
      if (!r.ok) throw new Error(`progress fetch ${r.status}`);
      const j = await r.json();
      return {
        lecture: j.completed_lecture_ids || [],
        quiz: j.completed_quiz_ids || [],
        assignment: j.completed_assignment_ids || [],
        graded_lab: j.completed_graded_lab_ids || [],
        role_play: j.completed_role_play_ids || [],
        graded_role_play: j.completed_graded_role_play_ids || [],
      };
    }

    const POST = (path, body) =>
      fetch(`/api-2.0/users/me/subscribed-courses/${courseId}/${path}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });

    const PENDING = {
      lecture: (id) => POST('completed-lectures/', { lecture_id: id, downloaded: false }),
      quiz: (id) => POST('completed-lectures/', { lecture_id: id, downloaded: false }),
      practice: (id) => POST('completed-assignments/', { assignment_id: id }),
      'graded-lab': (id) => POST('completed-graded-labs/', { lab_id: id }),
      'role-play': (id) => POST('completed-role-plays/', { role_play_id: id }),
      'graded-role-play': (id) => POST('completed-graded-role-plays/', { role_play_id: id }),
    };
    const SET_KEY = {
      lecture: 'lecture',
      quiz: 'quiz',
      practice: 'assignment',
      'graded-lab': 'graded_lab',
      'role-play': 'role_play',
      'graded-role-play': 'graded_role_play',
      chapter: null,
    };

    // Quizzes have no REST completion endpoint; the app writes them through a
    // channel its own checkbox triggers. Fallback: click the DOM checkbox, whose
    // state span is a SIBLING of the label (walk up one, then into the label).
    async function toggleQuizViaDom(itemId) {
      const find = () => {
        const state = document.querySelector(`#item-completion-state-${itemId}`);
        const box = state?.parentElement?.querySelector('label')?.querySelector('input');
        return box;
      };
      let box = find();
      if (box && box.checked) return true;
      if (box && !box.checked) {
        box.click();
        await sleep(1200);
        return true;
      }
      // collapsed section: expand all and retry once
      document.querySelectorAll('[data-purpose=expand-toggle]').forEach((t) => { try { t.click(); } catch {} });
      await sleep(2500);
      box = find();
      if (box && !box.checked) {
        box.click();
        await sleep(1200);
        return true;
      }
      return box ? box.checked : false;
    }

    let items, done;
    try {
      items = await allItems();
      done = await completedSets();
    } catch (e) {
      flash(`Setup failed: ${e.message} — is this course yours?`);
      return;
    }

    const total = items.filter((i) => SET_KEY[i.cls]).length;
    const toDo = items.filter((i) => SET_KEY[i.cls] && !done[SET_KEY[i.cls]].includes(i.id));
    let ok = 0,
      fail = 0;
    setStatus(`Starting… ${toDo.length} of ${total} remaining.`);
    for (const it of toDo) {
      const key = SET_KEY[it.cls];
      try {
        const r = await PENDING[key](it.id);
        if (r.ok) ok++;
        else fail++;
      } catch {
        fail++;
      }
      setStatus(`Marking… ${ok + fail} of ${toDo.length} (${ok} ok, ${fail} failed).`);
      await sleep(jitter(350, 900));
    }

    const p2 = await completedSets();
    const still = toDo.filter((i) => SET_KEY[i.cls] && !p2[SET_KEY[i.cls]].includes(i.id));
    let domOk = 0;
    for (const it of still.filter((i) => i.cls === 'quiz')) {
      const applied = await toggleQuizViaDom(it.id);
      if (applied) domOk++;
      await sleep(jitter(500, 1000));
    }

    const p3 = await completedSets();
    const nowDone = items.filter((i) => SET_KEY[i.cls] && p3[SET_KEY[i.cls]].includes(i.id)).length;
    const left = toDo.filter((i) => SET_KEY[i.cls] && !p3[SET_KEY[i.cls]].includes(i.id)).length;
    flash(
      `Done: ${nowDone}/${total} complete.${domOk ? ` ${domOk} quiz${domOk > 1 ? 'zes' : ''} via UI toggle.` : ''} ${left ? ` ${left} still pending.` : ''}`,
      left ? 'warn' : 'ok'
    );
  }

  function flash(msg, kind = 'info') {
    const el = document.getElementById('ucav-toast');
    el.textContent = msg;
    el.style.display = 'block';
    el.style.background = kind === 'ok' ? '#0f766e' : kind === 'warn' ? '#b45309' : '#1e293b';
    clearTimeout(flash._t);
    flash._t = setTimeout(() => (el.style.display = 'none'), 9000);
  }

  function setStatus(text) {
    document.getElementById('ucav-status').textContent = text;
  }

  function mount() {
    const root = document.createElement('div');
    root.id = 'ucav-root';
    root.style.cssText =
      'position:fixed;left:16px;bottom:16px;z-index:2147483647;font:13px/1.4 system-ui,sans-serif';
    const card = document.createElement('div');
    card.style.cssText =
      'background:#0f172a;color:#e2e8f0;border-radius:10px;padding:12px 14px;box-shadow:0 6px 24px rgba(0,0,0,.35);min-width:220px;max-width:320px';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:2px';
    const title = document.createElement('span');
    title.textContent = '⚡ Complete course';
    title.style.cssText = 'font-weight:600';
    const btn = document.createElement('button');
    btn.textContent = 'Mark all complete';
    btn.style.cssText =
      'background:#16a34a;color:#fff;border:0;border-radius:7px;padding:6px 10px;font:600 12px system-ui;cursor:pointer';
    btn.addEventListener('click', () => completeAll());
    const x = document.createElement('button');
    x.textContent = '×';
    x.setAttribute('aria-label', 'Hide');
    x.style.cssText =
      'background:none;border:0;color:#94a3b8;font:14px system-ui;cursor:pointer;padding:0 2px';
    x.addEventListener('click', () => {
      root.style.display = 'none';
      document.getElementById('ucav-reopen').style.display = 'block';
    });
    head.append(title, btn, x);
    const status = document.createElement('div');
    status.id = 'ucav-status';
    status.style.cssText = 'margin-top:8px;color:#94a3b8;font-size:11px';
    status.textContent = knownId ? 'Ready.' : `Visit the public course page once to cache “${slug}”.`;
    const toast = document.createElement('div');
    toast.id = 'ucav-toast';
    toast.style.cssText =
      'display:none;margin-top:8px;padding:7px 9px;border-radius:7px;font-size:12px;color:#fff';
    card.append(head, status, toast);
    const bar = document.createElement('button');
    bar.id = 'ucav-reopen';
    bar.textContent = '⚡';
    bar.style.cssText =
      'display:none;position:fixed;left:16px;bottom:16px;z-index:2147483647;background:#0f172a;color:#e2e8f0;border:0;border-radius:50%;width:36px;height:36px;font-size:16px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35)';
    bar.addEventListener('click', () => {
      bar.style.display = 'none';
      root.style.display = 'block';
    });
    root.append(card, bar);
    document.documentElement.appendChild(root);
  }

  mount();
})();
