import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import styles from './index.module.css';

function HomepageHeader() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <header className={clsx('hero hero--primary', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link
            className="button button--secondary button--lg"
            to="/docs/getting-started">
            Get Started →
          </Link>
        </div>
      </div>
    </header>
  );
}

function FeatureCard({title, description, to}) {
  return (
    <div className={clsx('col col--3')}>
      <div className="text--center padding-horiz--md padding-vert--lg">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
        <Link className="button button--outline button--primary" to={to}>
          View Docs →
        </Link>
      </div>
    </div>
  );
}

export default function Home() {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout
      title={siteConfig.title}
      description="Documentation for the Kubernerdes self-hosted Kubernetes enclave running RGS Carbide on Intel NUCs">
      <HomepageHeader />
      <main>
        <section className="container margin-vert--xl">
          <div className="row">
            <FeatureCard
              title="Day 0 — Design"
              description="Hardware BOM, network planning, IP addressing, DNS/DHCP design, and software prerequisites."
              to="/docs/day-0"
            />
            <FeatureCard
              title="Day 1 — Build"
              description="Admin host setup, infrastructure VMs, Harvester cluster PXE boot, and Rancher Manager deployment."
              to="/docs/day-1"
            />
            <FeatureCard
              title="Day 2 — Operate"
              description="Monitoring dashboards, backup procedures, config management, and troubleshooting guides."
              to="/docs/day-2"
            />
          </div>
        </section>
      </main>
    </Layout>
  );
}
