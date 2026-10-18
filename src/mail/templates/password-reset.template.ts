export function passwordResetEmailContent(
  displayName: string,
  resetUrl: string,
): string {
  return `
    <h2 style="margin:0 0 16px;color:#18181b;font-size:20px;font-weight:600;letter-spacing:-0.3px;">
      Reset your password
    </h2>
    <p style="margin:0 0 8px;color:#52525b;font-size:15px;line-height:1.6;">
      Hi <strong style="color:#18181b;">${displayName}</strong>,
    </p>
    <p style="margin:0 0 28px;color:#52525b;font-size:15px;line-height:1.6;">
      Click the button below to reset your password. This link expires in
      <strong style="color:#18181b;">1 hour</strong>.
    </p>

    <p style="margin:0 0 28px;">
      <a
        href="${resetUrl}"
        style="display:inline-block;background-color:#18181b;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:8px;font-weight:600;font-size:15px;"
      >
        Reset password
      </a>
    </p>

    <p style="margin:0 0 8px;color:#71717a;font-size:13px;line-height:1.6;">
      Or copy this link:
    </p>
    <p style="margin:0;color:#18181b;font-size:13px;line-height:1.6;">
      <a href="${resetUrl}" style="color:#18181b;word-break:break-all;">${resetUrl}</a>
    </p>
  `.trim();
}
