export function setupDropZone(onFilesDropped) {
  const overlay = document.getElementById("drop-overlay");
  if (!overlay) {
    console.warn("[dropZone] #drop-overlay element missing");
    return;
  }

  let counter = 0;

  function activate() { overlay.classList.add("is-active"); }
  function deactivate() { overlay.classList.remove("is-active"); counter = 0; }

  window.addEventListener("dragenter", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    counter++;
    activate();
  });

  // dragover must preventDefault for drop to fire.
  window.addEventListener("dragover", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
  });

  window.addEventListener("dragleave", (e) => {
    if (!hasFiles(e)) return;
    counter--;
    if (counter <= 0) deactivate();
  });

  window.addEventListener("drop", (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    deactivate();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) onFilesDropped(files);
  });
}

function hasFiles(e) {
  if (!e.dataTransfer || !e.dataTransfer.types) return false;
  // types is a DOMStringList in some browsers; iterate via Array.from.
  return Array.from(e.dataTransfer.types).includes("Files");
}
