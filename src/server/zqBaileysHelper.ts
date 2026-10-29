/**
 * ZQ Baileys Helper (Enhanced WhatsApp Interactive Buttons & Native Flow System)
 * Grounded on https://github.com/zqdevelopers/zq_baileys_helper.git
 * 
 * Provides:
 * 1. Automatic binary node injection (biz, interactive, native_flow, bot).
 * 2. Private 1-on-1 chat bot node support ({ tag: 'bot', attrs: { biz_bot: '1' } }).
 * 3. Group chat biz node support.
 * 4. Multi-device MD patch (documentWithCaptionMessage wrapper when needed).
 * 5. Direct relayMessage execution bypassing Baileys content validator.
 * 6. Quick Replies, CTA URLs, Single Select Lists, and Copy Codes.
 */

import fs from 'fs';
import {
  proto,
  generateWAMessageFromContent,
  isJidGroup,
  generateMessageIDV2,
  normalizeMessageContent,
} from '@whiskeysockets/baileys';

export interface ButtonItem {
  id?: string;
  text?: string;
  displayText?: string;
  buttonId?: string;
  buttonText?: { displayText: string };
  name?: string;
  buttonParamsJson?: string;
}

export interface ListRow {
  id: string;
  title: string;
  description?: string;
}

export interface ListSection {
  title: string;
  rows: ListRow[];
}

export interface SendButtonsData {
  title?: string;
  subtitle?: string;
  text: string;
  footer?: string;
  buttons?: ButtonItem[];
  urls?: Array<{ displayText: string; url: string }>;
  copyCodes?: Array<{ displayText?: string; copyCode: string }>;
  sections?: ListSection[];
  buttonText?: string;
  image?: Buffer | string | { url: string };
  headerType?: number;
}

/**
 * Normalizes button input shapes into the native_flow button structure
 */
export function buildInteractiveButtons(buttons: ButtonItem[] = []): any[] {
  return buttons.map((b, i) => {
    // 1. Already native_flow formatted
    if (b && b.name && b.buttonParamsJson) {
      return b;
    }

    // 2. Simple legacy: { id, text }
    if (b && (b.id || b.text)) {
      return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: b.text || b.displayText || `Action ${i + 1}`,
          id: b.id || `quick_${i + 1}`,
        }),
      };
    }

    // 3. Old Baileys: { buttonId, buttonText: { displayText } }
    if (b && b.buttonId && b.buttonText?.displayText) {
      return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: b.buttonText.displayText,
          id: b.buttonId,
        }),
      };
    }

    return b;
  });
}

/**
 * Detects button or list type in normalized message
 */
export function getButtonType(message: any): string | null {
  if (!message || typeof message !== 'object') return null;
  if (message.listMessage) return 'list';
  if (message.buttonsMessage) return 'buttons';
  if (message.interactiveMessage?.nativeFlowMessage) return 'native_flow';
  return null;
}

/**
 * Creates the exact binary node structure that official WhatsApp multi-device client expects.
 * Grounded on zq_baileys_helper getButtonArgs.
 */
export function getButtonArgs(message: any): any {
  const nativeFlow = message?.interactiveMessage?.nativeFlowMessage;
  const firstButtonName = nativeFlow?.buttons?.[0]?.name;

  if (nativeFlow && (firstButtonName === 'review_and_pay' || firstButtonName === 'payment_info')) {
    return {
      tag: 'biz',
      attrs: {
        native_flow_name: firstButtonName === 'review_and_pay' ? 'order_details' : firstButtonName,
      },
    };
  }

  // Generic & mixed interactive buttons (native_flow with v: '9', name: 'mixed')
  if (nativeFlow || message?.buttonsMessage) {
    return {
      tag: 'biz',
      attrs: {},
      content: [
        {
          tag: 'interactive',
          attrs: {
            type: 'native_flow',
            v: '1',
          },
          content: [
            {
              tag: 'native_flow',
              attrs: {
                v: '9',
                name: 'mixed',
              },
            },
          ],
        },
      ],
    };
  }

  if (message?.listMessage) {
    return {
      tag: 'biz',
      attrs: {},
      content: [
        {
          tag: 'list',
          attrs: {
            v: '2',
            type: 'product_list',
          },
        },
      ],
    };
  }

  return {
    tag: 'biz',
    attrs: {},
  };
}

/**
 * Patches message for WhatsApp Multi-Device client rendering if needed
 */
export function patchMessageForMdIfRequired(message: any): any {
  if (!message || typeof message !== 'object') return message;
  if (message.documentWithCaptionMessage?.message) return message;

  const requiresPatch = Boolean(
    message.buttonsMessage || message.listMessage || message.interactiveMessage
  );

  if (requiresPatch) {
    return {
      documentWithCaptionMessage: {
        message: { ...message },
      },
    };
  }
  return message;
}

/**
 * Sends an interactive message with binary additionalNodes injected directly into relayMessage.
 * Grounded on zq_baileys_helper sendInteractiveMessage.
 */
export async function sendInteractiveMessage(
  sock: any,
  jid: string,
  content: any,
  options: any = {}
): Promise<any> {
  if (!sock) {
    throw new Error('ZQ Baileys Helper: Active socket instance is required');
  }

  const userJid = sock.authState?.creds?.me?.id || sock.user?.id;
  const messageId = (typeof generateMessageIDV2 === 'function' ? generateMessageIDV2(userJid) : undefined) || options.messageId;

  const baseOptions = {
    logger: sock.logger,
    userJid,
    messageId,
    timestamp: new Date(),
    ...options,
  };

  const fullMsg = generateWAMessageFromContent(jid, content, baseOptions);

  // Normalize message content to determine required binary nodes
  const normalizedContent = typeof normalizeMessageContent === 'function'
    ? normalizeMessageContent(fullMsg.message)
    : fullMsg.message;

  const buttonType = getButtonType(normalizedContent);
  const additionalNodes = [...(options.additionalNodes || [])];

  if (buttonType) {
    // 1. Inject biz native flow node
    const buttonsNode = getButtonArgs(normalizedContent);
    additionalNodes.push(buttonsNode);

    // 2. Private 1-on-1 chats require a bot node with biz_bot: '1'
    const isPrivate = !isJidGroup(jid);
    if (isPrivate) {
      additionalNodes.push({
        tag: 'bot',
        attrs: { biz_bot: '1' },
      });
    }
  }

  // Patch for Multi-Device if requested
  if (options.mdPatch !== false) {
    const patched = patchMessageForMdIfRequired(fullMsg.message);
    if (patched !== fullMsg.message) {
      fullMsg.message = patched;
    }
  }

  // Directly relay via Baileys socket with binary nodes attached
  await sock.relayMessage(jid, fullMsg.message, {
    messageId: fullMsg.key.id,
    useCachedGroupMetadata: options.useCachedGroupMetadata,
    additionalAttributes: options.additionalAttributes || {},
    statusJidList: options.statusJidList,
    additionalNodes,
    ...(options.ai ? { AI: true } : {}),
  });

  return fullMsg;
}

/**
 * Main public convenience method: sendButtons (matches zq_baileys_helper API)
 */
export async function sendButtons(
  sock: any,
  jid: string,
  data: SendButtonsData,
  options: any = {}
): Promise<any> {
  const { title, subtitle, text = '', footer = '', buttons = [], urls = [], copyCodes = [], sections = [], buttonText } = data;

  const nativeButtons: any[] = buildInteractiveButtons(buttons);

  // Single select list dropdown
  if (sections && sections.length > 0) {
    nativeButtons.push({
      name: 'single_select',
      buttonParamsJson: JSON.stringify({
        title: buttonText || '📋 SELECT AN OPTION',
        sections: sections.map((s) => ({
          title: s.title,
          rows: s.rows.map((r) => ({
            id: r.id,
            title: r.title,
            description: r.description || '',
          })),
        })),
      }),
    });
  }

  // CTA URL buttons
  if (urls && urls.length > 0) {
    for (const u of urls) {
      nativeButtons.push({
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({
          display_text: u.displayText,
          url: u.url,
        }),
      });
    }
  }

  // CTA Copy Code buttons
  if (copyCodes && copyCodes.length > 0) {
    for (const cc of copyCodes) {
      nativeButtons.push({
        name: 'cta_copy',
        buttonParamsJson: JSON.stringify({
          display_text: cc.displayText || `📋 Copy: ${cc.copyCode}`,
          copy_code: cc.copyCode,
        }),
      });
    }
  }

  const interactiveMessage: any = {
    nativeFlowMessage: {
      buttons: nativeButtons,
    },
  };

  if (data.image && typeof sock.waUploadToServer === 'function') {
    try {
      const { prepareWAMessageMedia } = await import('@whiskeysockets/baileys');
      let mediaInput: any = null;
      if (Buffer.isBuffer(data.image)) {
        mediaInput = { image: data.image };
      } else if (typeof data.image === 'string') {
        if (data.image.startsWith('http://') || data.image.startsWith('https://')) {
          mediaInput = { image: { url: data.image } };
        } else if (fs.existsSync(data.image)) {
          mediaInput = { image: fs.readFileSync(data.image) };
        }
      } else if (typeof data.image === 'object' && (data.image as any).url) {
        mediaInput = { image: { url: (data.image as any).url } };
      }

      if (mediaInput) {
        const media = await prepareWAMessageMedia(mediaInput, { upload: sock.waUploadToServer });
        if (media?.imageMessage) {
          interactiveMessage.header = {
            title: title || subtitle || '',
            hasMediaAttachment: true,
            imageMessage: media.imageMessage,
          };
        }
      }
    } catch (mediaErr) {
      console.warn('[zq_baileys_helper] Notice while attaching image to header:', mediaErr);
    }
  }

  if (!interactiveMessage.header && (title || subtitle)) {
    interactiveMessage.header = {
      title: title || subtitle,
      hasMediaAttachment: false,
    };
  }

  if (text) {
    interactiveMessage.body = { text };
  }

  if (footer) {
    interactiveMessage.footer = { text: footer };
  }

  const payload = {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage,
      },
    },
  };

  return sendInteractiveMessage(sock, jid, payload, options);
}

/**
 * Public convenience method: sendListMessage (matches zq_baileys_helper API)
 */
export async function sendListMessage(
  sock: any,
  jid: string,
  data: {
    title?: string;
    text: string;
    buttonText: string;
    sections: ListSection[];
    footer?: string;
  },
  options: any = {}
): Promise<any> {
  const content = {
    listMessage: {
      title: data.title,
      description: data.text,
      buttonText: data.buttonText,
      listType: 1,
      sections: data.sections,
      footerText: data.footer,
    },
  };

  return sendInteractiveMessage(sock, jid, content, options);
}

export interface CardItem {
  id?: string;
  title?: string;
  body?: string;
  buttons?: ButtonItem[];
}

export interface SendCardsData {
  text?: string;
  footer?: string;
  cards: CardItem[];
  headerImage?: Buffer | string;
  headerImageUrl?: string;
  headerVideo?: Buffer | string;
  headerVideoUrl?: string;
  mediaCaption?: string;
}

/**
 * Public convenience method: sendCards (matches zq_baileys_helper API)
 * Supports multi-card carousel with optional header media and interactive buttons.
 */
export async function sendCards(
  sock: any,
  jid: string,
  data: SendCardsData,
  options: any = {}
): Promise<any> {
  if (!sock) {
    throw new Error('ZQ Baileys Helper: Active socket instance is required for sendCards');
  }

  const {
    text = '',
    footer = '',
    cards = [],
    headerImageUrl,
    headerVideoUrl,
    headerImage,
    headerVideo,
    mediaCaption,
  } = data;

  if (!Array.isArray(cards) || cards.length === 0) {
    throw new Error('ZQ Baileys Helper: cards must be a non-empty array');
  }

  // 1. Send optional header media if provided
  try {
    const caption = mediaCaption != null ? mediaCaption : text || '';
    if (sock.sendMessage && (headerImageUrl || headerImage)) {
      const imgPayload = headerImage
        ? (Buffer.isBuffer(headerImage) ? headerImage : fs.existsSync(headerImage) ? fs.readFileSync(headerImage) : { url: headerImage })
        : { url: headerImageUrl };
      await sock.sendMessage(jid, { image: imgPayload, caption }, options);
    } else if (sock.sendMessage && (headerVideoUrl || headerVideo)) {
      const vidPayload = headerVideo
        ? (Buffer.isBuffer(headerVideo) ? headerVideo : fs.existsSync(headerVideo) ? fs.readFileSync(headerVideo) : { url: headerVideo })
        : { url: headerVideoUrl };
      await sock.sendMessage(jid, { video: vidPayload, caption }, options);
    }
  } catch (mediaErr: any) {
    console.warn('[zq_baileys_helper] sendCards header media notice:', mediaErr?.message || mediaErr);
  }

  // 2. Build button representations for the cards
  const buttons: ButtonItem[] = cards.map((c, i) => ({
    id: c.id || `card_${i + 1}`,
    displayText: c.title || c.body || `Card ${i + 1}`,
  }));

  const nativeButtons = buildInteractiveButtons(buttons);
  const contentText = (headerImageUrl || headerImage || headerVideoUrl || headerVideo) && mediaCaption != null ? '' : text;

  // Use nativeFlowMessage for multi-device support
  const interactiveMessage: any = {
    body: { text: contentText || 'Select an option:' },
    footer: footer ? { text: footer } : undefined,
    nativeFlowMessage: {
      buttons: nativeButtons,
    },
  };

  const payload = {
    viewOnceMessage: {
      message: {
        messageContextInfo: { deviceListMetadata: {}, deviceListMetadataVersion: 2 },
        interactiveMessage,
      },
    },
  };

  return sendInteractiveMessage(sock, jid, payload, options);
}

/**
 * Public convenience method: sendTemplateButtons
 */
export async function sendTemplateButtons(
  sock: any,
  jid: string,
  data: { text: string; footer?: string; buttons: ButtonItem[] },
  options: any = {}
): Promise<any> {
  return sendButtons(
    sock,
    jid,
    {
      text: data.text,
      footer: data.footer,
      buttons: data.buttons,
    },
    options
  );
}
