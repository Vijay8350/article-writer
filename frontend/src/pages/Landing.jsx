import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight, Plus, Menu, X, Check, Minus, Heart, MessageCircle, Send, Bookmark, Store, ScanSearch, Rocket,
} from 'lucide-react';
import Seo, { APP_URL } from '../components/Seo';
import { getPublicPlans } from '../lib/api';
import { ThemeToggle } from '../components/ThemeSwitch';
import { BrandLogo, BrandMark } from '../components/BrandLogo';

// ─── Photography (Unsplash, free licence; served by Unsplash's image CDN) ───
const P = {
  earringsGold: '1617038220319-276d3cfab638',
  earringsLeaf: '1535632066927-ab7c9ab60908',
  braceletRose: '1611591437281-460bfbe1220a',
  braceletDark: '1573408301185-9146fe634ad0',
  ring: '1605100804763-247f67b3557e',
  pearls: '1515562141207-7a88fb7ce338',
  serum: '1608571423902-eed4a5ad8108',
  ceramics: '1610701596007-11502861dcfa',
  bottle: '1602143407151-7111542de6e8',
  merchant: '1556742049-0cfed4f6a45d',
};
const src = (id, w, h) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}${h ? `&h=${h}` : ''}&q=80`;
function Photo({ id, w, h, alt = '', className, eager }) {
  return (
    <img
      src={src(id, w, h)}
      srcSet={`${src(id, w, h)} 1x, ${src(id, w * 2, h ? h * 2 : undefined)} 2x`}
      alt={alt}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      width={w}
      height={h}
    />
  );
}

const FAQS = [
  { q: 'Do I need to know any code?', a: 'No. Connect your Shopify store from Settings (we walk you through it), let Glowquill learn your catalogue, and start writing. Everything else happens in the app.' },
  { q: 'Does it publish straight to my Shopify blog?', a: 'Yes. Articles go to the blog you choose, with the featured image, tags, summary, SEO title and description already in place. You can also save a draft and review it first.' },
  { q: 'Are the product photos really mine?', a: 'Yes. Articles use the photos already in your Shopify store. For Instagram posts the AI only designs the scene around your product — your real product pixels are laid back on top, so its colour, shape and details never change.' },
  { q: 'What does SEO automation change in my store?', a: 'Search titles and descriptions, image alt text and links to pages that no longer exist. Every change is recorded with its old value, so you can undo any of it in one click.' },
  { q: 'How do plans work?', a: 'Everyone starts on the Free plan. When you want more, request a plan from Plan & usage inside the app; once it is approved it applies straight away.' },
  { q: 'Which AI does it use?', a: 'Google Gemini and DeepSeek write the articles and captions; OpenAI and Gemini image models design the Instagram scenes.' },
];

const NAV = [
  { href: '#articles', label: 'Blog articles' },
  { href: '#seo', label: 'SEO' },
  { href: '#instagram', label: 'Instagram' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

// Fade sections in as they scroll into view.
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll('.lp .reveal');
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('is-in')); return undefined; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

// ─── Global navigation ───
// `home` = on the home page (anchors scroll); elsewhere they lead back to the home page.
export function GlobalNav({ home = true }) {
  const to = (href) => (home ? href : `/${href}`);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);
  return (
    <header className={`gn ${open ? 'is-open' : ''}`}>
      <nav className="gn__bar lp-wrap" aria-label="Main">
        <Link to="/" className="gn__brand" aria-label="Glowquill — home">
          <BrandLogo size={24} />
        </Link>
        <ul className="gn__links">
          {NAV.map((n) => <li key={n.href}><a href={to(n.href)}>{n.label}</a></li>)}
        </ul>
        <div className="gn__actions">
          <ThemeToggle className="gn__theme" />
          <Link to="/login" className="gn__signin">Sign in</Link>
          <Link to="/signup" className="gn__cta">Start free</Link>
          <button className="gn__toggle" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>
      {open && (
        <div className="gn__sheet">
          <ul>
            {NAV.map((n) => <li key={n.href}><a href={to(n.href)} onClick={() => setOpen(false)}>{n.label}</a></li>)}
            <li><Link to="/login">Sign in</Link></li>
          </ul>
          <Link to="/signup" className="btn btn-primary btn-lg w-full">Start free</Link>
        </div>
      )}
    </header>
  );
}

// ─── Hero ───
function Hero() {
  return (
    <section className="hero">
      <div className="lp-wrap hero__copy">
        <p className="eyebrow">Glowquill Article Writer for Shopify</p>
        <h1 className="h-hero">Content that sells.<br />Written for you.</h1>
        <p className="hero__lead">
          Blog articles, store SEO and Instagram posts — made from your own catalogue, with your real product photos.
        </p>
        <div className="cta-row">
          <Link to="/signup" className="btn btn-primary btn-lg">Start free</Link>
          <a href="#how" className="link-more">See how it works <ChevronRight size={18} /></a>
        </div>
        <p className="hero__note">Free plan. No card needed.</p>
      </div>

      <div className="lp-wrap hero__stage" aria-hidden="true">
        <div className="browser">
          <div className="browser__bar">
            <span /><span /><span />
            <div className="browser__url">maison-aura.com/blogs/journal</div>
          </div>
          <div className="browser__body">
            <article className="mock-article">
              <Photo id={P.earringsGold} w={760} h={420} className="mock-article__hero" eager />
              <p className="mock-article__kicker">Style guide · 6 min read</p>
              <h3 className="mock-article__title">How to style gold earrings for every occasion</h3>
              <p className="mock-article__text">
                From a Monday meeting to a Sunday brunch, the right pair changes the whole look. Here is how to choose — and the three pieces our customers reach for most.
              </p>
              <div className="mock-article__shop">
                <p>Shop the look</p>
                <div className="mock-products">
                  {[
                    { id: P.earringsLeaf, name: 'Leaf drop earrings', price: '₹2,450' },
                    { id: P.braceletRose, name: 'Rosé link bracelet', price: '₹3,200' },
                    { id: P.ring, name: 'Halo ring', price: '₹4,900' },
                  ].map((p) => (
                    <div className="mock-product" key={p.name}>
                      <Photo id={p.id} w={220} h={220} />
                      <span>{p.name}</span>
                      <strong>{p.price}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </article>
          </div>
        </div>

        <div className="float-ig">
          <div className="ig-card">
            <div className="ig-card__head"><span className="ig-card__avatar" />maison.aura</div>
            <div className="ig-card__media">
              <Photo id={P.braceletDark} w={360} h={450} />
              <div className="ig-card__overlay">
                <span>New in</span>
                <strong>Made to shine.</strong>
              </div>
            </div>
            <div className="ig-card__icons"><Heart size={18} /><MessageCircle size={18} /><Send size={18} /><Bookmark size={18} style={{ marginLeft: 'auto' }} /></div>
          </div>
        </div>

        <div className="float-seo">
          <div className="seo-ring"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" /><circle cx="18" cy="18" r="15.5" className="seo-ring__val" /></svg><b>94</b></div>
          <div>
            <p className="float-seo__title">SEO, last night</p>
            <ul>
              <li><Check size={14} /> 12 descriptions written</li>
              <li><Check size={14} /> 31 image alt texts</li>
              <li><Check size={14} /> 2 dead links removed</li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Highlights (tile grid) ───
function Highlights() {
  return (
    <section className="highlights" id="articles">
      <div className="lp-wrap">
        <h2 className="h-section reveal">Everything your store<br />needs to be found.</h2>

        <div className="tiles">
          <div className="tile tile--wide reveal">
            <div className="tile__copy">
              <p className="eyebrow">Blog articles</p>
              <h3 className="h-tile">Articles that link to what you sell.</h3>
              <p className="tile__text">Pick a topic, or let a campaign choose. Every article uses your product photos, links to real products and collections, and ships with its SEO title, description and FAQ.</p>
              <Link to="/signup" className="link-more">Write your first article <ChevronRight size={17} /></Link>
            </div>
            <div className="tile__art tile__art--products">
              {[
                { id: P.pearls, name: 'Pearl strand' },
                { id: P.earringsLeaf, name: 'Leaf drops' },
                { id: P.ring, name: 'Halo ring' },
              ].map((p, i) => (
                <figure key={p.name} className={`prod prod--${i}`}>
                  <Photo id={p.id} w={300} h={360} />
                  <figcaption>{p.name}<span>Linked in article</span></figcaption>
                </figure>
              ))}
            </div>
          </div>

          <div className="tile tile--dark reveal" id="seo">
            <div className="tile__copy">
              <p className="eyebrow eyebrow--light">SEO automation</p>
              <h3 className="h-tile">Your store, checked every night.</h3>
              <p className="tile__text">Every product, collection and page is crawled like Google sees it. Missing descriptions, alt text and broken links get fixed — and every change can be undone.</p>
            </div>
            <div className="fixlist">
              {[
                ['Search description', 'Halo ring', 'Written'],
                ['Image alt text', 'Leaf drop earrings', 'Added'],
                ['Broken link', 'Journal: Festive edit', 'Removed'],
                ['Search title', 'Bracelets', 'Written'],
              ].map(([what, where, done]) => (
                <div className="fixlist__row" key={what + where}>
                  <div><strong>{what}</strong><span>{where}</span></div>
                  <em>{done}</em>
                </div>
              ))}
            </div>
          </div>

          <div className="tile reveal" id="instagram">
            <div className="tile__copy">
              <p className="eyebrow">Instagram</p>
              <h3 className="h-tile">A new post every day.</h3>
              <p className="tile__text">A fresh look and layout each time, with the caption written for you — posted on your schedule.</p>
            </div>
            <div className="tile__art tile__art--post">
              <div className="post45">
                <Photo id={P.ceramics} w={420} h={525} />
                <div className="post45__text"><span>Slow mornings</span><strong>The Dune cup set</strong></div>
              </div>
            </div>
          </div>

          <div className="tile reveal">
            <div className="tile__copy">
              <p className="eyebrow">Campaigns</p>
              <h3 className="h-tile">Set the schedule once.</h3>
              <p className="tile__text">Choose a collection and how often. Articles and posts go out on their own.</p>
            </div>
            <div className="week">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
                <div key={d} className="week__day">
                  <span>{d}</span>
                  {i % 2 === 0 && <i className="week__dot week__dot--blog" title="Article" />}
                  <i className="week__dot week__dot--ig" title="Instagram post" />
                </div>
              ))}
            </div>
            <div className="week__legend"><span><i className="week__dot week__dot--blog" /> Article</span><span><i className="week__dot week__dot--ig" /> Instagram post</span></div>
          </div>

          <div className="tile reveal">
            <div className="tile__copy">
              <p className="eyebrow">Business DNA</p>
              <h3 className="h-tile">It learns your store first.</h3>
              <p className="tile__text">Products, collections, prices and the way you write — so nothing sounds generic.</p>
            </div>
            <div className="dna">
              {[
                { id: P.serum, name: 'Skincare', n: '24 products' },
                { id: P.bottle, name: 'Everyday', n: '18 products' },
                { id: P.ceramics, name: 'Home', n: '31 products' },
              ].map((c) => (
                <div className="dna__row" key={c.name}>
                  <Photo id={c.id} w={96} h={96} />
                  <div><strong>{c.name}</strong><span>{c.n}</span></div>
                  <Check size={16} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── The promise (dark) ───
function Promise_() {
  return (
    <section className="promise">
      <div className="lp-wrap">
        <div className="promise__head reveal">
          <p className="eyebrow eyebrow--light">Product fidelity</p>
          <h2 className="h-section">Your products,<br />exactly as they are.</h2>
          <p className="promise__lead">
            The AI only designs the scene. Then your real product pixels are laid back on top — colour, stones,
            engraving and shape stay exactly as photographed. If anything moved, the post is thrown away and made again.
          </p>
        </div>
        <div className="promise__pair reveal">
          <figure className="pair-card">
            <div className="pair-card__media pair-card__media--photo"><Photo id={P.braceletRose} w={520} h={650} /></div>
            <figcaption>Your store photo</figcaption>
          </figure>
          <ChevronRight className="promise__arrow" size={28} aria-hidden="true" />
          <figure className="pair-card">
            <div className="pair-card__media pair-card__media--scene">
              <div className="scene-arch"><Photo id={P.braceletRose} w={420} h={520} /></div>
              <div className="scene-text"><span>The Rosé edit</span><strong>Wear it every day.</strong></div>
            </div>
            <figcaption>Your post — same product, new scene</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

// ─── How it works ───
function HowItWorks() {
  const steps = [
    { icon: Store, title: 'Connect your store', text: 'Link your Shopify store in a couple of minutes. Your access token is stored encrypted.' },
    { icon: ScanSearch, title: 'We learn your store', text: 'Business DNA reads your products, collections and existing articles.' },
    { icon: Rocket, title: 'Content goes live', text: 'Write one article, or set campaigns and daily posts to run on their own.' },
  ];
  return (
    <section className="how" id="how">
      <div className="lp-wrap">
        <h2 className="h-section reveal">Up and running<br />in an afternoon.</h2>
        <ol className="steps">
          {steps.map((s, i) => (
            <li key={s.title} className="step reveal">
              <span className="step__num">{i + 1}</span>
              <s.icon className="step__icon" size={26} aria-hidden="true" />
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function PhotoBand() {
  return (
    <section className="band" aria-label="Made for merchants">
      <Photo id={P.merchant} w={1600} h={760} className="band__img" />
      <div className="band__shade" />
      <div className="lp-wrap band__copy reveal">
        <h2 className="h-section">Built for merchants who’d rather be running their store.</h2>
      </div>
    </section>
  );
}

// ─── Pricing (live from the plans set in Admin → Plans) ───
function formatLimit(n, unit) {
  return n == null ? `Unlimited ${unit}` : `${Number(n).toLocaleString('en-IN')} ${unit}`;
}
function Pricing({ plans, catalogue, failed }) {
  return (
    <section className="pricing" id="pricing">
      <div className="lp-wrap">
        <div className="pricing__head reveal">
          <h2 className="h-section">Pick a plan.<br />Change any time.</h2>
          <p className="section-lead">Start free. Move up when your store does.</p>
        </div>
        {failed && (
          <p className="pricing__fallback">Plans are shown inside the app. <Link to="/signup">Start free <ChevronRight size={15} /></Link></p>
        )}
        {!failed && (
          <div className="plans">
            {(plans || [null, null, null]).map((p, i) => (p ? (
              <div className="plan reveal" key={p.id}>
                <h3>{p.name}</h3>
                {p.description && <p className="plan__desc">{p.description}</p>}
                <p className="plan__price">
                  ₹{Number(p.price_inr || 0).toLocaleString('en-IN')}
                  <span>/month</span>
                </p>
                <Link to={`/signup?plan=${encodeURIComponent(p.id)}`} className={`btn ${Number(p.price_inr) > 0 ? 'btn-primary' : 'btn-dark'} w-full`}>
                  {Number(p.price_inr) > 0 ? `Choose ${p.name}` : 'Start free'}
                </Link>
                <ul className="plan__limits">
                  <li><strong>{formatLimit(p.limits?.monthly_article_limit ?? p.monthly_article_limit, 'articles')}</strong> a month</li>
                  <li><strong>{formatLimit(p.limits?.monthly_ig_post_limit ?? p.monthly_ig_post_limit, 'AI images')}</strong> a month</li>
                  {(catalogue?.limits || []).filter((l) => !l.metered).map((l) => (
                    <li key={l.key}>{l.label}: <strong>{p.limits?.[l.key] == null ? 'Unlimited' : p.limits[l.key]}</strong></li>
                  ))}
                </ul>
                <ul className="plan__features">
                  {(catalogue?.features || []).map((f) => {
                    const on = p.features?.[f.key] !== false;
                    return (
                      <li key={f.key} className={on ? '' : 'is-off'}>
                        {on ? <Check size={15} aria-label="Included" /> : <Minus size={15} aria-label="Not included" />}
                        {f.label}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <div className="plan plan--skeleton" key={i} aria-hidden="true" />
            )))}
          </div>
        )}
      </div>
    </section>
  );
}

function FAQ() {
  const [open, setOpen] = useState(-1);
  return (
    <section className="faq" id="faq">
      <div className="lp-wrap lp-wrap--narrow">
        <h2 className="h-section reveal">Questions? Answers.</h2>
        <div className="faq__list">
          {FAQS.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className={`faq__item ${isOpen ? 'is-open' : ''}`}>
                <button className="faq__q" aria-expanded={isOpen} aria-controls={`faq-a-${i}`} onClick={() => setOpen(isOpen ? -1 : i)}>
                  <span>{item.q}</span>
                  <Plus size={22} aria-hidden="true" />
                </button>
                <div id={`faq-a-${i}`} className="faq__a" role="region" hidden={!isOpen}>{item.a}</div>
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
    <section className="final">
      <div className="lp-wrap final__inner reveal">
        <BrandMark size={56} className="final__mark" />
        <h2 className="h-section">Your next article is<br />one click away.</h2>
        <div className="cta-row cta-row--center">
          <Link to="/signup" className="btn btn-primary btn-lg">Start free</Link>
          <Link to="/login" className="link-more">Sign in <ChevronRight size={18} /></Link>
        </div>
      </div>
    </section>
  );
}

export function Footer({ home = true }) {
  const to = (href) => (home ? href : `/${href}`);
  return (
    <footer className="foot">
      <div className="lp-wrap">
        <p className="foot__note">
          Product photos on this page are illustrative. Glowquill Article Writer works with any Shopify store and uses your own catalogue and photos.
        </p>
        <div className="foot__cols">
          <div>
            <h4>Product</h4>
            <a href={to('#articles')}>Blog articles</a>
            <a href={to('#seo')}>SEO automation</a>
            <a href={to('#instagram')}>Instagram</a>
            <a href={to('#pricing')}>Pricing</a>
          </div>
          <div>
            <h4>Account</h4>
            <Link to="/login">Sign in</Link>
            <Link to="/signup">Create account</Link>
          </div>
          <div>
            <h4>Legal</h4>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
            <Link to="/data-deletion">Data deletion</Link>
          </div>
        </div>
        <div className="foot__bottom">
          <span>Copyright © {new Date().getFullYear()} Glowquill. All rights reserved.</span>
          <span className="foot__brand"><BrandMark size={16} /> Made for Shopify merchants</span>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  const [plans, setPlans] = useState(null);
  const [catalogue, setCatalogue] = useState(null);
  const [failed, setFailed] = useState(false);
  useReveal();
  // A link like /#pricing: jump there once the page has rendered.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!/^[a-z-]+$/.test(id)) return undefined;
    const t = setTimeout(() => document.getElementById(id)?.scrollIntoView(), 60);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    getPublicPlans()
      .then((r) => { setPlans(r.data || []); setCatalogue(r.catalogue || null); })
      .catch(() => setFailed(true));
  }, []);

  // Structured data mirrors what the page shows.
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'Glowquill Article Writer',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: 'Blog articles, store SEO and Instagram posts for Shopify stores, made from your own catalogue with your real product photos.',
      url: `${APP_URL}/`,
      ...(plans && plans.length ? {
        offers: plans.map((p) => ({ '@type': 'Offer', name: p.name, price: String(Number(p.price_inr) || 0), priceCurrency: 'INR', url: `${APP_URL}/signup?plan=${p.id}` })),
      } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ];

  return (
    <div className="lp">
      <Seo
        title="Blog, SEO and Instagram for Shopify"
        description="Blog articles, store SEO and Instagram posts for your Shopify store — made from your own catalogue, with your real product photos. Start free."
        path="/"
        jsonLd={jsonLd}
      />
      <GlobalNav />
      <main>
        <Hero />
        <Highlights />
        <Promise_ />
        <HowItWorks />
        <PhotoBand />
        <Pricing plans={plans} catalogue={catalogue} failed={failed} />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
      <style>{LANDING_CSS}</style>
    </div>
  );
}

// ─── Page-scoped CSS ───
export const LANDING_CSS = `
  html { scroll-behavior: smooth; }
  :root[data-theme='dark'] .lp {
    --lp-alt: #101012; --lp-tile: #1c1c1e; --lp-chip: #2c2c2e; --lp-card: #1c1c1e;
    --lp-text2: #a1a1a6; --lp-text3: #a1a1a6; --lp-line: rgba(255,255,255,0.12); --lp-line-strong: #3a3a3c;
    --lp-nav-link: rgba(245,245,247,0.82); --lp-hero-top: #000000; --lp-num: #3a3a3c;
  }
  :root[data-theme='dark'] .tile--dark { box-shadow: inset 0 0 0 1px rgba(255,255,255,0.1); }
  .lp {
    --lp-bg: var(--bg-page); --lp-alt: #f5f5f7; --lp-tile: #ffffff; --lp-chip: #f5f5f7; --lp-card: #f5f5f7;
    --lp-text2: #48484d; --lp-text3: #424245; --lp-line: rgba(0,0,0,0.08); --lp-line-strong: #d2d2d7;
    --lp-nav-link: rgba(0,0,0,0.8); --lp-hero-top: #fbfbfd; --lp-num: #d2d2d7;
    background: var(--lp-bg); color: var(--ink); font-size: 17px; line-height: 1.47; letter-spacing: -0.01em; }
  .lp section[id] { scroll-margin-top: 56px; }
  .lp-wrap { max-width: 1080px; margin: 0 auto; padding: 0 22px; }
  .lp-wrap--narrow { max-width: 820px; }

  /* type */
  .h-hero { font-size: clamp(48px, 8.2vw, 92px); line-height: 1.02; letter-spacing: -0.045em; font-weight: 600; }
  .h-section { font-size: clamp(36px, 5.4vw, 60px); line-height: 1.05; letter-spacing: -0.04em; font-weight: 600; }
  .h-tile { font-size: clamp(26px, 3vw, 36px); line-height: 1.1; letter-spacing: -0.032em; font-weight: 600; margin-bottom: 12px; }
  .eyebrow { font-size: 15px; font-weight: 600; color: var(--brand); margin-bottom: 10px; letter-spacing: -0.01em; }
  .eyebrow--light { color: #6cb0ff; }
  .section-lead { font-size: clamp(19px, 2vw, 24px); color: var(--text-muted); margin-top: 14px; letter-spacing: -0.015em; }
  .link-more { display: inline-flex; align-items: center; gap: 2px; font-size: 17px; color: var(--brand); font-weight: 400; }
  .link-more:hover { text-decoration: underline; text-underline-offset: 3px; }
  .cta-row { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; margin-top: 32px; }
  .cta-row--center { justify-content: center; }

  /* reveal on scroll */
  .reveal { opacity: 0; transform: translateY(24px); transition: opacity .8s cubic-bezier(.2,.7,.2,1), transform .8s cubic-bezier(.2,.7,.2,1); }
  .reveal.is-in { opacity: 1; transform: none; }

  /* ── global nav ── */
  .gn { position: sticky; top: 0; z-index: 50; background: var(--bar-glass); backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px); border-bottom: 1px solid var(--lp-line); }
  .gn__bar { height: 52px; display: flex; align-items: center; gap: 24px; }
  .gn__brand { display: inline-flex; align-items: center; gap: 8px; color: var(--ink); font-weight: 600; font-size: 15px; letter-spacing: -0.02em; flex-shrink: 0; }
  .gn__brand:hover { color: var(--ink); }
  .gn__links { list-style: none; display: flex; gap: 30px; margin: 0 auto; }
  .gn__links a { font-size: 13px; color: var(--lp-nav-link); letter-spacing: -0.01em; }
  .gn__links a:hover { color: var(--ink); }
  .gn__actions { display: flex; align-items: center; gap: 16px; flex-shrink: 0; }
  .gn__signin { font-size: 13px; color: var(--lp-nav-link); }
  .gn__theme { background: transparent; border: 0; width: 32px; height: 32px; border-radius: 50%; display: grid; place-items: center; color: var(--lp-nav-link); cursor: pointer; }
  .gn__theme:hover { background: var(--hover-fill); color: var(--ink); }
  .gn__signin:hover { color: var(--ink); }
  .gn__cta { font-size: 13px; color: #fff; background: var(--brand); padding: 5px 13px; border-radius: 980px; }
  .gn__cta:hover { color: #fff; background: var(--brand-hover); }
  .gn__toggle { display: none; background: transparent; border: 0; width: 36px; height: 36px; border-radius: 50%; place-items: center; color: var(--ink); cursor: pointer; }
  .gn__sheet { position: fixed; inset: 52px 0 0 0; background: var(--lp-bg); padding: 24px 32px 40px; display: flex; flex-direction: column; justify-content: space-between; animation: fadeIn .25s ease; }
  .gn__sheet ul { list-style: none; display: flex; flex-direction: column; gap: 6px; }
  .gn__sheet a { display: block; font-size: 28px; font-weight: 600; letter-spacing: -0.03em; color: var(--ink); padding: 6px 0; }
  .gn__sheet .btn { color: #fff; }
  @media (max-width: 860px) {
    .gn__links, .gn__signin { display: none; }
    .gn__toggle { display: grid; }
    .gn__actions { margin-left: auto; gap: 8px; }
  }

  /* ── hero ── */
  .hero { padding: 88px 0 0; overflow: hidden; background: linear-gradient(180deg, var(--lp-hero-top) 0%, var(--lp-bg) 60%); }
  .hero__copy { text-align: center; }
  .hero__copy .eyebrow { font-size: 17px; }
  .hero__lead { font-size: clamp(20px, 2.3vw, 27px); line-height: 1.3; letter-spacing: -0.02em; color: var(--ink); max-width: 760px; margin: 22px auto 0; }
  .hero .cta-row { justify-content: center; }
  .hero__note { font-size: 14px; color: var(--text-muted); margin-top: 18px; }
  .hero__stage { position: relative; margin-top: 64px; padding-bottom: 96px; }

  .browser { color: #1d1d1f; max-width: 860px; margin: 0 auto; border-radius: 16px; background: #fff; box-shadow: 0 40px 100px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.06); overflow: hidden; }
  .browser__bar { height: 40px; display: flex; align-items: center; gap: 7px; padding: 0 14px; background: #f5f5f7; border-bottom: 1px solid rgba(0,0,0,0.06); }
  .browser__bar > span { width: 11px; height: 11px; border-radius: 50%; background: #d9d9de; }
  .browser__url { margin: 0 auto; font-size: 12px; color: #6e6e73; background: #fff; border: 1px solid rgba(0,0,0,0.06); padding: 3px 14px; border-radius: 7px; transform: translateX(-24px); }
  .browser__body { padding: 36px 56px 44px; }
  .mock-article { max-width: 640px; margin: 0 auto; }
  .mock-article__hero { width: 100%; height: auto; aspect-ratio: 760 / 420; object-fit: cover; border-radius: 12px; display: block; background: #f0ece6; }
  .mock-article__kicker { font-size: 13px; color: #6e6e73; margin: 22px 0 6px; }
  .mock-article__title { color: #1d1d1f; font-family: Georgia, 'Times New Roman', serif; font-weight: 400; font-size: clamp(24px, 3vw, 34px); letter-spacing: -0.02em; line-height: 1.15; }
  .mock-article__text { font-size: 15.5px; color: #48484d; margin-top: 12px; line-height: 1.65; }
  .mock-article__shop { margin-top: 26px; padding-top: 18px; border-top: 1px solid rgba(0,0,0,0.08); }
  .mock-article__shop > p { font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text-muted); margin-bottom: 12px; }
  .mock-products { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
  .mock-product img { width: 100%; height: auto; aspect-ratio: 1; object-fit: cover; border-radius: 10px; display: block; background: #f2f2f4; }
  .mock-product span { display: block; font-size: 13px; margin-top: 8px; color: #1d1d1f; }
  .mock-product strong { display: block; font-size: 13px; font-weight: 600; color: #6e6e73; }

  .float-ig { position: absolute; right: max(0px, calc(50% - 612px)); top: 36px; width: 236px; animation: floaty 7s ease-in-out infinite; }
  .ig-card { color: #1d1d1f; background: #fff; border-radius: 18px; box-shadow: 0 30px 70px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.05); overflow: hidden; }
  .ig-card__head { display: flex; align-items: center; gap: 8px; padding: 10px 12px; font-size: 12.5px; font-weight: 600; }
  .ig-card__avatar { width: 22px; height: 22px; border-radius: 50%; background: conic-gradient(from 210deg, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5, #feda75); box-shadow: inset 0 0 0 2px #fff; }
  .ig-card__media { position: relative; }
  .ig-card__media img { width: 100%; height: auto; aspect-ratio: 4 / 5; object-fit: cover; display: block; }
  .ig-card__overlay { position: absolute; left: 14px; right: 14px; bottom: 16px; color: #fff; }
  .ig-card__overlay span { display: block; font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; opacity: 0.85; }
  .ig-card__overlay strong { font-family: Georgia, serif; font-weight: 400; font-size: 22px; letter-spacing: -0.01em; }
  .ig-card__icons { display: flex; gap: 12px; padding: 10px 12px 12px; color: #1d1d1f; }

  .float-seo { color: #1d1d1f; position: absolute; left: max(0px, calc(50% - 612px)); bottom: 20px; display: flex; gap: 14px; align-items: center; padding: 16px 18px; background: rgba(255,255,255,0.92); backdrop-filter: blur(20px); border-radius: 18px; box-shadow: 0 30px 70px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.05); animation: floaty 8s ease-in-out infinite reverse; }
  .float-seo__title { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
  .float-seo ul { list-style: none; display: flex; flex-direction: column; gap: 3px; }
  .float-seo li { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: #48484d; }
  .float-seo li svg { color: #1f8a3b; }
  .seo-ring { position: relative; width: 58px; height: 58px; flex-shrink: 0; }
  .seo-ring svg { width: 100%; height: 100%; transform: rotate(-90deg); }
  .seo-ring circle { fill: none; stroke: #ececf0; stroke-width: 3.2; }
  .seo-ring .seo-ring__val { stroke: #1f8a3b; stroke-linecap: round; stroke-dasharray: 91.6 97.4; }
  .seo-ring b { position: absolute; inset: 0; display: grid; place-items: center; font-size: 18px; font-weight: 600; letter-spacing: -0.03em; }
  @keyframes floaty { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }

  @media (max-width: 1100px) { .float-ig { right: 0; width: 200px; } .float-seo { left: 0; } }
  @media (max-width: 860px) {
    .hero { padding-top: 56px; }
    .hero__stage { margin-top: 44px; padding-bottom: 56px; }
    .browser__body { padding: 20px; }
    .browser__url { transform: none; }
    .float-ig, .float-seo { display: none; }
    .cta-row { gap: 20px; }
  }

  /* ── highlights ── */
  .highlights { background: var(--lp-alt); padding: 120px 0; }
  .highlights .h-section { margin-bottom: 56px; }
  .tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px; }
  .tile { background: var(--lp-tile); border-radius: 30px; padding: 44px 44px 0; overflow: hidden; display: flex; flex-direction: column; min-height: 520px; }
  .tile__copy { max-width: 440px; }
  .tile__text { font-size: 17px; color: var(--lp-text2); line-height: 1.5; }
  .tile .link-more { margin-top: 18px; }
  .tile--wide { grid-column: 1 / -1; flex-direction: row; align-items: center; gap: 40px; padding: 56px; min-height: 0; }
  .tile--wide .tile__copy { flex: 1; }
  .tile--dark { background: #000; color: #f5f5f7; }
  .tile--dark .h-tile { color: #f5f5f7; }
  .tile--dark .tile__text { color: #a1a1a6; }

  .tile__art--products { flex: 1.15; display: flex; justify-content: center; align-items: flex-end; gap: 14px; }
  .prod { margin: 0; width: 31%; background: var(--lp-chip); border-radius: 18px; overflow: hidden; }
  .prod img { width: 100%; height: auto; aspect-ratio: 5 / 6; object-fit: cover; display: block; }
  .prod figcaption { padding: 10px 12px 12px; font-size: 13.5px; font-weight: 600; }
  .prod figcaption span { display: flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 500; color: var(--brand); margin-top: 2px; }
  .prod--1 { transform: translateY(-22px); }

  .fixlist { margin: 36px -44px 0; padding: 0 44px 44px; display: flex; flex-direction: column; gap: 10px; flex: 1; justify-content: flex-end; }
  .fixlist__row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; background: #1c1c1e; border-radius: 14px; }
  .fixlist__row strong { display: block; font-size: 14.5px; font-weight: 600; color: #f5f5f7; }
  .fixlist__row span { display: block; font-size: 13px; color: #86868b; }
  .fixlist__row em { font-style: normal; font-size: 12.5px; font-weight: 600; color: #30d158; background: rgba(48,209,88,0.14); padding: 3px 10px; border-radius: 980px; }

  .tile__art--post { flex: 1; display: flex; justify-content: center; align-items: flex-end; margin-top: 32px; }
  .post45 { position: relative; width: min(300px, 100%); border-radius: 18px 18px 0 0; overflow: hidden; box-shadow: 0 -10px 50px rgba(0,0,0,0.12); }
  .post45 img { width: 100%; height: auto; aspect-ratio: 4 / 5; object-fit: cover; display: block; }
  .post45__text { position: absolute; left: 20px; right: 20px; top: 22px; color: #3b2f27; }
  .post45__text span { display: block; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; }
  .post45__text strong { font-family: Georgia, serif; font-weight: 400; font-size: 26px; letter-spacing: -0.01em; }

  .week { margin-top: auto; display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; padding-bottom: 14px; padding-top: 32px; }
  .week__day { background: var(--lp-chip); border-radius: 14px; padding: 12px 6px 14px; display: flex; flex-direction: column; align-items: center; gap: 8px; min-height: 112px; }
  .week__day span { font-size: 12.5px; color: var(--text-muted); font-weight: 600; }
  .week__dot { display: inline-block; width: 22px; height: 22px; border-radius: 7px; }
  .week__dot--blog { background: var(--brand); }
  .week__dot--ig { background: linear-gradient(135deg, #fa7e1e, #d62976); }
  .week__legend { display: flex; gap: 18px; font-size: 13px; color: var(--text-muted); padding-bottom: 40px; }
  .week__legend span { display: inline-flex; align-items: center; gap: 6px; }
  .week__legend .week__dot { width: 10px; height: 10px; border-radius: 3px; }

  .dna { margin-top: auto; padding: 32px 0 44px; display: flex; flex-direction: column; gap: 10px; }
  .dna__row { display: flex; align-items: center; gap: 14px; padding: 10px 14px 10px 10px; background: var(--lp-chip); border-radius: 16px; }
  .dna__row img { width: 48px; height: 48px; border-radius: 10px; object-fit: cover; }
  .dna__row div { flex: 1; }
  .dna__row strong { display: block; font-size: 15px; font-weight: 600; }
  .dna__row span { font-size: 13px; color: var(--text-muted); }
  .dna__row > svg { color: var(--accent-success); }

  @media (max-width: 860px) {
    .highlights { padding: 72px 0; }
    .highlights .h-section { margin-bottom: 32px; }
    .tiles { grid-template-columns: 1fr; gap: 16px; }
    .tile, .tile--wide { padding: 32px 26px 0; border-radius: 24px; min-height: 0; }
    .tile--wide { flex-direction: column; align-items: stretch; padding-bottom: 32px; }
    .fixlist { margin: 28px -26px 0; padding: 0 26px 32px; }
    .tile__art--products { gap: 10px; }
    .prod figcaption { font-size: 12px; padding: 8px; }
    .prod figcaption span { display: none; }
  }

  /* ── promise ── */
  .promise { background: #000; color: #f5f5f7; padding: 130px 0; }
  .promise .h-section { color: #f5f5f7; }
  .promise__head { text-align: center; max-width: 820px; margin: 0 auto; }
  .promise__lead { font-size: clamp(19px, 2vw, 22px); color: #a1a1a6; margin-top: 22px; line-height: 1.45; }
  .promise__pair { display: flex; align-items: center; justify-content: center; gap: 28px; margin-top: 72px; }
  .promise__arrow { color: #6e6e73; flex-shrink: 0; }
  .pair-card { margin: 0; width: min(360px, 42%); text-align: center; }
  .pair-card figcaption { font-size: 14px; color: #a1a1a6; margin-top: 16px; }
  .pair-card__media { border-radius: 22px; overflow: hidden; aspect-ratio: 4 / 5; position: relative; }
  .pair-card__media--photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pair-card__media--scene { background: radial-gradient(120% 90% at 50% 100%, #c9a48a 0%, #7a5442 45%, #2a1b14 100%); display: flex; align-items: flex-end; justify-content: center; }
  .scene-arch { width: 68%; height: 72%; border-radius: 999px 999px 18px 18px; overflow: hidden; box-shadow: 0 30px 60px rgba(0,0,0,0.35); margin-bottom: 9%; }
  .scene-arch img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .scene-text { position: absolute; top: 7%; left: 0; right: 0; text-align: center; color: #fff5ee; }
  .scene-text span { display: block; font-size: 10.5px; letter-spacing: 0.2em; text-transform: uppercase; opacity: 0.85; }
  .scene-text strong { font-family: Georgia, serif; font-weight: 400; font-size: clamp(18px, 2.2vw, 26px); }
  @media (max-width: 860px) {
    .promise { padding: 80px 0; }
    .promise__pair { gap: 10px; margin-top: 44px; }
    .pair-card { width: 46%; }
    .promise__arrow { width: 18px; }
  }

  /* ── how it works ── */
  .how { padding: 130px 0; background: var(--lp-bg); }
  .how .h-section { text-align: center; margin-bottom: 64px; }
  .steps { list-style: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 22px; }
  .step { background: var(--lp-card); border-radius: 26px; padding: 34px 30px 36px; position: relative; }
  .step__num { position: absolute; top: 24px; right: 28px; font-size: 56px; font-weight: 600; letter-spacing: -0.05em; color: var(--lp-num); line-height: 1; }
  .step__icon { color: var(--brand); margin-bottom: 40px; }
  .step h3 { font-size: 22px; letter-spacing: -0.025em; margin-bottom: 8px; }
  .step p { font-size: 16px; color: var(--lp-text2); }
  @media (max-width: 860px) { .how { padding: 80px 0; } .how .h-section { margin-bottom: 36px; } .steps { grid-template-columns: 1fr; } }

  /* ── photo band ── */
  .band { position: relative; height: clamp(420px, 56vw, 680px); overflow: hidden; display: flex; align-items: flex-end; }
  .band__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .band__img { object-position: 50% 35%; }
  .band__shade { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.7) 100%); }
  .band__copy { position: relative; padding-bottom: 72px; width: 100%; }
  .band__copy .h-section { color: #fff; max-width: 760px; }

  /* ── pricing ── */
  .pricing { background: var(--lp-alt); padding: 130px 0; }
  .pricing__head { text-align: center; margin-bottom: 56px; }
  .pricing__fallback { text-align: center; font-size: 19px; color: var(--text-muted); }
  .pricing__fallback a { display: inline-flex; align-items: center; }
  .plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 22px; align-items: start; }
  .plan { background: var(--lp-tile); border-radius: 26px; padding: 34px 30px; }
  .plan h3 { font-size: 26px; letter-spacing: -0.03em; }
  .plan__desc { font-size: 15px; color: var(--text-muted); margin-top: 6px; }
  .plan__price { font-size: 44px; font-weight: 600; letter-spacing: -0.045em; margin: 18px 0 22px; line-height: 1; }
  .plan__price span { font-size: 16px; font-weight: 400; color: var(--text-muted); letter-spacing: -0.01em; margin-left: 4px; }
  .plan .btn { padding: 11px 18px; font-size: 15px; }
  .plan__limits { list-style: none; margin: 26px 0 0; padding: 22px 0 0; border-top: 1px solid var(--lp-line); display: flex; flex-direction: column; gap: 8px; font-size: 15px; color: var(--lp-text2); }
  .plan__limits strong { color: var(--ink); font-weight: 600; }
  .plan__features { list-style: none; margin: 20px 0 0; padding: 20px 0 0; border-top: 1px solid var(--lp-line); display: flex; flex-direction: column; gap: 9px; font-size: 15px; }
  .plan__features li { display: flex; align-items: center; gap: 10px; }
  .plan__features li svg { color: var(--accent-success); flex-shrink: 0; }
  .plan__features li.is-off { color: var(--text-faint); }
  .plan__features li.is-off svg { color: var(--text-faint); }
  .plan--skeleton { min-height: 560px; background: var(--lp-tile); opacity: 0.6; }
  @media (max-width: 860px) { .pricing { padding: 80px 0; } .pricing__head { margin-bottom: 36px; } }

  /* ── faq ── */
  .faq { padding: 130px 0; background: var(--lp-bg); }
  .faq .h-section { margin-bottom: 40px; }
  .faq__item { border-bottom: 1px solid var(--lp-line); }
  .faq__q { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 26px 0; background: transparent; border: 0; cursor: pointer; text-align: left; font: inherit; font-size: clamp(19px, 2vw, 24px); font-weight: 600; letter-spacing: -0.025em; color: var(--ink); }
  .faq__q svg { flex-shrink: 0; color: var(--text-muted); transition: transform .3s cubic-bezier(.2,.7,.2,1); }
  .faq__item.is-open .faq__q svg { transform: rotate(45deg); }
  .faq__a { padding: 0 48px 28px 0; font-size: 17px; color: var(--lp-text2); line-height: 1.55; }
  @media (max-width: 860px) { .faq { padding: 80px 0; } .faq__a { padding-right: 0; } }

  /* ── final ── */
  .final { padding: 140px 0; background: var(--lp-hero-top); text-align: center; border-top: 1px solid var(--lp-line); }
  .final__mark { margin-bottom: 28px; }
  @media (max-width: 860px) { .final { padding: 88px 0; } }

  /* ── footer ── */
  .foot { background: var(--lp-alt); padding: 22px 0 28px; font-size: 12px; color: var(--text-muted); line-height: 1.5; }
  .foot__note { padding-bottom: 16px; border-bottom: 1px solid var(--lp-line-strong); }
  .foot__cols { display: grid; grid-template-columns: repeat(3, minmax(0, 180px)); gap: 24px; padding: 22px 0; }
  .foot__cols h4 { font-size: 12px; font-weight: 600; color: var(--ink); letter-spacing: 0; margin-bottom: 8px; }
  .foot__cols a { display: block; color: var(--lp-text3); font-size: 12px; padding: 3px 0; }
  .foot__cols a:hover { color: var(--ink); text-decoration: underline; }
  .foot__bottom { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding-top: 16px; border-top: 1px solid var(--lp-line-strong); }
  .foot__brand { display: inline-flex; align-items: center; gap: 6px; }
  @media (max-width: 600px) { .foot__cols { grid-template-columns: 1fr 1fr; } }
`;
