/**
 * The swipe preview is a decorative, inert glimpse of authenticated HTML.
 * Never inject the raw server response into the live DOM: text originating
 * from student/instructor records must not become executable markup.
 */
const DROP_ELEMENTS = [
  'script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'template',
  'form', 'input', 'textarea', 'select', 'button', 'noscript',
  'svg', 'math', 'video', 'audio', 'source', 'track', 'canvas',
].join(',');

const SAFE_ATTRS = new Set(['class', 'alt', 'aria-hidden', 'dir', 'lang']);

export function safeSwipePreviewImageUrl(source: string, appOrigin: string): string | null {
  try {
    const image = new URL(source, appOrigin);
    if (!['https:', 'http:'].includes(image.protocol) || image.origin !== appOrigin) return null;
    // Only the app's static imagery and Next's optimized image endpoint.
    // Private Storage signed URLs and third-party locations are never copied.
    if (!image.pathname.startsWith('/images/') &&
        image.pathname !== '/icon.svg' &&
        image.pathname !== '/_next/image') return null;
    return image.pathname + image.search;
  } catch {
    return null;
  }
}

export function sanitizeStudentSwipePreview(main: Element, origin: string): string {
  main.querySelectorAll(DROP_ELEMENTS).forEach(node => node.remove());
  main.querySelectorAll('*').forEach(element => {
    // Custom elements may run connectedCallback as soon as inserted.
    if (element.localName.includes('-') || element.namespaceURI !== 'http://www.w3.org/1999/xhtml') {
      element.remove();
      return;
    }
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      if (SAFE_ATTRS.has(name)) continue;
      if (name === 'src' && element.localName === 'img') {
        const src = safeSwipePreviewImageUrl(attr.value, origin);
        if (src) {
          element.setAttribute('src', src);
          continue;
        }
      }
      element.removeAttribute(attr.name);
    }
  });
  return main.innerHTML;
}
