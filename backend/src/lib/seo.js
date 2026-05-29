export function countWords(html) {
  if (!html) return 0;
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.split(' ').length : 0;
}

export function calculateSeoScore(article) {
  const checks = [];
  let totalScore = 0;
  const maxScore = 100;

  const titleLen = (article.title || '').length;
  if (titleLen >= 50 && titleLen <= 70) {
    checks.push({ name: 'Title Length', status: 'pass', score: 15, tip: `${titleLen} chars — perfect!` });
    totalScore += 15;
  } else if (titleLen >= 30 && titleLen <= 80) {
    checks.push({ name: 'Title Length', status: 'warn', score: 10, tip: `${titleLen} chars — aim for 50-70` });
    totalScore += 10;
  } else {
    checks.push({ name: 'Title Length', status: 'fail', score: 0, tip: `${titleLen} chars — should be 50-70` });
  }

  const seoTitleLen = (article.seoTitle || '').length;
  if (seoTitleLen >= 50 && seoTitleLen <= 60) {
    checks.push({ name: 'SEO Title', status: 'pass', score: 10, tip: `${seoTitleLen} chars — perfect!` });
    totalScore += 10;
  } else if (seoTitleLen > 0) {
    checks.push({ name: 'SEO Title', status: 'warn', score: 5, tip: `${seoTitleLen} chars — aim for 50-60` });
    totalScore += 5;
  } else {
    checks.push({ name: 'SEO Title', status: 'fail', score: 0, tip: 'Missing — add a meta title' });
  }

  const metaLen = (article.seoDescription || '').length;
  if (metaLen >= 150 && metaLen <= 160) {
    checks.push({ name: 'Meta Description', status: 'pass', score: 10, tip: `${metaLen} chars — perfect!` });
    totalScore += 10;
  } else if (metaLen > 0) {
    checks.push({ name: 'Meta Description', status: 'warn', score: 5, tip: `${metaLen} chars — aim for 150-160` });
    totalScore += 5;
  } else {
    checks.push({ name: 'Meta Description', status: 'fail', score: 0, tip: 'Missing — add a meta description' });
  }

  const words = countWords(article.bodyHtml || '');
  if (words >= 1000) {
    checks.push({ name: 'Word Count', status: 'pass', score: 15, tip: `${words} words — great depth!` });
    totalScore += 15;
  } else if (words >= 500) {
    checks.push({ name: 'Word Count', status: 'warn', score: 10, tip: `${words} words — aim for 1000+` });
    totalScore += 10;
  } else {
    checks.push({ name: 'Word Count', status: 'fail', score: 5, tip: `${words} words — too short, aim for 1000+` });
    totalScore += 5;
  }

  const h2Count = ((article.bodyHtml || '').match(/<h2/gi) || []).length;
  const h3Count = ((article.bodyHtml || '').match(/<h3/gi) || []).length;
  if (h2Count >= 3 && h3Count >= 1) {
    checks.push({ name: 'Heading Structure', status: 'pass', score: 15, tip: `${h2Count} H2s, ${h3Count} H3s — well structured!` });
    totalScore += 15;
  } else if (h2Count >= 2) {
    checks.push({ name: 'Heading Structure', status: 'warn', score: 10, tip: `${h2Count} H2s — add more subheadings` });
    totalScore += 10;
  } else {
    checks.push({ name: 'Heading Structure', status: 'fail', score: 0, tip: 'Missing H2/H3 headings' });
  }

  const links = ((article.bodyHtml || '').match(/<a\s+href/gi) || []).length;
  if (links >= 3) {
    checks.push({ name: 'Internal Links', status: 'pass', score: 15, tip: `${links} links — great for SEO!` });
    totalScore += 15;
  } else if (links >= 1) {
    checks.push({ name: 'Internal Links', status: 'warn', score: 8, tip: `${links} links — add more internal links` });
    totalScore += 8;
  } else {
    checks.push({ name: 'Internal Links', status: 'fail', score: 0, tip: 'No links — add product/collection links' });
  }

  const images = ((article.bodyHtml || '').match(/<img|article-image-placeholder/gi) || []).length;
  if (images >= 2) {
    checks.push({ name: 'Images', status: 'pass', score: 10, tip: `${images} images — visually rich!` });
    totalScore += 10;
  } else if (images >= 1) {
    checks.push({ name: 'Images', status: 'warn', score: 5, tip: '1 image — add more for engagement' });
    totalScore += 5;
  } else {
    checks.push({ name: 'Images', status: 'fail', score: 0, tip: 'No images — add image placeholders' });
  }

  const tagCount = (article.tags || '').split(',').filter(t => t.trim()).length;
  if (tagCount >= 5) {
    checks.push({ name: 'Tags', status: 'pass', score: 10, tip: `${tagCount} tags — well categorized!` });
    totalScore += 10;
  } else if (tagCount >= 2) {
    checks.push({ name: 'Tags', status: 'warn', score: 5, tip: `${tagCount} tags — add more` });
    totalScore += 5;
  } else {
    checks.push({ name: 'Tags', status: 'fail', score: 0, tip: 'Missing or too few tags' });
  }

  return { score: Math.min(totalScore, maxScore), maxScore, checks };
}
