import React from 'react';
import { GlobalNav, Footer, LANDING_CSS } from '../pages/Landing';

// The public site's menu and footer around a page (privacy, terms, data deletion).
export default function SiteChrome({ children }) {
  return (
    <div className="lp lp--page">
      <GlobalNav home={false} />
      <main>{children}</main>
      <Footer home={false} />
      <style>{LANDING_CSS}</style>
    </div>
  );
}
