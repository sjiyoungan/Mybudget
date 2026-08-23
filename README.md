# Mybudget

A personal budget starter built with React, Vite, Tailwind CSS, and shadcn/ui.

## Scripts

```bash
npm install
npm run dev      # local development
npm run build    # production build
npm run preview  # preview the production build
```

## Stack

- React 19 + TypeScript
- Vite
- Tailwind CSS v4
- [shadcn/ui](https://ui.shadcn.com)

## Income

Open the Income card to upload an ADP earnings statement PDF. The app reads pay date, regular pay, Pick Your Perk, gross pay, this-period deductions, and net pay. Year-to-date totals and employer-paid “other benefits” are omitted.

Paystubs are stored in the browser (localStorage), not on a server.

## Project layout

- `src/pages/dashboard-page.tsx` — home dashboard
- `src/pages/income-page.tsx` — ADP paystub upload and breakdown
- `src/lib/paystub.ts` — paystub parser and local storage
- `src/components/ui` — shadcn components
