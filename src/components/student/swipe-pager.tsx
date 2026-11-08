'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/** Keep this order synchronized with the five items in StudentShell's footer. */
export const STUDENT_SWIPE_ROUTES = [
  '/aluno/inicio',
  '/aluno/aulas',
  '/aluno/reservar',
  '/aluno/evolucao',
  '/aluno/conta',
] as const;

const PAGE_NAMES = ['Explorar', 'Minhas aulas', 'Agendar', 'Evolução', 'Perfil'] as const;
const IGNORE_SWIPE = [
  'input', 'textarea', 'select', '[role="dialog"]', '[role="tablist"]',
  '[role="slider"]', '[contenteditable="true"]', '[data-student-swipe-ignore]',
  '[data-carousel]', '.overflow-x-auto', '.overflow-x-scroll', '.snap-x',
].join(',');

type Gesture = {
  x: number; y: number; at: number; dx: number;
  axis: 'unknown' | 'horizontal' | 'vertical';
  direction: -1 | 1 | 0;
  nextRoute: string | null;
};

type CachedPage = { html: string; fetchedAt: number };
const PREVIEW_CACHE_MS = 45_000;
const EASE = 'cubic-bezier(.22,.75,.18,1)';

/**
 * Swipe between the five primary student pages with a finger-following track.
 *
 * The incoming *visual* page is preloaded from its own authenticated HTML.
 * It is inert: its controls are never clickable and its scripts never run.
 * On release the real Next.js route takes over, preserving server data,
 * authorization, booking forms and chat without creating a second tab bar.
 */
export function StudentSwipePager({
  pathname,
  signedIn,
  children,
}: {
  pathname: string;
  signedIn: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const viewport = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLElement>(null);
  const preview = useRef<HTMLDivElement>(null);
  const previousPath = useRef(pathname);
  const cache = useRef(new Map<string, CachedPage>());
  const inFlight = useRef(new Map<string, Promise<void>>());
  const shownRoute = useRef<string | null>(null);
  const index = (STUDENT_SWIPE_ROUTES as readonly string[]).indexOf(pathname);
  const active = signedIn && index >= 0;

  // The route can finish loading while a preview is still at x=0. Clear the
  // outgoing transform before paint so the real destination is full-width.
  useLayoutEffect(() => {
    if (previousPath.current === pathname) return;
    previousPath.current = pathname;
    const page = current.current;
    const incoming = preview.current;
    if (page) {
      page.style.transition = 'none';
      page.style.transform = '';
    }
    if (incoming) {
      incoming.style.transition = 'none';
      incoming.style.transform = '';
      incoming.style.visibility = 'hidden';
      incoming.replaceChildren();
    }
    shownRoute.current = null;
  }, [pathname]);

  useEffect(() => {
    if (!active) return;
    const frame = viewport.current;
    const page = current.current;
    const incoming = preview.current;
    if (!frame || !page || !incoming) return;
    const controller = new AbortController();
    let gesture: Gesture | null = null;
    let settleTimer: number | null = null;
    let changingRoute = false;

    const reset = () => {
      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = null;
      gesture = null;
      changingRoute = false;
      page.style.transition = 'none';
      page.style.transform = '';
      incoming.style.transition = 'none';
      incoming.style.transform = '';
      incoming.style.visibility = 'hidden';
      incoming.replaceChildren();
      shownRoute.current = null;
      frame.removeAttribute('data-dragging');
    };

    const isMobile = () => window.innerWidth < 768;

    const ignoreTarget = (target: EventTarget | null) => {
      if (!(target instanceof Element) || !page.contains(target) ||
          target.closest(IGNORE_SWIPE)) return true;
      let node: Element | null = target;
      while (node && node !== page) {
        const el = node as HTMLElement;
        if (el.scrollWidth > el.clientWidth + 6) {
          const overflow = window.getComputedStyle(node).overflowX;
          if (overflow === 'scroll' || overflow === 'auto') return true;
        }
        node = node.parentElement;
      }
      return false;
    };

    const renderPreview = (route: string, side: -1 | 1) => {
      if (shownRoute.current !== route) {
        shownRoute.current = route;
        incoming.replaceChildren();
        const saved = cache.current.get(route);
        if (saved) {
          // The fetched HTML originates only from our authenticated origin.
          // Embedded script/style/iframe nodes are stripped before caching.
          incoming.innerHTML = saved.html;
        } else {
          const holder = document.createElement('div');
          holder.className = 'vento-student-swipe-loading';
          const label = document.createElement('strong');
          label.textContent = PAGE_NAMES[STUDENT_SWIPE_ROUTES.indexOf(route as typeof STUDENT_SWIPE_ROUTES[number])] ?? 'Próxima tela';
          const sublabel = document.createElement('span');
          sublabel.textContent = 'Vento Kite · Aulas de Kitesurf';
          holder.append(label, sublabel);
          incoming.append(holder);
        }
      }
      incoming.style.visibility = 'visible';
      incoming.style.transition = 'none';
      incoming.style.transform = `translate3d(${side * frame.clientWidth}px,0,0)`;
    };

    const fetchPreview = (route: string) => {
      const cached = cache.current.get(route);
      if (cached && Date.now() - cached.fetchedAt < PREVIEW_CACHE_MS) return;
      if (inFlight.current.has(route)) return;
      const task = (async () => {
        try {
          const response = await fetch(route, {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Accept: 'text/html' },
            signal: controller.signal,
          });
          if (!response.ok || response.redirected ||
              !response.headers.get('content-type')?.includes('text/html')) return;
          const documentText = await response.text();
          const doc = new DOMParser().parseFromString(documentText, 'text/html');
          const main = doc.querySelector('main.vento-student-main');
          if (!main) return;
          main.querySelectorAll('script,style,iframe,object,embed,link,meta,template').forEach(node => node.remove());
          cache.current.set(route, { html: main.innerHTML, fetchedAt: Date.now() });
          // Replace the loading shell mid-gesture with the real neighbor visual.
          if (shownRoute.current === route && incoming.style.visibility === 'visible') {
            incoming.innerHTML = main.innerHTML;
          }
        } catch {
          // A poor connection simply shows a non-interactive loading preview.
          // The authoritative page is still loaded by Next.js after release.
        } finally {
          inFlight.current.delete(route);
        }
      })();
      inFlight.current.set(route, task);
    };

    // Warm only the immediately adjacent pages, not all five heavy dashboards.
    for (const neighbor of [STUDENT_SWIPE_ROUTES[index - 1], STUDENT_SWIPE_ROUTES[index + 1]]) {
      if (neighbor) fetchPreview(neighbor);
    }

    const onStart = (event: TouchEvent) => {
      gesture = null;
      if (changingRoute || !isMobile() || event.touches.length !== 1 ||
          ignoreTarget(event.target)) return;
      const touch = event.touches.item(0);
      if (!touch) return;
      // Prevent the iPhone's native history preview on true edge-origin swipes.
      if (touch.clientX <= 28 || touch.clientX >= window.innerWidth - 28)
        event.preventDefault();
      gesture = { x: touch.clientX, y: touch.clientY, at: Date.now(),
        dx: 0, axis: 'unknown', direction: 0, nextRoute: null };
    };

    const onMove = (event: TouchEvent) => {
      const g = gesture;
      if (!g || event.touches.length !== 1 || changingRoute) return;
      const touch = event.touches.item(0);
      if (!touch) return;
      const dx = touch.clientX - g.x;
      const dy = touch.clientY - g.y;
      if (g.axis === 'unknown') {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
          g.axis = 'vertical'; return;
        }
        if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
        g.axis = 'horizontal';
      }
      if (g.axis !== 'horizontal') return;
      // Cancel browser sideways pan but never the established vertical scroll.
      if (event.cancelable) event.preventDefault();
      const direction = dx < 0 ? 1 : -1;
      const route = STUDENT_SWIPE_ROUTES[index + direction] ?? null;
      // Hard boundaries: no right-swipe from Explorar or left-swipe from Perfil.
      if (!route) {
        g.dx = 0; g.nextRoute = null;
        page.style.transform = '';
        incoming.style.visibility = 'hidden';
        return;
      }
      if (direction !== g.direction) renderPreview(route, direction);
      g.direction = direction;
      g.nextRoute = route;
      g.dx = Math.max(-frame.clientWidth, Math.min(frame.clientWidth, dx));
      const offset = frame.clientWidth * direction;
      page.style.transition = 'none';
      page.style.transform = `translate3d(${g.dx}px,0,0)`;
      incoming.style.transform = `translate3d(${offset + g.dx}px,0,0)`;
      frame.setAttribute('data-dragging', 'true');
      if (!cache.current.has(route)) fetchPreview(route);
    };

    const onEnd = (event: TouchEvent) => {
      const g = gesture;
      gesture = null;
      if (!g || g.axis !== 'horizontal' || !g.nextRoute || !isMobile()) return;
      if (event.cancelable) event.preventDefault();
      const distance = Math.abs(g.dx);
      const elapsed = Math.max(1, Date.now() - g.at);
      const commit = distance > frame.clientWidth * .25 ||
        (distance > 48 && distance / elapsed > .6);
      const ms = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240;
      page.style.transition = `transform ${ms}ms ${EASE}`;
      incoming.style.transition = `transform ${ms}ms ${EASE}`;
      if (commit) {
        changingRoute = true;
        const destination = g.nextRoute;
        page.style.transform = `translate3d(${-g.direction * frame.clientWidth}px,0,0)`;
        incoming.style.transform = 'translate3d(0,0,0)';
        settleTimer = window.setTimeout(() => {
          // Reuse the same persistent shell and footer. The full Next route
          // renders after the finger-following visual preview has docked.
          router.replace(destination, { scroll: true });
        }, ms);
      } else {
        page.style.transform = 'translate3d(0,0,0)';
        incoming.style.transform = `translate3d(${g.direction * frame.clientWidth}px,0,0)`;
        settleTimer = window.setTimeout(reset, ms + 20);
      }
    };

    // Native (not passive) listeners are needed for WebKit's history gesture.
    page.addEventListener('touchstart', onStart, { passive: false });
    page.addEventListener('touchmove', onMove, { passive: false });
    page.addEventListener('touchend', onEnd, { passive: false });
    page.addEventListener('touchcancel', reset);
    return () => {
      controller.abort();
      reset();
      page.removeEventListener('touchstart', onStart);
      page.removeEventListener('touchmove', onMove);
      page.removeEventListener('touchend', onEnd);
      page.removeEventListener('touchcancel', reset);
    };
  }, [active, index, router]);

  return (
    <div ref={viewport} className="vento-student-swipe-viewport" data-student-swipe={active ? 'true' : undefined}>
      <main
        ref={current}
        className="vento-student-main relative mx-auto max-w-6xl px-4 pb-tabbar md:px-8 md:pb-0 md:pt-6"
      >{children}</main>
      <div ref={preview} inert aria-hidden="true"
        className="vento-student-swipe-preview vento-student-main px-4 pb-tabbar md:hidden"
      />
    </div>
  );
}
