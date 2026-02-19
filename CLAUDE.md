# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Repository

A Docusaurus v3 documentation site for the Kubernerdes self-hosted Kubernetes enclave (`enclave.kubernerdes.com`). Organized around the Day 0/1/2 operational framework.

## Commands

```bash
npm run start    # Dev server at localhost:3000
npm run build    # Production build into ./build/
npm run serve    # Serve the ./build/ output locally
npm run clear    # Clear Docusaurus cache
```

## Architecture

- **Framework:** Docusaurus 3.x, classic preset, JavaScript (not TypeScript)
- **Config:** `docusaurus.config.js` — site metadata, navbar, footer, blog disabled
- **Sidebar:** `sidebars.js` — explicit `enclaveSidebar` with Day 0/1/2 categories
- **Docs root:** `docs/` — all content lives here
- **Homepage:** `src/pages/index.js` — custom landing page (no HomepageFeatures component)

## Doc Structure

```
docs/
├── getting-started.md
├── day-0/
│   ├── index.md               (id: day-0)
│   ├── hardware.md
│   ├── network-planning.md
│   └── software-prerequisites.md
├── day-1/
│   ├── index.md               (id: day-1)
│   ├── admin-host.md
│   ├── infrastructure-vms.md
│   ├── harvester-cluster.md
│   └── rancher-manager.md
└── day-2/
    ├── index.md               (id: day-2)
    ├── monitoring.md
    ├── backup-maintenance.md
    └── troubleshooting.md
```

## Key Conventions

- Front matter `id:` field drives sidebar document IDs — must match `sidebars.js` references
- The `index.md` files in each day directory use the day name as their `id` (e.g., `id: day-0`), not `id: index`
- Blog is disabled (`blog: false` in config)
- `onBrokenMarkdownLinks` is set via `markdown.hooks` (not the deprecated top-level option)
