/** Browser full screen for the whole editor (top-bar button, `Shift F`). */
export function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}
