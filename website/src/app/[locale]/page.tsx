import { getDictionary } from '../../i18n/dictionaries';
import { locales, defaultLocale, type Locale } from '../../i18n/config';

function isValidLocale(locale: string): locale is Locale {
  return (locales as readonly string[]).includes(locale);
}

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isValidLocale(rawLocale) ? rawLocale : defaultLocale;
  const dict = await getDictionary(locale);

  return (
    <main className="main">
      <section className="hero">
        <div className="container">
          <h1 className="hero-title">{dict.hero.title}</h1>
          <p className="hero-subtitle">{dict.hero.subtitle}</p>
          <div className="hero-actions">
            <a href="#features" className="btn btn-primary">
              {dict.hero.cta}
            </a>
            <a href="#features" className="btn btn-secondary">
              {dict.hero.secondary_cta}
            </a>
          </div>
        </div>
      </section>

      <section id="features" className="features">
        <div className="container">
          <h2 className="section-title">{dict.features.title}</h2>
          <div className="features-grid">
            <div className="feature-card">
              <h3>{dict.features.ai_chat.title}</h3>
              <p>{dict.features.ai_chat.description}</p>
            </div>
            <div className="feature-card">
              <h3>{dict.features.memory.title}</h3>
              <p>{dict.features.memory.description}</p>
            </div>
            <div className="feature-card">
              <h3>{dict.features.rag.title}</h3>
              <p>{dict.features.rag.description}</p>
            </div>
            <div className="feature-card">
              <h3>{dict.features.vision.title}</h3>
              <p>{dict.features.vision.description}</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <p>&copy; 2026 {dict.footer.copyright}</p>
          <nav className="footer-nav">
            <a href={`/${locale}`}>{dict.nav.home}</a>
            <a href="#">{dict.footer.privacy}</a>
            <a href="#">{dict.footer.imprint}</a>
          </nav>
        </div>
      </footer>
    </main>
  );
}
