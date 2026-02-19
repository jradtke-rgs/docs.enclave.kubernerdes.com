// @ts-check

/** @type {import('@docusaurus/plugin-content-docs').SidebarsConfig} */
const sidebars = {
  enclaveSidebar: [
    {
      type: 'doc',
      id: 'getting-started',
      label: 'Getting Started',
    },
    {
      type: 'category',
      label: 'Day 0 — Design',
      link: {type: 'doc', id: 'day-0/day-0'},
      items: [
        'day-0/hardware',
        'day-0/network-planning',
        'day-0/software-prerequisites',
      ],
    },
    {
      type: 'category',
      label: 'Day 1 — Build',
      link: {type: 'doc', id: 'day-1/day-1'},
      items: [
        'day-1/admin-host',
        'day-1/infrastructure-vms',
        'day-1/harvester-cluster',
        'day-1/rancher-manager',
      ],
    },
    {
      type: 'category',
      label: 'Day 2 — Operate',
      link: {type: 'doc', id: 'day-2/day-2'},
      items: [
        'day-2/monitoring',
        'day-2/backup-maintenance',
        'day-2/troubleshooting',
      ],
    },
  ],
};

export default sidebars;
