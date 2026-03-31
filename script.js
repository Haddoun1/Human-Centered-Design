let selectedRange = null;

// Load saved annotations on page load
window.addEventListener("DOMContentLoaded", loadAnnotations);

// Right-click handler
document.addEventListener("contextmenu", function (e) {
  const selection = window.getSelection();

  if (selection.toString().length > 0) {
    e.preventDefault();

    selectedRange = selection.getRangeAt(0);

    const menu = document.getElementById("menu");
    menu.style.display = "block";
    menu.style.left = e.pageX + "px";
    menu.style.top = e.pageY + "px";
  }
});

// Hide menu
document.addEventListener("click", function () {
  document.getElementById("menu").style.display = "none";
});

// Create annotation
function annotate() {
  if (!selectedRange) return;

  const span = document.createElement("span");
  span.className = "highlight";

  const id = Date.now();
  span.dataset.id = id;

  selectedRange.surroundContents(span);

  saveAnnotation(span.innerText, id);

  addRemoveHandler(span);

  window.getSelection().removeAllRanges();
}

// Save to localStorage
function saveAnnotation(text, id) {
  let annotations = JSON.parse(localStorage.getItem("annotations")) || [];

  annotations.push({ text, id });

  localStorage.setItem("annotations", JSON.stringify(annotations));
}

// Load annotations
function loadAnnotations() {
  let annotations = JSON.parse(localStorage.getItem("annotations")) || [];

  const container = document.getElementById("text");

  annotations.forEach(a => {
    highlightText(container, a.text, a.id);
  });
}

// Apply highlight again
function highlightText(container, text, id) {
  const innerHTML = container.innerHTML;

  const index = innerHTML.indexOf(text);
  if (index === -1) return;

  const before = innerHTML.substring(0, index);
  const after = innerHTML.substring(index + text.length);

  container.innerHTML =
    before +
    `<span class="highlight" data-id="${id}">${text}</span>` +
    after;

  const span = container.querySelector(`[data-id="${id}"]`);
  addRemoveHandler(span);
}

// Click to remove highlight
function addRemoveHandler(span) {
  span.addEventListener("click", function () {
    const id = span.dataset.id;

    // Remove from DOM
    span.outerHTML = span.innerText;

    // Remove from storage
    let annotations = JSON.parse(localStorage.getItem("annotations")) || [];
    annotations = annotations.filter(a => a.id != id);

    localStorage.setItem("annotations", JSON.stringify(annotations));
  });
}

const box = document.getElementById("box");

let isDragging = false;
let offsetX, offsetY;

box.addEventListener("mousedown", (e) => {
  isDragging = true;

  // Calculate where inside the box you clicked
  offsetX = e.clientX - box.offsetLeft;
  offsetY = e.clientY - box.offsetTop;

  box.style.cursor = "grabbing";
});

document.addEventListener("mousemove", (e) => {
  if (!isDragging) return;

  box.style.left = (e.clientX - offsetX) + "px";
  box.style.top = (e.clientY - offsetY) + "px";
});

document.addEventListener("mouseup", () => {
  isDragging = false;
  box.style.cursor = "grab";
});