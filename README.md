# SmashMatch

A badminton/pickleball session manager: live court tracking, fair-rotation match
suggestions, rankings, and roster management. Built with React + TypeScript + Vite.

## Getting started

```bash
npm install
npm run dev
```

## Structure

- `src/hooks/useSessionStore.ts` — all app state and business logic (match
  suggestions, fairness scoring, roster/session lifecycle), exposed as a single
  hook that returns typed view models per screen.
- `src/lib/session.ts` — pure helper functions (priority scoring, team
  balancing, suggestion building) used by the hook.
- `src/components/tabs/` — the four main screens (Session, Matches, Rankings, Manage).
- `src/components/modals/` — the scorekeeper sheet, edit-match, confirm,
  new-session wizard, and share-rankings dialogs.
- `src/styles/` — design tokens (`organic.css`) and the app's dark theme
  (`theme.css`), both consumed as CSS custom properties by per-component CSS Modules.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — type-check and build for production
- `npm run lint` — run ESLint
