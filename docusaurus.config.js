// @ts-check
import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'Kubernerdes Enclave',
  tagline: 'RGS Carbide on NUC — Day 0 through Day 2',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://docs.enclave.kubernerdes.com',
  baseUrl: '/',

  organizationName: 'jradtke-rgs',
  projectName: 'docs.enclave.kubernerdes.com',

  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        docs: {
          sidebarPath: './sidebars.js',
          editUrl: 'https://github.com/jradtke-rgs/docs.enclave.kubernerdes.com/edit/main/',
          routeBasePath: 'docs',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      colorMode: {
        respectPrefersColorScheme: true,
      },
      navbar: {
        title: 'Kubernerdes Enclave',
        logo: {
          alt: 'Kubernerdes Enclave Logo',
          src: 'img/logo.svg',
        },
        items: [
          {
            to: '/docs/getting-started',
            label: 'Getting Started',
            position: 'left',
          },
          {
            to: '/docs/day-0',
            label: 'Day 0',
            position: 'left',
          },
          {
            to: '/docs/day-1',
            label: 'Day 1',
            position: 'left',
          },
          {
            to: '/docs/day-2',
            label: 'Day 2',
            position: 'left',
          },
          {
            href: 'https://github.com/jradtke-rgs/enclave.kubernerdes.com',
            label: 'GitHub',
            position: 'right',
          },
        ],
      },
      footer: {
        style: 'dark',
        links: [
          {
            title: 'Enclave Docs',
            items: [
              {label: 'Getting Started', to: '/docs/getting-started'},
              {label: 'Day 0 — Design', to: '/docs/day-0'},
              {label: 'Day 1 — Build', to: '/docs/day-1'},
              {label: 'Day 2 — Operate', to: '/docs/day-2'},
            ],
          },
          {
            title: 'Source',
            items: [
              {
                label: 'enclave.kubernerdes.com',
                href: 'https://github.com/jradtke-rgs/enclave.kubernerdes.com',
              },
              {
                label: 'docs.enclave.kubernerdes.com',
                href: 'https://github.com/jradtke-rgs/docs.enclave.kubernerdes.com',
              },
            ],
          },
        ],
        copyright: `Copyright © ${new Date().getFullYear()} Kubernerdes Enclave. Built with Docusaurus.`,
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.dracula,
        additionalLanguages: ['bash', 'yaml', 'nginx'],
      },
    }),
};

export default config;
