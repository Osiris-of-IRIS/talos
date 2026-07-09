/**
 * Fail-fast boot error screen (T-025, ADR-0002): shown instead of mounting React when runtime
 * config validation fails. Built with plain DOM + `textContent` (never `innerHTML`) so an error
 * message can never be interpreted as markup, consistent with the app's no-raw-HTML stance
 * (ADR-0009) even though these messages are developer-authored, not user input.
 */
export function renderBootError(root: HTMLElement, errors: string[]): void {
  root.textContent = '';

  const container = document.createElement('div');
  container.setAttribute('role', 'alert');
  container.style.cssText =
    'margin:2rem auto;max-width:40rem;padding:1.5rem;border:2px solid #dc2626;' +
    'border-radius:0.5rem;color:#dc2626;font-family:system-ui,sans-serif;';

  const heading = document.createElement('h1');
  heading.style.cssText = 'margin:0 0 0.75rem;font-size:1.25rem;';
  heading.textContent = 'TALOS failed to start: invalid configuration';
  container.appendChild(heading);

  const list = document.createElement('ul');
  list.style.cssText = 'margin:0;padding-left:1.25rem;';
  for (const error of errors) {
    const item = document.createElement('li');
    item.textContent = error;
    list.appendChild(item);
  }
  container.appendChild(list);

  root.appendChild(container);
}
