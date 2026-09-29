// Put the box back to its saved text. A changed box can pop a "leave page?" dialog that freezes the tab.
(() => {
  const ta = document.querySelector('textarea[id^=issue-][id$=-body]');
  const imgs = [
    ...ta.value.matchAll(/alt="([^"]+)" src="(https:\/\/github\.com\/user-attachments\/assets\/[^"]+)"/g),
  ].map(m => `${m[1]} ${m[2]}`);
  const uploading = /Uploading/.test(ta.value);
  if (!uploading) {
    ta.value = ta.defaultValue;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  return { imgs, uploading, restored: ta.value === ta.defaultValue };
})();
