# LINE Messaging API & Official Account Setup

## Overview
Yoonie supports two complementary LINE channels:
1. **LINE Login Channel**: Allows staff and guests to authenticate via LINE OAuth.
2. **LINE Messaging API Channel (Official Account)**: Delivers push notifications and interactive task cards to staff and guests.

## Critical Requirement: Shared Provider
> **IMPORTANT**:
> You **MUST** create both the **LINE Login Channel** and the **Messaging API Channel** under the **SAME LINE Developer Provider**.
>
> In LINE's architecture, user identifiers (`userId`, starting with `U...`) are scoped to a Provider. If the channels belong to different providers, the user ID returned during LINE Login will NOT match the recipient ID required for Messaging API push notifications.

## Configuration Steps

1. Log into the [LINE Developers Console](https://developers.line.biz/console/).
2. Select your Organization/Provider (or create one, e.g. `Yoonie Hospitality`).
3. Under this Provider, ensure:
   - Channel 1: **LINE Login**
   - Channel 2: **Messaging API**
4. In the **Messaging API** channel:
   - Issue a **Long-lived Channel Access Token** under the *Messaging API* tab.
   - Copy the **Channel Secret** under the *Basic settings* tab.
   - Set the Webhook URL to: `https://<your-backend-host>/api/staff/line/webhook`.
   - Enable "Use Webhook".
5. Set environment variables in your `.env`:
   ```bash
   LINE_CHANNEL_ACCESS_TOKEN=your-long-lived-channel-access-token
   LINE_MESSAGING_CHANNEL_SECRET=your-messaging-api-channel-secret
   ```

## Staff Account Linking Workflow

1. A staff member calls `POST /api/staff/line/link-token` from the mobile app.
2. The server generates a temporary 6-character code (10-minute expiry) and stores its SHA-256 hash.
3. The staff member opens Yoonie's LINE Official Account and sends the 6-character code in chat.
4. The LINE platform delivers the webhook payload to `POST /api/staff/line/webhook`.
5. The backend verifies `x-line-signature` using HMAC-SHA256 with `LINE_MESSAGING_CHANNEL_SECRET`.
6. Upon matching the code, the user's `lineUserId` is recorded in MongoDB and future operational push notifications are delivered directly to their LINE app.
