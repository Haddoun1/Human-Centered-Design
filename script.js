document.body.classList.add('dark');

(function () {

  // ── Sentence splitter ──────────────────────────────────────────
  function splitSentences(text) {
    const raw = text.replace(/\s+/g, ' ').trim();
    const parts = [];
    const re = /[^.!?]*[.!?]+(?:\s|$)/g;
    let match;
    let lastIndex = 0;
    while ((match = re.exec(raw)) !== null) {
      parts.push(match[0].trim());
      lastIndex = re.lastIndex;
    }
    // Any remaining text without trailing punctuation
    const tail = raw.slice(lastIndex).trim();
    if (tail) parts.push(tail);
    return parts.filter(s => s.length > 0);
  }


  // ── State ──────────────────────────────────────────────────────
  const annotations = {}; // key: "p{pIdx}-s{sIdx}" → { note, pIdx, sIdx, text }
  let activeKey = null;   // which sentence is currently selected for input


  // ── Build sentence spans ───────────────────────────────────────
  const paragraphs = document.querySelectorAll('#text-content p');

  paragraphs.forEach((p, pIdx) => {
    const raw = p.textContent;
    const sentences = splitSentences(raw);
    p.innerHTML = '';

    sentences.forEach((sent, sIdx) => {
      const key = `p${pIdx}-s${sIdx}`;
      const span = document.createElement('span');
      span.className = 'sentence';
      span.tabIndex = 0;
      span.dataset.key = key;
      span.dataset.pIdx = pIdx;
      span.dataset.sIdx = sIdx;
      span.setAttribute('role', 'button');
      span.setAttribute('aria-label', `Alinea ${pIdx + 1}, zin ${sIdx + 1}: ${sent}`);
      span.textContent = sent;

      // Space between sentences
      span.insertAdjacentText('beforebegin', sIdx > 0 ? ' ' : '');

      span.addEventListener('click', () => selectSentence(key, span));
      span.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectSentence(key, span);
        }
      });

      p.appendChild(span);
    });
  });


  // ── Select sentence ────────────────────────────────────────────
  function selectSentence(key, span) {
    // Already annotated → open edit mode
    if (annotations[key]) {
      openEditMode(key);
      return;
    }

    // Deselect previous active sentence
    if (activeKey && activeKey !== key) {
      document.querySelectorAll('.sentence').forEach(s => s.classList.remove('active-select'));
      removeInputCard();
    }

    activeKey = key;
    span.classList.add('active-select');

    const pIdx = parseInt(span.dataset.pIdx);
    const sIdx = parseInt(span.dataset.sIdx);
    const sentText = span.textContent;

    showInputCard(key, pIdx, sIdx, sentText);
  }


  // ── Show input card in annotation pane ────────────────────────
  function showInputCard(key, pIdx, sIdx, sentText) {
    removeInputCard();
    updateEmptyState();

    const card = document.createElement('div');
    card.className = 'annotation-input-card';
    card.id = 'active-input-card';

    card.innerHTML = `
      <div class="ref-label">Alinea ${pIdx + 1} · Zin ${sIdx + 1}</div>
      <div class="sentence-preview">${escHtml(sentText)}</div>
      <textarea id="note-textarea" placeholder="Schrijf hier uw annotatie…" rows="3"></textarea>
      <div class="input-actions">
        <button class="btn btn-cancel" id="btn-cancel-annotation">Annuleer</button>
        <button class="btn btn-save" id="btn-save-annotation">Opslaan</button>
      </div>
    `;

    const list = document.getElementById('annotation-list');
    list.insertBefore(card, list.firstChild);

    const textarea = card.querySelector('#note-textarea');
    textarea.focus();

    card.querySelector('#btn-save-annotation').addEventListener('click', () => {
      saveAnnotation(key, pIdx, sIdx, sentText, textarea.value.trim());
    });

    card.querySelector('#btn-cancel-annotation').addEventListener('click', () => {
      cancelInput();
    });

    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        saveAnnotation(key, pIdx, sIdx, sentText, textarea.value.trim());
      }
      if (e.key === 'Escape') cancelInput();
    });

    updateEmptyState();
  }


  // ── Cancel input ───────────────────────────────────────────────
  function cancelInput() {
    if (activeKey) {
      const span = document.querySelector(`.sentence[data-key="${activeKey}"]`);
      if (span) span.classList.remove('active-select');
    }
    activeKey = null;
    removeInputCard();
    updateEmptyState();
  }

  function removeInputCard() {
    const existing = document.getElementById('active-input-card');
    if (existing) existing.remove();
  }


  // ── Save annotation ────────────────────────────────────────────
  function saveAnnotation(key, pIdx, sIdx, sentText, note) {
    if (!note) { cancelInput(); return; }

    annotations[key] = { note, pIdx, sIdx, text: sentText };

    const span = document.querySelector(`.sentence[data-key="${key}"]`);
    if (span) {
      span.classList.remove('active-select');
      span.classList.add('annotated');
      span.dataset.notePreview = note.length > 50 ? note.slice(0, 50) + '…' : note;
    }

    activeKey = null;
    removeInputCard();
    renderAnnotationCard(key);
    updateEmptyState();
  }


  // ── Render saved annotation card ───────────────────────────────
  function renderAnnotationCard(key) {
    const a = annotations[key];
    if (!a) return;

    // Remove existing card for this key if present
    const existing = document.querySelector(`.annotation-card[data-key="${key}"]`);
    if (existing) existing.remove();

    const card = document.createElement('div');
    card.className = 'annotation-card';
    card.dataset.key = key;

    card.innerHTML = `
      <div class="card-ref">Alinea ${a.pIdx + 1} · Zin ${a.sIdx + 1}</div>
      <div class="card-sentence">${escHtml(a.text)}</div>
      <div class="card-note">${escHtml(a.note)}</div>
      <div class="card-actions">
        <button class="btn btn-edit">Bewerken</button>
        <button class="btn btn-delete">Verwijderen</button>
      </div>
    `;

    card.querySelector('.btn-edit').addEventListener('click', () => openEditMode(key));
    card.querySelector('.btn-delete').addEventListener('click', () => deleteAnnotation(key));

    // Click card body → scroll to sentence in text
    card.addEventListener('click', e => {
      if (e.target.classList.contains('btn')) return;
      scrollToSentence(key);
    });

    // Insert sorted by paragraph index, then sentence index
    const list = document.getElementById('annotation-list');
    const cards = [...list.querySelectorAll('.annotation-card')];
    const insertBefore = cards.find(c => {
      const k = c.dataset.key;
      if (!annotations[k]) return false;
      const { pIdx, sIdx } = annotations[k];
      return pIdx > a.pIdx || (pIdx === a.pIdx && sIdx > a.sIdx);
    });

    if (insertBefore) list.insertBefore(card, insertBefore);
    else list.appendChild(card);
  }


  // ── Edit mode ─────────────────────────────────────────────────
  function openEditMode(key) {
    const a = annotations[key];
    if (!a) return;

    removeInputCard();
    const existingCard = document.querySelector(`.annotation-card[data-key="${key}"]`);
    if (!existingCard) return;

    const noteEl = existingCard.querySelector('.card-note');
    const actionsEl = existingCard.querySelector('.card-actions');

    const textarea = document.createElement('textarea');
    Object.assign(textarea.style, {
      width: '100%',
      background: '#1a1a2e',
      border: '1.5px solid var(--accent)',
      borderRadius: '5px',
      color: 'var(--text)',
      fontFamily: 'var(--font-ui)',
      fontSize: '0.83rem',
      lineHeight: '1.5',
      padding: '0.5rem 0.65rem',
      resize: 'vertical',
      minHeight: '70px',
      marginTop: '0.4rem',
    });
    textarea.value = a.note;

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    actions.innerHTML = `
      <button class="btn btn-cancel" style="font-size:0.72rem;padding:0.25rem 0.65rem;border:1.5px solid var(--border);background:transparent;color:var(--muted)">Annuleer</button>
      <button class="btn btn-save" style="font-size:0.72rem;padding:0.25rem 0.65rem">Opslaan</button>
    `;

    noteEl.replaceWith(textarea);
    actionsEl.replaceWith(actions);
    textarea.focus();

    actions.querySelector('.btn-save').addEventListener('click', () => {
      const newNote = textarea.value.trim();
      if (!newNote) { deleteAnnotation(key); return; }
      annotations[key].note = newNote;
      const span = document.querySelector(`.sentence[data-key="${key}"]`);
      if (span) span.dataset.notePreview = newNote.length > 50 ? newNote.slice(0, 50) + '…' : newNote;
      existingCard.remove();
      renderAnnotationCard(key);
      updateEmptyState();
    });

    actions.querySelector('.btn-cancel').addEventListener('click', () => {
      existingCard.remove();
      renderAnnotationCard(key);
    });

    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) actions.querySelector('.btn-save').click();
      if (e.key === 'Escape') actions.querySelector('.btn-cancel').click();
    });
  }


  // ── Delete annotation ─────────────────────────────────────────
  function deleteAnnotation(key) {
    delete annotations[key];

    const span = document.querySelector(`.sentence[data-key="${key}"]`);
    if (span) {
      span.classList.remove('annotated', 'active-select');
      delete span.dataset.notePreview;
    }

    const card = document.querySelector(`.annotation-card[data-key="${key}"]`);
    if (card) card.remove();

    updateEmptyState();
  }


  // ── Scroll & focus a sentence ─────────────────────────────────
  function scrollToSentence(key) {
    const span = document.querySelector(`.sentence[data-key="${key}"]`);
    if (span) {
      span.scrollIntoView({ behavior: 'smooth', block: 'center' });
      span.focus();
    }
  }


  // ── Empty state visibility ─────────────────────────────────────
  function updateEmptyState() {
    const emptyState = document.getElementById('empty-state');
    const hasContent = Object.keys(annotations).length > 0 || document.getElementById('active-input-card');
    emptyState.style.display = hasContent ? 'none' : 'flex';
  }


  // ── Helpers ───────────────────────────────────────────────────
  function escHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }


  // ── Init ──────────────────────────────────────────────────────
  updateEmptyState();

})();