/**
 * Selects a focused input's whole value, so typing replaces it. iOS Safari puts the caret where
 * the tap landed after the focus and click handlers have run, and ignores a selection made in
 * them, so the value is selected again once the browser has placed the caret. A part of the value
 * the user selected themselves is left alone.
 */
export function selectInputValue(input: HTMLInputElement): void {
  input.select();
  const selectAfterCaret = () => {
    if (document.activeElement !== input || !input.value) return;
    // Only a bare caret is replaced: a range is either this selection or the user's own.
    if (input.selectionStart !== input.selectionEnd) return;
    input.setSelectionRange(0, input.value.length);
  };
  window.requestAnimationFrame(selectAfterCaret);
  window.setTimeout(selectAfterCaret, 0);
}
