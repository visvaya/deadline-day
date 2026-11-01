import { useEffect } from "react";

/**
 * Holds the page still while an overlay is open, and puts it back exactly
 * where it was on close.
 *
 * Both elements, and the scroll position pinned with them. Setting overflow
 * on body alone leaves the document still scrolling behind the overlay - the
 * scrolling element is documentElement - and on iOS even that is not enough,
 * so the body is taken out of flow at its current offset and restored on
 * cleanup.
 *
 * Shared by the squad drawer and the squad-depth confirmation. It lives here
 * rather than in either of them because `pnpm quality:duplicates` runs jscpd
 * at threshold 0: a second copy of this sequence fails the full gate, and two
 * copies would drift the first time one of them learned something new about
 * mobile browsers.
 */
export const useScrollLock = (): void => {
  useEffect(() => {
    const scroller = document.documentElement;
    const previousOverflow = document.body.style.overflow;
    const previousRootOverflow = scroller.style.overflow;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;
    const scrollY = window.scrollY;

    scroller.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      scroller.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousOverflow;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      window.scrollTo(0, scrollY);
    };
  }, []);
};
