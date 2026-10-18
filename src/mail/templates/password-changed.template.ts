export function passwordChangedEmailContent(displayName: string): string {
  return `
    <h2 style="margin:0 0 16px;color:#18181b;font-size:20px;font-weight:600;letter-spacing:-0.3px;">
      Your password was changed
    </h2>
    <p style="margin:0 0 8px;color:#52525b;font-size:15px;line-height:1.6;">
      Hi <strong style="color:#18181b;">${displayName}</strong>,
    </p>
    <p style="margin:0;color:#52525b;font-size:15px;line-height:1.6;">
      Your account password was changed successfully. If you did not make this change,
      reset your password immediately and contact support.
    </p>
  `.trim();
}
