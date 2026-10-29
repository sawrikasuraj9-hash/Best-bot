import sharp from 'sharp';

export interface MenuCardItem {
  name: string;
  desc: string;
  capsule: string;
}

export interface MenuCardOptions {
  title: string;
  subtitle?: string;
  cards: MenuCardItem[];
  footer?: string;
}

const cardCache = new Map<string, Buffer>();

function escapeXml(unsafe: string): string {
  return (unsafe || '').replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

export async function generateMenuCardImage(options: MenuCardOptions): Promise<Buffer> {
  const cacheKey = `${options.title}_${options.cards.length}_${options.cards.map(c => c.name).join(',')}`;
  if (cardCache.has(cacheKey)) {
    return cardCache.get(cacheKey)!;
  }

  const { title, subtitle = 'Tap to copy!', cards, footer = '⚡ YASHI HALLS MINI • WA ASSISTANT ⚡' } = options;
  const width = 1080;
  const headerHeight = 190;
  const cardRowHeight = 145;
  const rowCount = Math.ceil(cards.length / 2);
  const footerHeight = 85;
  const height = headerHeight + (rowCount * cardRowHeight) + footerHeight;

  const cardWidth = 485;
  const cardHeight = 126;
  const leftColX = 40;
  const rightColX = 555;
  const cardStartY = 165;

  let cardsSvg = '';

  cards.forEach((card, index) => {
    const isRightCol = index % 2 === 1;
    const rowIndex = Math.floor(index / 2);
    const x = isRightCol ? rightColX : leftColX;
    const y = cardStartY + (rowIndex * cardRowHeight);

    const safeName = escapeXml(card.name.toUpperCase());
    const safeDesc = escapeXml(card.desc.toUpperCase());
    const safeCapsule = escapeXml(card.capsule.split(' ')[0]);

    // Compute capsule width based on text length
    const capsuleWidth = Math.min(cardWidth - 60, Math.max(140, safeCapsule.length * 15 + 36));
    const capsuleX = x + (cardWidth - capsuleWidth) / 2;

    cardsSvg += `
    <!-- Card ${index + 1}: ${safeName} -->
    <g>
      <!-- Card background -->
      <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="22" ry="22" fill="url(#cardGrad)" stroke="#6b21a8" stroke-width="2.5" />
      
      <!-- Subtle top inner glow line -->
      <path d="M ${x + 20} ${y + 2} L ${x + cardWidth - 20} ${y + 2}" stroke="#a855f7" stroke-width="1.5" stroke-opacity="0.3" stroke-linecap="round" />

      <!-- Title text -->
      <text x="${x + cardWidth / 2}" y="${y + 36}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="25" fill="#f5f3ff" letter-spacing="1.2">${safeName}</text>
      
      <!-- Subtitle description -->
      <text x="${x + cardWidth / 2}" y="${y + 63}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="600" font-size="13" fill="#c084fc" letter-spacing="0.5" fill-opacity="0.85">${safeDesc}</text>
      
      <!-- Capsule Pill -->
      <rect x="${capsuleX}" y="${y + 76}" width="${capsuleWidth}" height="${36}" rx="14" ry="14" fill="#0b0217" stroke="#9333ea" stroke-width="1.8" />
      
      <!-- Capsule Text -->
      <text x="${x + cardWidth / 2}" y="${y + 100}" text-anchor="middle" font-family="'Courier New', Courier, monospace, sans-serif" font-weight="700" font-size="19" fill="#e9d5ff" letter-spacing="0.6">${safeCapsule}</text>
    </g>
    `;
  });

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Background gradient -->
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#080114" />
        <stop offset="30%" stop-color="#140428" />
        <stop offset="70%" stop-color="#100322" />
        <stop offset="100%" stop-color="#070010" />
      </linearGradient>

      <!-- Card gradient -->
      <linearGradient id="cardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="#230d45" />
        <stop offset="100%" stop-color="#15062c" />
      </linearGradient>

      <!-- Header text gradient -->
      <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#e9d5ff" />
        <stop offset="50%" stop-color="#f3e8ff" />
        <stop offset="100%" stop-color="#c084fc" />
      </linearGradient>

      <!-- Glow filter -->
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="8" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    <!-- Canvas Background -->
    <rect width="${width}" height="${height}" fill="url(#bgGrad)" />

    <!-- Outer Frame Border -->
    <rect x="12" y="12" width="${width - 24}" height="${height - 24}" rx="32" ry="32" fill="none" stroke="#581c87" stroke-width="2" stroke-opacity="0.4" />

    <!-- Top Glow Orb Icon -->
    <circle cx="${width / 2}" cy="54" r="14" fill="#7e22ce" fill-opacity="0.25" stroke="#a855f7" stroke-width="2" />
    <circle cx="${width / 2}" cy="54" r="6" fill="#c084fc" />

    <!-- Header Title -->
    <text x="${width / 2}" y="104" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="38" fill="url(#titleGrad)" letter-spacing="2.5">${escapeXml(title)}</text>

    <!-- Subtitle: Tap to copy! -->
    <text x="${width / 2}" y="136" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="700" font-size="20" fill="#a855f7" letter-spacing="1">${escapeXml(subtitle)}</text>

    <!-- Cards Grid -->
    ${cardsSvg}

    <!-- Bottom Footer -->
    <text x="${width / 2}" y="${height - 32}" text-anchor="middle" font-family="'Courier New', Courier, monospace, sans-serif" font-weight="700" font-size="15" fill="#a78bfa" fill-opacity="0.75" letter-spacing="2">${escapeXml(footer)}</text>
  </svg>
  `;

  const pngBuffer = await sharp(Buffer.from(svg))
    .png({ quality: 95, compressionLevel: 8 })
    .toBuffer();

  cardCache.set(cacheKey, pngBuffer);
  return pngBuffer;
}
