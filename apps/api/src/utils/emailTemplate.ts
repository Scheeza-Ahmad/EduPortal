// Shared HTML wrapper so every automated email looks like it came from the
// same product — dark branded header, white body, hairline section borders,
// system font stack, single-column layout (mobile responsive by default
// since nothing is fixed-width beyond the 600px outer table).

const SYSTEM_FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function emailLayout(params: {
  title: string;
  bodyHtml: string;
  footerText?: string;
}): string {
  const { title, bodyHtml, footerText = 'This is an automated message from EduPortal' } = params;

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f4;font-family:${SYSTEM_FONT};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e5e5;">
            <tr>
              <td style="background:#0b0b0b;padding:24px 32px;">
                <span style="color:#ffffff;font-size:20px;font-weight:700;font-family:${SYSTEM_FONT};">EduPortal</span>
                <div style="color:#c3c2b7;font-size:13px;margin-top:4px;font-family:${SYSTEM_FONT};">${title}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;font-family:${SYSTEM_FONT};color:#0b0b0b;">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px;background:#f9f9f7;border-top:1px solid #e5e5e5;">
                <p style="margin:0;font-size:12px;color:#898781;font-family:${SYSTEM_FONT};">${footerText}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function emailSection(title: string, innerHtml: string): string {
  return `<div style="margin-bottom:20px;border:1px solid #e1e0d9;border-radius:6px;padding:16px;">
    <h3 style="margin:0 0 10px;font-size:14px;color:#0b0b0b;">${title}</h3>
    ${innerHtml}
  </div>`;
}

export function emailStat(label: string, value: string | number): string {
  return `<p style="margin:4px 0;font-size:13px;color:#52514e;"><strong style="color:#0b0b0b;">${label}:</strong> ${value}</p>`;
}

export function emailBadge(text: string, color: string): string {
  return `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:${color};color:#ffffff;font-size:12px;font-weight:600;">${text}</span>`;
}

export function emailList(items: string[]): string {
  if (items.length === 0) return '<p style="margin:4px 0;font-size:13px;color:#898781;">None</p>';
  return `<ul style="margin:4px 0;padding-left:18px;font-size:13px;color:#52514e;">${items
    .map((i) => `<li style="margin:2px 0;">${i}</li>`)
    .join('')}</ul>`;
}
