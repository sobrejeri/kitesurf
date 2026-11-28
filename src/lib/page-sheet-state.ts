export type PageSheetState = { pathname: string; open: boolean };

/** A sheet never survives a navigation away from the page that opened it. */
export function sheetForPage(state: PageSheetState, pathname: string): PageSheetState {
  return state.pathname === pathname ? state : { pathname, open: false };
}
