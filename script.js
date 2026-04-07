console.log('Bomboclat');

// ──────────────────────────────────────────────────────────────────────────
// ARIA LIVE REGION — injected because it is not in the HTML
// ──────────────────────────────────────────────────────────────────────────
const ariaLive = document.createElement('div');
ariaLive.id = 'aria-live';
ariaLive.setAttribute('aria-live', 'polite');
ariaLive.setAttribute('aria-atomic', 'true');
ariaLive.setAttribute('role', 'status');
document.body.prepend(ariaLive);

// ──────────────────────────────────────────────────────────────────────────
// DARK MODE — toggle button injected into the header
// ──────────────────────────────────────────────────────────────────────────
const btnDarkmode = document.createElement('button');
btnDarkmode.id = 'btn-darkmode';
btnDarkmode.setAttribute('aria-pressed', 'false');
btnDarkmode.setAttribute('aria-label', 'Donkere modus inschakelen');
btnDarkmode.textContent = 'Donkere modus';
document.querySelector('header').appendChild(btnDarkmode);

const DARK_KEY = 'darkmode';

function applyDarkMode(enabled) {
  document.body.classList.toggle('dark', enabled);
  btnDarkmode.setAttribute('aria-pressed', String(enabled));
  if (enabled) {
    btnDarkmode.textContent = 'Lichte modus';
    btnDarkmode.setAttribute('aria-label', 'Lichte modus inschakelen');
  } else {
    btnDarkmode.textContent = 'Donkere modus';
    btnDarkmode.setAttribute('aria-label', 'Donkere modus inschakelen');
  }
  localStorage.setItem(DARK_KEY, enabled ? '1' : '0');
}

// Restore preference from previous visit
const savedDark = localStorage.getItem(DARK_KEY);
if (savedDark === '1' || (savedDark === null && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  applyDarkMode(true);
}

btnDarkmode.addEventListener('click', () => {
  applyDarkMode(!document.body.classList.contains('dark'));
  announce(document.body.classList.contains('dark') ? 'Donkere modus ingeschakeld.' : 'Lichte modus ingeschakeld.');
});

// ──────────────────────────────────────────────────────────────────────────
// STATE
// ──────────────────────────────────────────────────────────────────────────
let sentences = [];          // array of { id, text }
let annotations = {};        // { sentenceId: noteText }
let activeSentenceId = null; // sentence currently open in the editor

// ──────────────────────────────────────────────────────────────────────────
// DOM REFS
// ──────────────────────────────────────────────────────────────────────────
const textContent      = document.getElementById('text-content');
const annotationEditor = document.getElementById('annotation-editor');
const editorPreview    = document.getElementById('editor-sentence-preview');
const annotationNote   = document.getElementById('annotation-note');
const annotationList   = document.getElementById('annotation-list');
const emptyState       = document.getElementById('empty-state');
const btnSave          = document.getElementById('btn-save-annotation');
const btnCancel        = document.getElementById('btn-cancel-annotation');
const btnDelete        = document.getElementById('btn-delete-annotation');

// ──────────────────────────────────────────────────────────────────────────
// UTILITY: announce to screen reader (NVDA compatible)
// ──────────────────────────────────────────────────────────────────────────
function announce(msg) {
  ariaLive.textContent = '';
  setTimeout(() => { ariaLive.textContent = msg; }, 50);
}

// ──────────────────────────────────────────────────────────────────────────
// PARSE: read text from the existing <p> inside #text-content,
// split into sentences on every . ! or ?
// ──────────────────────────────────────────────────────────────────────────
function parseSentencesFromDOM() {
  const p = textContent.querySelector('p');
  if (!p) return [];
  const raw = p.textContent.match(/[^.!?]+[.!?]+/g) || [p.textContent];
  return raw
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map((s, i) => ({ id: `s${i}`, text: s }));
}

// ──────────────────────────────────────────────────────────────────────────
// RENDER: replace the <p> content with individual focusable <span> elements
// Each span is a list item so NVDA can navigate it with TAB or virtual cursor
// ──────────────────────────────────────────────────────────────────────────
function renderSentences() {
  textContent.innerHTML = '';
  sentences.forEach((s, idx) => {
    const span = document.createElement('span');
    span.id = `sentence-${s.id}`;
    span.className = 'sentence';
    span.setAttribute('role', 'listitem');
    span.setAttribute('tabindex', '0');
    span.setAttribute('data-id', s.id);
    span.textContent = s.text + ' ';
    span.setAttribute('aria-label', buildAriaLabel(s, idx));

    if (annotations[s.id]) span.classList.add('has-annotation');

    // Mouse click
    span.addEventListener('click', () => openEditor(s.id));

    // Keyboard: Enter or Space opens the editor
    span.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openEditor(s.id);
      }
    });

    textContent.appendChild(span);
  });
}

function buildAriaLabel(s, idx) {
  const note = annotations[s.id] ? ', heeft annotatie' : '';
  return `Zin ${idx + 1}${note}: ${s.text}. Druk op Enter of spatie om te annoteren.`;
}

function refreshSentenceSpan(id) {
  const span = document.getElementById(`sentence-${id}`);
  if (!span) return;
  const idx = sentences.findIndex(s => s.id === id);
  span.setAttribute('aria-label', buildAriaLabel(sentences[idx], idx));
  span.classList.toggle('has-annotation', !!annotations[id]);
}

// ──────────────────────────────────────────────────────────────────────────
// EDITOR: open / close
// ──────────────────────────────────────────────────────────────────────────
function openEditor(id) {
  // Clear previous active highlight
  if (activeSentenceId) {
    const prev = document.getElementById(`sentence-${activeSentenceId}`);
    if (prev) prev.classList.remove('active');
  }

  activeSentenceId = id;
  const s = sentences.find(x => x.id === id);

  document.getElementById(`sentence-${id}`).classList.add('active');

  editorPreview.textContent = `"${s.text}"`;
  annotationNote.value = annotations[id] || '';
  btnDelete.style.display = annotations[id] ? 'inline-block' : 'none';

  annotationEditor.classList.add('visible');
  annotationEditor.removeAttribute('aria-hidden');

  // Move focus to the textarea so NVDA reads the editor immediately
  annotationNote.focus();

  announce(`Annotatie bewerken voor zin: ${s.text}`);
}

function closeEditor() {
  annotationEditor.classList.remove('visible');
  annotationEditor.setAttribute('aria-hidden', 'true');

  if (activeSentenceId) {
    const span = document.getElementById(`sentence-${activeSentenceId}`);
    if (span) {
      span.classList.remove('active');
      span.focus(); // return focus to the sentence in the reading pane
    }
  }
  activeSentenceId = null;
  annotationNote.value = '';
}

// ──────────────────────────────────────────────────────────────────────────
// SAVE / DELETE
// ──────────────────────────────────────────────────────────────────────────
function saveAnnotation() {
  const note = annotationNote.value.trim();
  if (!note) {
    announce('Notitie is leeg. Schrijf eerst iets voor je opslaat.');
    annotationNote.focus();
    return;
  }
  annotations[activeSentenceId] = note;
  refreshSentenceSpan(activeSentenceId);
  renderAnnotationList();
  announce('Annotatie opgeslagen.');
  closeEditor();
}

function deleteAnnotation() {
  if (!activeSentenceId || !annotations[activeSentenceId]) return;
  delete annotations[activeSentenceId];
  refreshSentenceSpan(activeSentenceId);
  renderAnnotationList();
  announce('Annotatie verwijderd.');
  closeEditor();
}

// ──────────────────────────────────────────────────────────────────────────
// RENDER ANNOTATION LIST
// ──────────────────────────────────────────────────────────────────────────
function renderAnnotationList() {
  annotationList.innerHTML = '';
  const ids = Object.keys(annotations);

  emptyState.style.display = ids.length === 0 ? 'block' : 'none';
  if (ids.length === 0) return;

  // Keep annotations in reading order
  ids.sort((a, b) => {
    return sentences.findIndex(s => s.id === a) - sentences.findIndex(s => s.id === b);
  });

  ids.forEach(id => {
    const s = sentences.find(x => x.id === id);
    if (!s) return;

    const card = document.createElement('div');
    card.className = 'annotation-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `Annotatie voor: ${s.text}`);

    const sentenceEl = document.createElement('p');
    sentenceEl.className = 'card-sentence';
    sentenceEl.textContent = `"${s.text}"`;

    const noteEl = document.createElement('p');
    noteEl.className = 'card-note';
    noteEl.textContent = annotations[id];

    const actions = document.createElement('div');
    actions.className = 'card-actions';

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Bewerken';
    editBtn.setAttribute('aria-label', `Annotatie bewerken voor: ${s.text}`);
    editBtn.addEventListener('click', () => {
      const span = document.getElementById(`sentence-${id}`);
      if (span) span.scrollIntoView({ behavior: 'smooth', block: 'center' });
      openEditor(id);
    });

    // Jump to sentence button
    const jumpBtn = document.createElement('button');
    jumpBtn.textContent = 'Ga naar zin';
    jumpBtn.setAttribute('aria-label', `Spring naar zin in leesgedeelte: ${s.text}`);
    jumpBtn.addEventListener('click', () => {
      const span = document.getElementById(`sentence-${id}`);
      if (span) {
        span.scrollIntoView({ behavior: 'smooth', block: 'center' });
        span.focus();
        announce(`Gesprongen naar: ${s.text}`);
      }
    });

    // Delete button
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Verwijderen';
    delBtn.className = 'danger';
    delBtn.setAttribute('aria-label', `Annotatie verwijderen voor: ${s.text}`);
    delBtn.addEventListener('click', () => {
      delete annotations[id];
      refreshSentenceSpan(id);
      renderAnnotationList();
      announce('Annotatie verwijderd.');
    });

    actions.appendChild(editBtn);
    actions.appendChild(jumpBtn);
    actions.appendChild(delBtn);

    card.appendChild(sentenceEl);
    card.appendChild(noteEl);
    card.appendChild(actions);
    annotationList.appendChild(card);
  });
}

// ──────────────────────────────────────────────────────────────────────────
// EDITOR BUTTON EVENTS
// ──────────────────────────────────────────────────────────────────────────
btnSave.addEventListener('click', saveAnnotation);

btnCancel.addEventListener('click', () => {
  closeEditor();
  announce('Annotatie geannuleerd.');
});

btnDelete.addEventListener('click', deleteAnnotation);

// Ctrl+Enter saves; Escape cancels — both work well with NVDA
annotationNote.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.ctrlKey) {
    e.preventDefault();
    saveAnnotation();
  }
  if (e.key === 'Escape') {
    closeEditor();
  }
});

// ──────────────────────────────────────────────────────────────────────────
// INIT
// ──────────────────────────────────────────────────────────────────────────
sentences = parseSentencesFromDOM();
renderSentences();
renderAnnotationList();
annotationEditor.setAttribute('aria-hidden', 'true');