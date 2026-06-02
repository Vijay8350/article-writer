import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles, Dna, Search, Image as ImageIcon, Send, CalendarClock, Cpu, Users, Library,
  ShoppingBag, ChevronDown, Check, Menu, X, Zap, Star, ArrowRight,
} from 'lucide-react';
import Seo, { APP_URL } from '../components/Seo';

// ─── Plans data (edit pricing here) ───────────────────────────
const PLANS = [
  {
    id: 'free',
    name: 'Free trial',
    priceMonthly: 0,
    priceAnnual: 0,
    period: '7 days',
    tagline: 'Try it on a real article',
    cta: 'Start free',
    features: [
      '5 articles total',
      '1 connected store',
      '1 seat',
      'No scheduling',
      'DeepSeek AI',
      'Email support',
    ],
  },
  {
    id: 'starter',
    name: 'Starter',
    priceMonthly: 799,
    priceAnnual: 7990, // 2 months free
    tagline: 'For a single Shopify store',
    cta: 'Get Starter',
    features: [
      '30 articles / month',
      '1 connected store',
      '1 seat',
      'Scheduled auto-publish',
      'DeepSeek + Gemini',
      'Email support',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    priceMonthly: 1999,
    priceAnnual: 19990,
    tagline: 'For growing merchants',
    cta: 'Get Growth',
    popular: true,
    features: [
      '100 articles / month',
      '3 connected stores',
      '3 team seats',
      'Scheduled auto-publish',
      'All AI models + premium',
      'Priority support',
    ],
  },
  {
    id: 'agency',
    name: 'Agency',
    priceMonthly: 4999,
    priceAnnual: 49990,
    tagline: 'For multi-store ops',
    cta: 'Get Agency',
    features: [
      '400 articles / month',
      '10 connected stores',
      '10 team seats',
      'Scheduled auto-publish',
      'All AI models + premium',
      'Priority + onboarding',
    ],
  },
];

const FEATURES = [
  { icon: Dna, title: 'Business DNA', body: 'Auto-analyzes your products, collections, tags, and niche so every article is on-brand.' },
  { icon: Search, title: 'SEO-optimized writing', body: 'Titles, meta, headings, and natural internal links — with a built-in SEO score on every article.' },
  { icon: ImageIcon, title: 'Auto product images', body: 'Embeds your real Shopify product photos at the most relevant points in the article body.' },
  { icon: Send, title: 'Instant publish', body: 'Generate and push live to your Shopify blog in one click. Or save as a draft to review first.' },
  { icon: CalendarClock, title: 'Scheduled auto-publish', body: 'Queue topics with dates or set up recurring category campaigns — articles ship on autopilot.' },
  { icon: Cpu, title: 'Multiple AI models', body: 'Pick between fast (Gemini) and premium engines per article or per campaign.' },
  { icon: Users, title: 'Multi-store & team', body: 'Connect multiple Shopify stores under one account and invite teammates with role-based access.' },
  { icon: Library, title: 'Article library', body: 'Every draft and published article in one place — edit, re-publish, and track SEO trends.' },
];

const STEPS = [
  { title: 'Connect your Shopify store', body: 'Paste your Admin API token. We never store it in plain text.' },
  { title: 'Fetch your Business DNA', body: 'We scan your products, collections, and existing articles to learn your store.' },
  { title: 'Enter a topic — or schedule a queue', body: 'Write one topic or pick a category and let it run daily/monthly on autopilot.' },
  { title: 'Generate & publish', body: 'SEO-ready articles with your real product images go live on your Shopify blog.' },
];

const FAQS = [
  { q: 'Do I need to know any code?', a: 'No. You paste a Shopify Admin API token (we walk you through getting one), connect your store, and that\'s it.' },
  { q: 'Does it really post to my Shopify blog?', a: 'Yes — articles go directly to the blog you choose on your store, with their featured image, tags, summary, and SEO meta in place.' },
  { q: 'Are the product images mine?', a: 'Yes. We embed YOUR existing Shopify product images. Nothing is generated from external sources, and nothing leaves Shopify\'s CDN.' },
  { q: 'Can I cancel anytime?', a: 'Yes. You can cancel at the end of any billing period. No contracts, and your data is yours to export at any time.' },
  { q: 'Which AI models do you use?', a: 'Google Gemini for speed, and DeepSeek (with premium engines on higher plans) for depth. You can pick per article or per campaign.' },
];

// ─── Components ──────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <nav className={`lp-nav ${scrolled ? 'lp-nav--scrolled' : ''}`}>
      <div className="lp-container lp-nav__inner">
        <Link to="/" className="lp-logo">
          <img src="/favicon.svg" alt="" className="lp-logo__icon" width="24" height="24" />
          <span>Article Writer</span>
        </Link>
        <div className="lp-nav__links lp-nav__links--desktop">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="lp-nav__cta lp-nav__cta--desktop">
          <Link to="/login" className="btn btn-ghost btn-sm">Log in</Link>
          <Link to="/signup" className="btn btn-primary btn-sm">Sign up free</Link>
        </div>
        <button className="lp-menu-toggle" aria-label="Toggle menu" onClick={() => setMenuOpen(v => !v)}>
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {menuOpen && (
        <div className="lp-nav__mobile">
          <a href="#features" onClick={() => setMenuOpen(false)}>Features</a>
          <a href="#how" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
          <a href="#faq" onClick={() => setMenuOpen(false)}>FAQ</a>
          <Link to="/login" className="btn btn-ghost" onClick={() => setMenuOpen(false)}>Log in</Link>
          <Link to="/signup" className="btn btn-primary" onClick={() => setMenuOpen(false)}>Sign up free</Link>
        </div>
      )}
    </nav>
  );
}

function Hero() {
  return (
    <section className="lp-hero">
      <div className="lp-container lp-hero__grid">
        <div className="lp-hero__copy">
          <span className="lp-badge"><Sparkles size={12} /> Built for Shopify merchants</span>
          <h1>
            AI blog articles for your Shopify store —{' '}
            <span className="lp-gradient-text">written, illustrated, and published on autopilot.</span>
          </h1>
          <p className="lp-lead">
            Connect your store, get a "Business DNA" of your catalog, and generate SEO-optimized blog
            posts with your real product images. Publish instantly or on a schedule.
          </p>
          <div className="lp-cta-row">
            <Link to="/signup" className="btn btn-primary btn-lg">
              Start free — 5 articles <ArrowRight size={18} />
            </Link>
            <a href="#how" className="btn btn-secondary btn-lg">See how it works</a>
          </div>
          <p className="lp-trust">
            <ShoppingBag size={14} /> Connects directly to your Shopify store. No credit card to start.
          </p>
        </div>
        <div className="lp-hero__visual" aria-hidden="true">
          <div className="lp-card-frame">
            <div className="lp-card-frame__bar">
              <span /><span /><span />
            </div>
            <div className="lp-card-frame__body">
              <div className="lp-mock-title">10 Best Ways to Style Our Winter Collection</div>
              <div className="lp-mock-meta">
                <span className="badge badge-success">SEO 92</span>
                <span className="badge badge-purple">1,547 words</span>
                <span className="badge badge-purple">Gemini</span>
              </div>
              <div className="lp-mock-line lp-mock-line--w90" />
              <div className="lp-mock-line lp-mock-line--w80" />
              <div className="lp-mock-imgs">
                <div className="lp-mock-img" /><div className="lp-mock-img" /><div className="lp-mock-img" />
              </div>
              <div className="lp-mock-line lp-mock-line--w85" />
              <div className="lp-mock-line lp-mock-line--w70" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="lp-section">
      <div className="lp-container">
        <div className="lp-section__head">
          <span className="lp-badge"><Zap size={12} /> Features</span>
          <h2>Everything you need to publish SEO content from Shopify</h2>
          <p className="lp-lead">No tabs to juggle. No copy-paste. Just topic in, article live on your blog.</p>
        </div>
        <div className="lp-feature-grid">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="lp-feature">
              <div className="lp-feature__icon"><Icon size={22} /></div>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="lp-section lp-section--alt">
      <div className="lp-container">
        <div className="lp-section__head">
          <span className="lp-badge">How it works</span>
          <h2>From "I should blog" to "It's already published"</h2>
        </div>
        <div className="lp-steps">
          {STEPS.map((s, i) => (
            <div key={s.title} className="lp-step">
              <div className="lp-step__num">{i + 1}</div>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const [annual, setAnnual] = useState(false);
  return (
    <section id="pricing" className="lp-section">
      <div className="lp-container">
        <div className="lp-section__head">
          <span className="lp-badge">Pricing</span>
          <h2>Simple plans that scale with your blog</h2>
          <p className="lp-lead">All plans include the full feature set. You pick how many articles per month.</p>
          <div className="lp-toggle" role="tablist" aria-label="Billing period">
            <button role="tab" aria-selected={!annual} className={!annual ? 'is-active' : ''} onClick={() => setAnnual(false)}>Monthly</button>
            <button role="tab" aria-selected={annual} className={annual ? 'is-active' : ''} onClick={() => setAnnual(true)}>
              Annual <span className="lp-toggle__hint">2 months free</span>
            </button>
          </div>
        </div>
        <div className="lp-plans">
          {PLANS.map(plan => {
            const price = annual ? plan.priceAnnual : plan.priceMonthly;
            const period = plan.id === 'free' ? plan.period : (annual ? '/year' : '/month');
            return (
              <div key={plan.id} className={`lp-plan ${plan.popular ? 'lp-plan--popular' : ''}`}>
                {plan.popular && <div className="lp-plan__ribbon"><Star size={12} /> Most Popular</div>}
                <h3>{plan.name}</h3>
                <p className="lp-plan__tagline">{plan.tagline}</p>
                <div className="lp-plan__price">
                  {price === 0 ? '₹0' : `₹${price.toLocaleString('en-IN')}`}
                  <span className="lp-plan__period">{period}</span>
                </div>
                <ul className="lp-plan__features">
                  {plan.features.map(f => (
                    <li key={f}><Check size={14} /> {f}</li>
                  ))}
                </ul>
                <Link to={`/signup?plan=${plan.id}`} className={`btn ${plan.popular ? 'btn-primary' : 'btn-secondary'} w-full`}>
                  {plan.cta}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="lp-section lp-section--alt">
      <div className="lp-container lp-faq">
        <div className="lp-section__head">
          <span className="lp-badge">FAQ</span>
          <h2>Questions, answered</h2>
        </div>
        <div className="lp-faq__list">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className={`lp-faq__item ${isOpen ? 'is-open' : ''}`}>
                <button
                  className="lp-faq__q"
                  aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? -1 : i)}
                >
                  <span>{item.q}</span>
                  <ChevronDown size={18} />
                </button>
                {isOpen && <div className="lp-faq__a">{item.a}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="lp-section lp-final">
      <div className="lp-container lp-final__inner">
        <h2>Start publishing SEO content this week</h2>
        <p className="lp-lead">5 free articles. No card. Connect your Shopify store and write the first post in under 5 minutes.</p>
        <Link to="/signup" className="btn btn-primary btn-lg">Get started — it's free <ArrowRight size={18} /></Link>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-container lp-footer__inner">
        <div className="lp-footer__brand">
          <div className="lp-logo">
            <img src="/favicon.svg" alt="" className="lp-logo__icon" width="24" height="24" /><span>Article Writer</span>
          </div>
          <p>AI blog writer for Shopify stores.</p>
        </div>
        <div className="lp-footer__links">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
        </div>
        <div className="lp-footer__copy">© {new Date().getFullYear()} Article Writer. All rights reserved.</div>
      </div>
    </footer>
  );
}

// Structured data that mirrors the visible page (no schema drift).
const landingJsonLd = [
  {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Article Writer',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: 'AI blog writer for Shopify stores. Generates SEO-optimized articles with your real product images and publishes them to your Shopify blog instantly or on a schedule.',
    url: `${APP_URL}/`,
    publisher: { '@id': `${APP_URL}/#org` },
    offers: PLANS.map((p) => ({
      '@type': 'Offer',
      name: p.name,
      price: String(p.priceMonthly),
      priceCurrency: 'INR',
      url: `${APP_URL}/signup?plan=${p.id}`,
    })),
  },
  {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  },
];

export default function Landing() {
  return (
    <div className="lp">
      <Seo
        title="AI Blog Writer for Shopify"
        description="AI blog writer for Shopify stores. Generates SEO articles with your real product images and auto-publishes to your blog. Start free — 5 articles."
        path="/"
        jsonLd={landingJsonLd}
      />
      <Nav />
      <Hero />
      <Features />
      <HowItWorks />
      <Pricing />
      <FAQ />
      <FinalCTA />
      <Footer />
      <style>{LANDING_CSS}</style>
    </div>
  );
}

// ─── Page-scoped CSS ─────────────────────────────────────────
const LANDING_CSS = `
  .lp { color: var(--text-primary); }
  .lp-container { max-width: 1180px; margin: 0 auto; padding: 0 24px; }
  .lp-gradient-text { background: var(--accent-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .lp-lead { color: var(--text-secondary); font-size: 16px; line-height: 1.6; }
  .lp-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; background: rgba(139,92,246,0.10); border: 1px solid rgba(139,92,246,0.25); color: var(--text-accent); font-size: 12px; font-weight: 600; letter-spacing: 0.3px; text-transform: uppercase; }

  /* NAV */
  .lp-nav { position: sticky; top: 0; z-index: 30; background: rgba(10,10,20,0.0); transition: background .25s, border-bottom-color .25s, backdrop-filter .25s; border-bottom: 1px solid transparent; }
  .lp-nav--scrolled { background: rgba(10,10,20,0.85); backdrop-filter: blur(12px); border-bottom-color: rgba(255,255,255,0.06); }
  .lp-nav__inner { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; gap: 24px; }
  .lp-logo { display: inline-flex; align-items: center; gap: 8px; font-weight: 700; color: var(--text-primary); font-size: 17px; }
  .lp-logo__icon { width: 24px; height: 24px; display: block; }
  .lp-nav__links--desktop { display: flex; gap: 22px; }
  .lp-nav__links--desktop a { color: var(--text-secondary); font-size: 14px; font-weight: 500; }
  .lp-nav__links--desktop a:hover { color: var(--text-primary); }
  .lp-nav__cta--desktop { display: flex; gap: 10px; }
  .lp-menu-toggle { display: none; background: transparent; border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: var(--text-primary); padding: 6px; cursor: pointer; }
  .lp-nav__mobile { display: none; padding: 12px 24px 16px; gap: 10px; flex-direction: column; border-top: 1px solid rgba(255,255,255,0.06); background: rgba(10,10,20,0.95); backdrop-filter: blur(12px); }
  .lp-nav__mobile a { color: var(--text-secondary); padding: 8px 0; }
  @media (max-width: 880px) {
    .lp-nav__links--desktop, .lp-nav__cta--desktop { display: none; }
    .lp-menu-toggle { display: inline-flex; }
    .lp-nav__mobile { display: flex; }
  }

  /* HERO */
  .lp-hero { padding: 80px 0 56px; position: relative; overflow: hidden; }
  .lp-hero::before { content: ''; position: absolute; inset: -200px 30% -100px 30%; background: radial-gradient(closest-side, rgba(139,92,246,0.18), transparent 70%); pointer-events: none; }
  .lp-hero__grid { display: grid; grid-template-columns: 1.05fr 1fr; gap: 40px; align-items: center; position: relative; }
  .lp-hero__copy h1 { font-size: clamp(32px, 4.4vw, 52px); line-height: 1.1; letter-spacing: -0.02em; margin: 16px 0 18px; }
  .lp-cta-row { display: flex; gap: 12px; margin-top: 26px; flex-wrap: wrap; }
  .lp-trust { display: inline-flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: 13px; margin-top: 18px; }

  /* HERO VISUAL — mocked article card */
  .lp-card-frame { background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-lg), 0 0 60px rgba(139,92,246,0.15); transform: rotate(-1.5deg); }
  .lp-card-frame__bar { display: flex; gap: 6px; padding: 10px 14px; background: rgba(255,255,255,0.03); border-bottom: 1px solid rgba(255,255,255,0.05); }
  .lp-card-frame__bar span { width: 9px; height: 9px; border-radius: 50%; background: rgba(255,255,255,0.18); }
  .lp-card-frame__bar span:first-child { background: #ef4444; }
  .lp-card-frame__bar span:nth-child(2) { background: #f59e0b; }
  .lp-card-frame__bar span:nth-child(3) { background: #10b981; }
  .lp-card-frame__body { padding: 24px; }
  .lp-mock-title { font-size: 20px; font-weight: 700; margin-bottom: 12px; background: var(--accent-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
  .lp-mock-meta { display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
  .lp-mock-line { height: 8px; border-radius: 4px; background: rgba(255,255,255,0.06); margin-bottom: 10px; }
  .lp-mock-line--w90 { width: 90%; } .lp-mock-line--w80 { width: 80%; } .lp-mock-line--w85 { width: 85%; } .lp-mock-line--w70 { width: 70%; }
  .lp-mock-imgs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 14px 0; }
  .lp-mock-img { aspect-ratio: 1; border-radius: 8px; background: linear-gradient(135deg, rgba(139,92,246,0.25), rgba(6,182,212,0.25)); border: 1px solid rgba(139,92,246,0.2); }

  @media (max-width: 880px) {
    .lp-hero__grid { grid-template-columns: 1fr; gap: 24px; }
    .lp-hero { padding: 56px 0 40px; }
  }

  /* SECTIONS */
  .lp-section { padding: 80px 0; }
  .lp-section--alt { background: var(--bg-secondary); }
  .lp-section__head { text-align: center; max-width: 720px; margin: 0 auto 48px; }
  .lp-section__head h2 { font-size: clamp(26px, 3.4vw, 38px); margin: 12px 0; letter-spacing: -0.02em; }

  /* FEATURES */
  .lp-feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 18px; }
  .lp-feature { background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: var(--radius-lg); padding: 22px; transition: transform .25s, border-color .25s, box-shadow .25s; }
  .lp-feature:hover { transform: translateY(-3px); border-color: rgba(139,92,246,0.35); box-shadow: var(--shadow-glow); }
  .lp-feature__icon { width: 40px; height: 40px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; background: rgba(139,92,246,0.15); color: var(--accent-primary); margin-bottom: 14px; }
  .lp-feature h3 { font-size: 16px; margin-bottom: 6px; }
  .lp-feature p { color: var(--text-secondary); font-size: 14px; line-height: 1.55; }

  /* STEPS */
  .lp-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; }
  .lp-step { display: flex; gap: 14px; padding: 20px; background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: var(--radius-lg); }
  .lp-step__num { flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%; background: var(--accent-gradient); color: white; font-weight: 700; display: flex; align-items: center; justify-content: center; }
  .lp-step h3 { font-size: 15px; margin-bottom: 4px; }
  .lp-step p { color: var(--text-secondary); font-size: 13.5px; }

  /* PRICING */
  .lp-toggle { display: inline-flex; padding: 4px; background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: 999px; margin-top: 18px; }
  .lp-toggle button { background: transparent; border: 0; color: var(--text-secondary); padding: 8px 18px; border-radius: 999px; cursor: pointer; font-weight: 600; font-size: 13px; transition: background .2s, color .2s; }
  .lp-toggle button.is-active { background: var(--accent-gradient); color: white; }
  .lp-toggle__hint { font-size: 11px; opacity: 0.85; margin-left: 6px; }
  .lp-plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; align-items: stretch; }
  .lp-plan { position: relative; background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: var(--radius-lg); padding: 24px; display: flex; flex-direction: column; transition: transform .25s, border-color .25s; }
  .lp-plan:hover { transform: translateY(-3px); }
  .lp-plan--popular { border-color: rgba(139,92,246,0.6); box-shadow: 0 0 40px rgba(139,92,246,0.18); }
  .lp-plan__ribbon { position: absolute; top: -12px; left: 50%; transform: translateX(-50%); display: inline-flex; align-items: center; gap: 4px; padding: 4px 12px; border-radius: 999px; background: var(--accent-gradient); color: white; font-size: 11px; font-weight: 700; letter-spacing: 0.4px; }
  .lp-plan h3 { font-size: 18px; }
  .lp-plan__tagline { color: var(--text-muted); font-size: 13px; margin: 4px 0 14px; }
  .lp-plan__price { font-size: 32px; font-weight: 700; letter-spacing: -0.02em; }
  .lp-plan__period { font-size: 13px; color: var(--text-muted); margin-left: 6px; font-weight: 400; }
  .lp-plan__features { list-style: none; padding: 0; margin: 18px 0 22px; display: flex; flex-direction: column; gap: 8px; }
  .lp-plan__features li { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--text-secondary); }
  .lp-plan__features svg { color: var(--accent-success); flex-shrink: 0; }

  /* FAQ */
  .lp-faq { max-width: 760px; }
  .lp-faq__list { display: flex; flex-direction: column; gap: 10px; }
  .lp-faq__item { background: var(--bg-card); border: 1px solid var(--border-primary); border-radius: var(--radius-md); overflow: hidden; }
  .lp-faq__q { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px; background: transparent; border: 0; color: var(--text-primary); font-size: 15px; font-weight: 600; text-align: left; cursor: pointer; }
  .lp-faq__q svg { transition: transform .2s; flex-shrink: 0; }
  .lp-faq__item.is-open .lp-faq__q svg { transform: rotate(180deg); }
  .lp-faq__a { padding: 0 18px 18px; color: var(--text-secondary); font-size: 14px; line-height: 1.6; }

  /* FINAL CTA */
  .lp-final { background: linear-gradient(135deg, rgba(139,92,246,0.10), rgba(6,182,212,0.08)); border-top: 1px solid rgba(139,92,246,0.18); border-bottom: 1px solid rgba(139,92,246,0.18); }
  .lp-final__inner { text-align: center; max-width: 640px; margin: 0 auto; }
  .lp-final h2 { font-size: clamp(26px, 3.4vw, 38px); margin-bottom: 12px; }
  .lp-final .btn { margin-top: 18px; }

  /* FOOTER */
  .lp-footer { padding: 40px 0 32px; border-top: 1px solid rgba(255,255,255,0.05); background: var(--bg-secondary); }
  .lp-footer__inner { display: grid; grid-template-columns: 1.2fr 1fr; gap: 24px; align-items: start; }
  .lp-footer__brand p { color: var(--text-muted); font-size: 13px; margin-top: 8px; }
  .lp-footer__links { display: flex; gap: 18px; justify-content: flex-end; flex-wrap: wrap; }
  .lp-footer__links a { color: var(--text-secondary); font-size: 14px; }
  .lp-footer__copy { grid-column: 1 / -1; color: var(--text-muted); font-size: 12px; padding-top: 18px; border-top: 1px solid rgba(255,255,255,0.05); }
  @media (max-width: 720px) {
    .lp-footer__inner { grid-template-columns: 1fr; }
    .lp-footer__links { justify-content: flex-start; }
  }

  /* Buttons (lg variant for the landing hero) */
  .btn-lg { padding: 12px 22px; font-size: 15px; border-radius: var(--radius-md); }

  html { scroll-behavior: smooth; }
`;
