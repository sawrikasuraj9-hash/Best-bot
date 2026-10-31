import sharp from 'sharp';

export interface MenuCardItem {
  name: string;
  desc: string;
  capsule: string;
}

export type MenuTheme = 'purple' | 'cyan' | 'gold' | 'red' | 'green' | 'pink' | 'blue';

export interface MenuCardOptions {
  title: string;
  subtitle?: string;
  cards: MenuCardItem[];
  footer?: string;
  theme?: MenuTheme;
  icon?: string;
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

const THEME_PALETTES: Record<MenuTheme, {
  bgStart: string;
  bgMid: string;
  bgEnd: string;
  border: string;
  cardStart: string;
  cardEnd: string;
  cardBorder: string;
  cardInnerGlow: string;
  titleLight: string;
  titleDark: string;
  subtitle: string;
  descText: string;
  pillBorder: string;
  pillText: string;
  iconBg: string;
  iconStroke: string;
  footerText: string;
}> = {
  purple: {
    bgStart: '#110324',
    bgMid: '#1b0638',
    bgEnd: '#090114',
    border: '#7e22ce',
    cardStart: '#250b47',
    cardEnd: '#130426',
    cardBorder: '#9333ea',
    cardInnerGlow: '#c084fc',
    titleLight: '#f5f3ff',
    titleDark: '#c084fc',
    subtitle: '#d8b4fe',
    descText: '#c4b5fd',
    pillBorder: '#a855f7',
    pillText: '#f3e8ff',
    iconBg: '#581c87',
    iconStroke: '#c084fc',
    footerText: '#a78bfa',
  },
  blue: {
    bgStart: '#041129',
    bgMid: '#0a1d47',
    bgEnd: '#020917',
    border: '#2563eb',
    cardStart: '#0f2759',
    cardEnd: '#06132f',
    cardBorder: '#3b82f6',
    cardInnerGlow: '#60a5fa',
    titleLight: '#eff6ff',
    titleDark: '#60a5fa',
    subtitle: '#93c5fd',
    descText: '#bfdbfe',
    pillBorder: '#3b82f6',
    pillText: '#dbeafe',
    iconBg: '#1e40af',
    iconStroke: '#93c5fd',
    footerText: '#60a5fa',
  },
  cyan: {
    bgStart: '#03171e',
    bgMid: '#062833',
    bgEnd: '#020d11',
    border: '#0891b2',
    cardStart: '#0b3947',
    cardEnd: '#041b24',
    cardBorder: '#06b6d4',
    cardInnerGlow: '#22d3ee',
    titleLight: '#ecfeff',
    titleDark: '#22d3ee',
    subtitle: '#67e8f9',
    descText: '#a5f3fc',
    pillBorder: '#06b6d4',
    pillText: '#cffafe',
    iconBg: '#155e75',
    iconStroke: '#67e8f9',
    footerText: '#22d3ee',
  },
  gold: {
    bgStart: '#1c1303',
    bgMid: '#2e1f06',
    bgEnd: '#0f0a01',
    border: '#d97706',
    cardStart: '#422c07',
    cardEnd: '#211603',
    cardBorder: '#f59e0b',
    cardInnerGlow: '#fbbf24',
    titleLight: '#fffbeb',
    titleDark: '#fbbf24',
    subtitle: '#fde68a',
    descText: '#fde68a',
    pillBorder: '#f59e0b',
    pillText: '#fef3c7',
    iconBg: '#78350f',
    iconStroke: '#fde68a',
    footerText: '#fbbf24',
  },
  red: {
    bgStart: '#1f0407',
    bgMid: '#33080e',
    bgEnd: '#120104',
    border: '#dc2626',
    cardStart: '#4a0b14',
    cardEnd: '#240409',
    cardBorder: '#ef4444',
    cardInnerGlow: '#f87171',
    titleLight: '#fef2f2',
    titleDark: '#f87171',
    subtitle: '#fca5a5',
    descText: '#fecaca',
    pillBorder: '#ef4444',
    pillText: '#fee2e2',
    iconBg: '#7f1d1d',
    iconStroke: '#fca5a5',
    footerText: '#f87171',
  },
  green: {
    bgStart: '#041c10',
    bgMid: '#082e1b',
    bgEnd: '#020f08',
    border: '#059669',
    cardStart: '#0d4227',
    cardEnd: '#052314',
    cardBorder: '#10b981',
    cardInnerGlow: '#34d399',
    titleLight: '#ecfdf5',
    titleDark: '#34d399',
    subtitle: '#6ee7b7',
    descText: '#a7f3d0',
    pillBorder: '#10b981',
    pillText: '#d1fae5',
    iconBg: '#064e3b',
    iconStroke: '#6ee7b7',
    footerText: '#34d399',
  },
  pink: {
    bgStart: '#210419',
    bgMid: '#38072b',
    bgEnd: '#12020d',
    border: '#db2777',
    cardStart: '#4a0c39',
    cardEnd: '#26041c',
    cardBorder: '#ec4899',
    cardInnerGlow: '#f472b6',
    titleLight: '#fdf2f8',
    titleDark: '#f472b6',
    subtitle: '#f9a8d4',
    descText: '#fbcfe8',
    pillBorder: '#ec4899',
    pillText: '#fce7f3',
    iconBg: '#831843',
    iconStroke: '#f9a8d4',
    footerText: '#f472b6',
  },
};

export async function generateMenuCardImage(options: MenuCardOptions): Promise<Buffer> {
  const themeKey = options.theme || 'purple';
  const cacheKey = `${options.title}_${themeKey}_${options.cards.length}_${options.cards.map(c => c.name).join(',')}`;
  if (cardCache.has(cacheKey)) {
    return cardCache.get(cacheKey)!;
  }

  const p = THEME_PALETTES[themeKey] || THEME_PALETTES.purple;
  const { title, subtitle = 'Tap to copy!', cards, footer = '⚡ YASHI HALLS MINI • WA ASSISTANT ⚡', icon = '✦' } = options;
  const width = 1080;
  const headerHeight = 200;
  const cardRowHeight = 150;
  const rowCount = Math.ceil(cards.length / 2);
  const footerHeight = 90;
  const height = headerHeight + (rowCount * cardRowHeight) + footerHeight;

  const cardWidth = 485;
  const cardHeight = 130;
  const leftColX = 40;
  const rightColX = 555;
  const cardStartY = 175;

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
      <rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="22" ry="22" fill="url(#cardGrad)" stroke="${p.cardBorder}" stroke-width="2.5" />
      
      <!-- Subtle top inner glow line -->
      <path d="M ${x + 20} ${y + 2} L ${x + cardWidth - 20} ${y + 2}" stroke="${p.cardInnerGlow}" stroke-width="1.8" stroke-opacity="0.35" stroke-linecap="round" />

      <!-- Title text -->
      <text x="${x + cardWidth / 2}" y="${y + 36}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="25" fill="${p.titleLight}" letter-spacing="1.2">${safeName}</text>
      
      <!-- Subtitle description -->
      <text x="${x + cardWidth / 2}" y="${y + 63}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="600" font-size="13" fill="${p.descText}" letter-spacing="0.5" fill-opacity="0.88">${safeDesc}</text>
      
      <!-- Capsule Pill -->
      <rect x="${capsuleX}" y="${y + 76}" width="${capsuleWidth}" height="${38}" rx="15" ry="15" fill="#070110" stroke="${p.pillBorder}" stroke-width="2" />
      
      <!-- Capsule Text -->
      <text x="${x + cardWidth / 2}" y="${y + 102}" text-anchor="middle" font-family="'Courier New', Courier, monospace, sans-serif" font-weight="800" font-size="19" fill="${p.pillText}" letter-spacing="0.6">${safeCapsule}</text>
    </g>
    `;
  });

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <!-- Background gradient -->
      <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${p.bgStart}" />
        <stop offset="35%" stop-color="${p.bgMid}" />
        <stop offset="70%" stop-color="${p.bgStart}" />
        <stop offset="100%" stop-color="${p.bgEnd}" />
      </linearGradient>

      <!-- Card gradient -->
      <linearGradient id="cardGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${p.cardStart}" />
        <stop offset="100%" stop-color="${p.cardEnd}" />
      </linearGradient>

      <!-- Header text gradient -->
      <linearGradient id="titleGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="${p.titleLight}" />
        <stop offset="50%" stop-color="#ffffff" />
        <stop offset="100%" stop-color="${p.titleDark}" />
      </linearGradient>
    </defs>

    <!-- Canvas Background -->
    <rect width="${width}" height="${height}" fill="url(#bgGrad)" />

    <!-- Outer Frame Border -->
    <rect x="14" y="14" width="${width - 28}" height="${height - 28}" rx="34" ry="34" fill="none" stroke="${p.border}" stroke-width="2.5" stroke-opacity="0.45" />

    <!-- Top Glow Orb Icon -->
    <circle cx="${width / 2}" cy="54" r="18" fill="${p.iconBg}" fill-opacity="0.35" stroke="${p.iconStroke}" stroke-width="2.5" />
    <text x="${width / 2}" y="60" text-anchor="middle" font-size="20" fill="${p.titleLight}">${escapeXml(icon)}</text>

    <!-- Header Title -->
    <text x="${width / 2}" y="108" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="38" fill="url(#titleGrad)" letter-spacing="2.5">${escapeXml(title)}</text>

    <!-- Subtitle: Tap to copy! -->
    <text x="${width / 2}" y="142" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="800" font-size="22" fill="${p.subtitle}" letter-spacing="1.2">${escapeXml(subtitle)}</text>

    <!-- Cards Grid -->
    ${cardsSvg}

    <!-- Bottom Footer -->
    <text x="${width / 2}" y="${height - 34}" text-anchor="middle" font-family="'Courier New', Courier, monospace, sans-serif" font-weight="800" font-size="16" fill="${p.footerText}" fill-opacity="0.85" letter-spacing="2.2">${escapeXml(footer)}</text>
  </svg>
  `;

  const pngBuffer = await sharp(Buffer.from(svg))
    .png({ quality: 95, compressionLevel: 8 })
    .toBuffer();

  cardCache.set(cacheKey, pngBuffer);
  return pngBuffer;
}
