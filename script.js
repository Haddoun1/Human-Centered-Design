(function () {

  // ─────────────────────────────────────────────────────────────────────────────
  // STATE
  // Holds all saved annotations and tracks which sentence is being edited.
  // ─────────────────────────────────────────────────────────────────────────────

  const annotations = {}; // key: "p{pIdx}-s{sIdx}" → { note, pIdx, sIdx, text }
  let activeKey = null;         // key of the sentence currently selected for input
  let lastFocusedSentence = null; // key of the last sentence the user was on (even without annotating)


  // ─────────────────────────────────────────────────────────────────────────────
  // UTILITY: escHtml
  // Escapes special HTML characters so user text is safe to inject into innerHTML.
  // Safe to delete if you never insert user content via innerHTML.
  // ─────────────────────────────────────────────────────────────────────────────

  function escHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // UTILITY: splitSentences
  // Splits a block of text into individual sentences based on .!? punctuation.
  // Returns an array of sentence strings.
  // ─────────────────────────────────────────────────────────────────────────────

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

    // Catch any trailing text without punctuation
    const tail = raw.slice(lastIndex).trim();
    if (tail) parts.push(tail);

    return parts.filter(s => s.length > 0);
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // UTILITY: updateEmptyState
  // Shows or hides the "#empty-state" element depending on whether there are
  // any annotations or an active input card. Call after any add/remove action.
  // ─────────────────────────────────────────────────────────────────────────────

  function updateEmptyState() {
    const emptyState = document.getElementById('empty-state');
    const hasContent =
      Object.keys(annotations).length > 0 ||
      document.getElementById('active-input-card') !== null;
    emptyState.style.display = hasContent ? 'none' : 'flex';
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // UTILITY: scrollToSentence
  // Smoothly scrolls the page so the sentence span for a given key is visible,
  // then focuses it for keyboard users.
  // ─────────────────────────────────────────────────────────────────────────────

  function scrollToSentence(key) {
    const span = document.querySelector(`.sentence[data-key="${key}"]`);
    if (span) {
      span.scrollIntoView({ behavior: 'smooth', block: 'center' });
      span.focus();
    }
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // BUILD: buildSentenceSpans
  // Reads every <p> inside #text-content, splits the text into sentences, and
  // replaces the raw text with individual <span class="sentence"> elements.
  // Each span gets click + keyboard handlers that call selectSentence().
  // ─────────────────────────────────────────────────────────────────────────────

  function buildSentenceSpans() {
    const paragraphs = document.querySelectorAll('#text-content p');

    paragraphs.forEach((p, pIdx) => {
      const sentences = splitSentences(p.textContent);
      p.innerHTML = '';

      sentences.forEach((sent, sIdx) => {
        const key = `p${pIdx}-s${sIdx}`;
        const span = document.createElement('button');

        span.className = 'sentence';
        span.dataset.key = key;
        span.dataset.pIdx = pIdx;
        span.dataset.sIdx = sIdx;
        // No aria-label needed — button reads its own text content,
        // and "knop" / "gebied klikbaar" announcements are gone.
        span.textContent = sent;

        // Add a space before every sentence except the first
        span.insertAdjacentText('beforebegin', sIdx > 0 ? ' ' : '');

        span.addEventListener('click', () => selectSentence(key, span));
        span.addEventListener('focus', () => { lastFocusedSentence = key; });

        p.appendChild(span);
      });
    });
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // INTERACTION: selectSentence
  // Called when the user clicks or presses Enter/Space on a sentence span.
  // - If the sentence already has an annotation → open edit mode.
  // - Otherwise → deselect any other active sentence, then show the input card.
  // ─────────────────────────────────────────────────────────────────────────────

  function selectSentence(key, span) {
    if (annotations[key]) {
      openEditMode(key);
      return;
    }

    // Deselect the previously active sentence if it's a different one
    if (activeKey && activeKey !== key) {
      document.querySelectorAll('.sentence').forEach(s => s.classList.remove('active-select'));
      removeInputCard();
    }

    activeKey = key;
    span.classList.add('active-select');

    const pIdx = parseInt(span.dataset.pIdx);
    const sIdx = parseInt(span.dataset.sIdx);

    showInputCard(key, pIdx, sIdx, span.textContent);
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // INPUT CARD: showInputCard
  // Inserts a temporary card at the top of #annotation-list where the user can
  // type their annotation. Wires up Save / Cancel buttons and Ctrl+Enter / Esc.
  // ─────────────────────────────────────────────────────────────────────────────

  function showInputCard(key, pIdx, sIdx, sentText) {
    removeInputCard(); // Clear any pre-existing card first
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
        <button class="btn btn-save"   id="btn-save-annotation">Opslaan</button>
      </div>
    `;

    const list = document.getElementById('annotation-list');
    list.insertBefore(card, list.firstChild);

    const textarea = card.querySelector('#note-textarea');
    textarea.focus();

    card.querySelector('#btn-save-annotation').addEventListener('click', () => {
      saveAnnotation(key, pIdx, sIdx, sentText, textarea.value.trim());
    });

    card.querySelector('#btn-cancel-annotation').addEventListener('click', cancelInput);

    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Plain Enter saves; Shift+Enter inserts a newline (default behaviour)
        e.preventDefault();
        saveAnnotation(key, pIdx, sIdx, sentText, textarea.value.trim());
      }
      if (e.key === 'Escape') cancelInput();
    });

    updateEmptyState();
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // INPUT CARD: removeInputCard
  // Removes the active input card from the DOM if it exists.
  // Standalone — safe to call even when no card is present.
  // ─────────────────────────────────────────────────────────────────────────────

  function removeInputCard() {
    const existing = document.getElementById('active-input-card');
    if (existing) existing.remove();
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // INPUT CARD: cancelInput
  // Removes the active selection highlight, clears activeKey, removes the input
  // card, and updates the empty state message.
  // ─────────────────────────────────────────────────────────────────────────────

  function cancelInput() {
    if (activeKey) {
      const span = document.querySelector(`.sentence[data-key="${activeKey}"]`);
      if (span) span.classList.remove('active-select');
    }
    activeKey = null;
    removeInputCard();
    updateEmptyState();
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // ANNOTATION: saveAnnotation
  // Persists a new annotation to the `annotations` object, marks the sentence
  // span as annotated, and renders the saved annotation card in the sidebar.
  // If the note is empty, cancels instead of saving.
  // ─────────────────────────────────────────────────────────────────────────────

  function saveAnnotation(key, pIdx, sIdx, sentText, note) {
    if (!note) {
      cancelInput();
      return;
    }

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
    // Return focus to the reading panel so the user can continue reading
    focusPanel('reading');
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // ANNOTATION: renderAnnotationCard
  // Creates (or re-creates) a saved annotation card for the given key and inserts
  // it into #annotation-list in document order (by paragraph, then sentence).
  // Wires up Edit / Delete buttons and a click-to-scroll on the card body.
  // ─────────────────────────────────────────────────────────────────────────────

  function renderAnnotationCard(key) {
    const a = annotations[key];
    if (!a) return;

    // Remove any existing card for this key before re-rendering
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

    // Clicking the card body (not buttons) scrolls to the sentence in the text
    card.addEventListener('click', e => {
      if (!e.target.classList.contains('btn')) scrollToSentence(key);
    });

    // Insert the card in reading order
    insertCardInOrder(card, a);
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // ANNOTATION: insertCardInOrder
  // Finds the correct position in #annotation-list to insert `card` so that all
  // cards remain sorted by paragraph index, then sentence index.
  // ─────────────────────────────────────────────────────────────────────────────

  function insertCardInOrder(card, annotation) {
    const list = document.getElementById('annotation-list');
    const cards = [...list.querySelectorAll('.annotation-card')];

    const insertBefore = cards.find(c => {
      const existing = annotations[c.dataset.key];
      if (!existing) return false;
      return (
        existing.pIdx > annotation.pIdx ||
        (existing.pIdx === annotation.pIdx && existing.sIdx > annotation.sIdx)
      );
    });

    if (insertBefore) list.insertBefore(card, insertBefore);
    else list.appendChild(card);
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // ANNOTATION: deleteAnnotation
  // Removes an annotation from state, strips the highlight from the sentence
  // span, removes the card from the sidebar, and updates the empty state.
  // ─────────────────────────────────────────────────────────────────────────────

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


  // ─────────────────────────────────────────────────────────────────────────────
  // ANNOTATION: openEditMode
  // Transforms an existing saved annotation card into an inline edit form.
  // Replaces the note text and action buttons with a textarea + Save/Cancel.
  // On save it updates `annotations` and re-renders the card.
  // On cancel it just re-renders the card as it was.
  // ─────────────────────────────────────────────────────────────────────────────

  function openEditMode(key) {
    const a = annotations[key];
    if (!a) return;

    removeInputCard(); // close any floating input card

    const existingCard = document.querySelector(`.annotation-card[data-key="${key}"]`);
    if (!existingCard) return;

    // Swap the note element for a textarea
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
      <button class="btn btn-save"   style="font-size:0.72rem;padding:0.25rem 0.65rem">Opslaan</button>
    `;

    noteEl.replaceWith(textarea);
    actionsEl.replaceWith(actions);
    textarea.focus();

    actions.querySelector('.btn-save').addEventListener('click', () => {
      const newNote = textarea.value.trim();
      if (!newNote) {
        deleteAnnotation(key); // empty save = delete
        return;
      }
      annotations[key].note = newNote;

      // Update the tooltip preview on the sentence span
      const span = document.querySelector(`.sentence[data-key="${key}"]`);
      if (span) {
        span.dataset.notePreview = newNote.length > 50 ? newNote.slice(0, 50) + '…' : newNote;
      }

      existingCard.remove();
      renderAnnotationCard(key);
      updateEmptyState();
    });

    actions.querySelector('.btn-cancel').addEventListener('click', () => {
      existingCard.remove();
      renderAnnotationCard(key); // re-render original card
    });

    textarea.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        // Plain Enter saves; Shift+Enter inserts a newline (default behaviour)
        e.preventDefault();
        actions.querySelector('.btn-save').click();
      }
      if (e.key === 'Escape') actions.querySelector('.btn-cancel').click();
    });
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // PANEL NAVIGATION: state
  // Tracks which panel is currently active: 'reading' or 'annotation'.
  // ─────────────────────────────────────────────────────────────────────────────

  let activePanel = 'reading'; // start in the reading panel


  // ─────────────────────────────────────────────────────────────────────────────
  // PANEL NAVIGATION: announce
  // Sends a message to the screen reader via an aria-live region without
  // moving focus. Uses 'assertive' so it interrupts the current speech.
  // The content is cleared and reset via requestAnimationFrame so repeating
  // the same message still fires a new announcement.
  // ─────────────────────────────────────────────────────────────────────────────

  function announce(message) {
    const region = document.getElementById('sr-announcer');
    if (!region) return;
    region.textContent = '';
    requestAnimationFrame(() => {
      region.textContent = message;
    });
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // PANEL NAVIGATION: buildAnnouncerRegion
  // Creates a visually hidden aria-live="assertive" element in the DOM.
  // Screen readers watch this element and speak its content when it changes.
  // ─────────────────────────────────────────────────────────────────────────────

  function buildAnnouncerRegion() {
    const region = document.createElement('div');
    region.id = 'sr-announcer';
    region.setAttribute('aria-live', 'assertive');
    region.setAttribute('aria-atomic', 'true');
    Object.assign(region.style, {
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clip: 'rect(0,0,0,0)',
      whiteSpace: 'nowrap',
    });
    document.body.appendChild(region);
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // PANEL NAVIGATION: focusPanel
  // Moves keyboard focus into the given panel ('reading' or 'annotation') and
  // announces what the user can do there.
  // ─────────────────────────────────────────────────────────────────────────────

  function focusPanel(panel) {
    activePanel = panel;

    if (panel === 'reading') {
      const resumeKey = lastFocusedSentence || activeKey;
      const target =
        (resumeKey && document.querySelector(`.sentence[data-key="${resumeKey}"]`)) ||
        document.querySelector('.sentence');
      if (target) target.focus();
      announce(
        'Leesvenster actief. ' +
        'Gebruik Tab en Shift+Tab om door zinnen te navigeren. ' +
        'Druk op Enter om een zin te annoteren. ' +
        'Druk op de K-toets om naar het annotatievenster te gaan.'
      );
    } else {
      const annotationPanel =
        document.getElementById('annotation-panel') ||
        document.getElementById('annotation-list');
      const firstFocusable = annotationPanel
        ? annotationPanel.querySelector('button, textarea, input, [tabindex="0"]')
        : null;
      if (firstFocusable) firstFocusable.focus();
      else if (annotationPanel) annotationPanel.focus();
      announce(
        'Annotatievenster actief. ' +
        'Gebruik Tab en Shift+Tab om door annotaties te navigeren. ' +
        'Druk op de K-toets om terug te gaan naar het leesvenster.'
      );
    }
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // PANEL NAVIGATION: handlePanelSwitch
  // Global keydown listener. ArrowRight switches to the annotation panel,
  // ArrowLeft switches back to reading — but only when focus is NOT inside a
  // textarea or text input so the user can still type arrow characters freely.
  // ─────────────────────────────────────────────────────────────────────────────

  function handlePanelSwitch(e) {
    // Never intercept K while the user is typing in a text field
    const tag = document.activeElement && document.activeElement.tagName.toLowerCase();
    const isTyping = tag === 'textarea' || tag === 'input';
    if (isTyping) return;

    if (e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      // Toggle: reading → annotation, annotation → reading
      focusPanel(activePanel === 'reading' ? 'annotation' : 'reading');
    }
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // PANEL NAVIGATION: trackActivePanelByFocus
  // Keeps `activePanel` in sync when the user moves focus manually (e.g. with
  // the mouse or Tab) so ArrowLeft/Right always switch in the right direction.
  // ─────────────────────────────────────────────────────────────────────────────

  function trackActivePanelByFocus() {
    document.addEventListener('focusin', e => {
      const readingPanel = document.getElementById('text-content');
      const annotationPanel =
        document.getElementById('annotation-panel') ||
        document.getElementById('annotation-list');

      if (readingPanel && readingPanel.contains(e.target)) {
        activePanel = 'reading';
      } else if (annotationPanel && annotationPanel.contains(e.target)) {
        activePanel = 'annotation';
      }
    });
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // PANEL NAVIGATION: announceStartupInstructions
  // Waits a short moment after page load then reads the instructions once so
  // the user knows how to use the tool before they start tabbing through text.
  // ─────────────────────────────────────────────────────────────────────────────

  function announceStartupInstructions() {
    // Hide the page content from the accessibility tree immediately so the
    // screen reader does not read headings, paragraphs or other elements on
    // load. The instructions are injected via the live region instead.
    // aria-hidden is removed after the instructions finish playing (~4 s).
    const contentAreas = [
      document.getElementById('text-content'),
      document.getElementById('annotation-panel') || document.getElementById('annotation-list'),
      document.querySelector('header'),
      document.querySelector('main'),
      document.querySelector('h1'),
      document.querySelector('h2'),
      document.querySelector('nav'),
    ].filter(Boolean);

    contentAreas.forEach(el => el.setAttribute('aria-hidden', 'true'));

    setTimeout(() => {
      announce(
        'Welkom bij het annotatiehulpmiddel. ' +
        'De pagina is verdeeld in twee vensters: een leesvenster en een annotatievenster. ' +
        'Gebruik Tab en Shift+Tab om door zinnen in het leesvenster te navigeren. ' +
        'Druk op Enter om een geselecteerde zin te annoteren. ' +
        'Druk op de K-toets om te wisselen tussen het leesvenster en het annotatievenster.'
      );
    }, 300);

    // Restore the content areas after the instructions have had time to play
    setTimeout(() => {
      contentAreas.forEach(el => el.removeAttribute('aria-hidden'));
    }, 5000);
  }


  // ─────────────────────────────────────────────────────────────────────────────
  // INIT
  // Entry point. Builds the sentence spans, sets up panel navigation, and reads
  // out the startup instructions via the screen reader.
  // ─────────────────────────────────────────────────────────────────────────────

  buildAnnouncerRegion();
  buildSentenceSpans();
  updateEmptyState();
  trackActivePanelByFocus();
  document.addEventListener('keydown', handlePanelSwitch);
  announceStartupInstructions();

})();