/**
 * Tab system + checklist persistence helpers.
 * URL hash mirrors the active tab so links are shareable.
 */

/**
 * Wire up tabs. Buttons must have `data-tab="<panel-id>"`; panels must have
 * matching `id` and class `tab-panel`.
 *
 * @param {HTMLElement} container
 */
export function initTabs(container) {
  const buttons = container.querySelectorAll(".tab[data-tab]");
  const panels = container.querySelectorAll(".tab-panel");

  function activate(tab) {
    buttons.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    panels.forEach((p) => p.classList.toggle("active", p.id === `panel-${tab}`));
    if (window.location.hash !== `#${tab}`) {
      history.replaceState(null, "", `#${tab}`);
    }
  }

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => activate(btn.dataset.tab));
  });

  const initial = (window.location.hash || "").replace("#", "");
  const valid = Array.from(buttons).some((b) => b.dataset.tab === initial);
  activate(valid ? initial : buttons[0]?.dataset.tab || "itinerary");
}

/**
 * Persist a checkbox state in localStorage keyed by `<slug>:<itemId>`.
 *
 * @param {HTMLElement} root
 * @param {string} slug
 */
export function bindChecklistPersistence(root, slug) {
  root.querySelectorAll(".checklist-item input[type='checkbox']").forEach((input) => {
    const id = input.dataset.id;
    if (!id) return;
    const key = `x8-travel:${slug}:${id}`;
    const saved = localStorage.getItem(key);
    if (saved === "1") {
      input.checked = true;
      input.closest(".checklist-item")?.classList.add("done");
    }
    input.addEventListener("change", () => {
      localStorage.setItem(key, input.checked ? "1" : "0");
      input.closest(".checklist-item")?.classList.toggle("done", input.checked);
    });
  });
}
