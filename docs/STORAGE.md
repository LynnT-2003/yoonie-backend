# Cloudflare R2 Media Storage Guide

This document describes how media storage and image uploads work across `yoonie-backend` and `yoonie-frontend` using Cloudflare R2 (S3-compatible object storage).

---

## 1. What You Need in `.env`

Add these 5 environment variables to your `.env` file (see [`.env.example`](../.env.example)):

```env
CLOUDFLARE_R2_ACCOUNT_ID="your-cloudflare-account-id"
CLOUDFLARE_R2_ACCESS_KEY_ID="your-r2-access-key-id"
CLOUDFLARE_R2_SECRET_ACCESS_KEY="your-r2-secret-access-key"
CLOUDFLARE_R2_BUCKET_NAME="yoonie-media"
CLOUDFLARE_R2_PUBLIC_URL="https://images.yoonie.si"
```

### Where to get these values in Cloudflare Dashboard:
1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. On the right-hand sidebar, copy your **Account ID** $\rightarrow$ `CLOUDFLARE_R2_ACCOUNT_ID`.
3. In the left navigation, click **R2 Storage** $\rightarrow$ **Create Bucket**:
   * Bucket Name: `yoonie-media` (or your chosen name) $\rightarrow$ `CLOUDFLARE_R2_BUCKET_NAME`.
4. Under **R2** $\rightarrow$ **Manage R2 API Tokens** $\rightarrow$ **Create API Token**:
   * Permissions: **Object Read & Write**.
   * Copy the **Access Key ID** $\rightarrow$ `CLOUDFLARE_R2_ACCESS_KEY_ID`.
   * Copy the **Secret Access Key** $\rightarrow$ `CLOUDFLARE_R2_SECRET_ACCESS_KEY`.
5. Under your Bucket settings $\rightarrow$ **Public Access**:
   * Enable a **Custom Domain** (e.g. `images.yoonie.si`) or enable the free **R2.dev subdomain** (e.g. `https://pub-xxx.r2.dev`) $\rightarrow$ `CLOUDFLARE_R2_PUBLIC_URL`.

---

## 2. Upload Architecture: Presigned URL Flow

To keep the NestJS backend lightweight and fast, image binaries are **NOT** routed through the API server. Instead, we use direct browser-to-R2 presigned streaming:

1. **Step 1 (Frontend)**: Calls `POST /api/storage/presigned-url` with `{ filename, contentType, folder }`.
2. **Step 2 (Backend)**: Generates a temporary signed S3 `PUT` URL valid for 15 minutes.
3. **Step 3 (Browser)**: Directly streams the binary image payload to the `uploadUrl` on Cloudflare R2 via HTTP `PUT`.
4. **Step 4 (Frontend)**: Updates the target entity (Room, Restaurant, Service, or Branch) with the resulting `publicUrl`.

---

## 3. Storage Endpoints

### 3.1 Get Presigned Upload URL (Recommended for Frontend)

* **Route**: `POST /api/storage/presigned-url`
* **Content-Type**: `application/json`

#### Request Payload:
```json
{
  "filename": "deluxe-balcony-view.webp",
  "contentType": "image/webp",
  "folder": "rooms"
}
```

* Supported `contentType` formats: `image/jpeg`, `image/png`, `image/webp`, `image/avif`, `image/gif`, `image/svg+xml`.
* Supported `folder` values: `rooms`, `restaurants`, `services`, `branches`, `avatars`.

#### Response (`201 Created`):
```json
{
  "success": true,
  "statusCode": 201,
  "data": {
    "uploadUrl": "https://<account_id>.r2.cloudflarestorage.com/yoonie-media/rooms/1729267200000-a1b2c3d4.webp?X-Amz-Algorithm=...",
    "key": "rooms/1729267200000-a1b2c3d4.webp",
    "publicUrl": "https://images.yoonie.si/rooms/1729267200000-a1b2c3d4.webp",
    "expiresInSeconds": 900
  }
}
```

---

### 3.2 Direct Multipart Upload (Server Fallback)

* **Route**: `POST /api/storage/upload?folder=rooms`
* **Content-Type**: `multipart/form-data`
* **File limit**: 10 MB maximum.

#### Request:
```bash
curl -X POST 'http://localhost:8080/api/storage/upload?folder=rooms' \
  -F 'file=@/path/to/my-photo.jpg'
```

#### Response (`201 Created`):
```json
{
  "success": true,
  "statusCode": 201,
  "data": {
    "key": "rooms/1729267200000-a1b2c3d4.jpg",
    "url": "https://images.yoonie.si/rooms/1729267200000-a1b2c3d4.jpg",
    "contentType": "image/jpeg",
    "sizeBytes": 1048576
  }
}
```

---

### 3.3 Delete an Object

* **Route**: `DELETE /api/storage?key=rooms/1729267200000-a1b2c3d4.jpg`

#### Request:
```bash
curl -X DELETE 'http://localhost:8080/api/storage?key=rooms/1729267200000-a1b2c3d4.jpg'
```

#### Response (`200 OK`):
```json
{
  "success": true,
  "statusCode": 200,
  "data": {
    "success": true,
    "key": "rooms/1729267200000-a1b2c3d4.jpg"
  }
}
```

---

## 4. Frontend Integration Example (TypeScript / Next.js)

Here is a ready-to-use helper function for `yoonie-frontend` to upload files directly to Cloudflare R2:

```typescript
export async function uploadImageToR2(
  file: File,
  folder: "rooms" | "restaurants" | "services" | "branches" = "rooms",
): Promise<string> {
  // 1. Request presigned URL from backend
  const presignedRes = await fetch("http://localhost:8080/api/storage/presigned-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
      folder,
    }),
  });

  const { data } = await presignedRes.json();
  const { uploadUrl, publicUrl } = data;

  // 2. Stream binary directly to Cloudflare R2
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });

  if (!uploadRes.ok) {
    throw new Error(`Failed to upload to Cloudflare R2: ${uploadRes.statusText}`);
  }

  // 3. Return the public CDN URL to save on your Room or Service model
  return publicUrl;
}
```

---

## 5. Entity Schema Mapping

The following models support image storage:

| Model | Image Fields | Description |
| :--- | :--- | :--- |
| **`Branch`** | `logoUrl`, `heroImageUrl`, `images[]` | Property logo, hero banner, and property overview gallery |
| **`Room`** | `coverImage`, `images[]` | Room thumbnail and high-resolution room gallery for direct booking |
| **`Restaurant`** | `coverImage`, `images[]` | Outlet atmosphere photo and dining gallery |
| **`Service`** | `coverImage`, `images[]` | Tour/excursion boat photos, spa rooms, and transfer vehicle images |
| **`User`** | `avatar` | Profile photo for staff and guests |

---

## 6. One-Call Endpoints Reference

Every domain collection in Yoonie supports **1-call operations** for creating entities with images attached, adding images to existing entities, and removing images. Both `application/json` (with image URLs) and `multipart/form-data` (with binary file uploads) are supported.

### 6.1 Rooms (`/api/rooms`)
* **Create with Images (1 call)**: `POST /api/rooms`
  * Form fields: `branchId`, `roomNumber`, `floor`, `roomType`, `maxOccupancy`, `baseRateThb`, `amenities`
  * File fields: `coverImage` (single file), `images` (up to 10 files)
* **Upload & Attach Photos (1 call)**: `POST /api/rooms/:id/images?isCover=false`
  * File field: `images` (up to 10 files)
* **Remove Photo**: `DELETE /api/rooms/:id/images?imageUrl=...`

### 6.2 Restaurants & Venues (`/api/restaurants`)
* **Create with Images (1 call)**: `POST /api/restaurants`
  * Form fields: `branchId`, `code`, `name`, `cuisine`, `description`, `tables`, `shifts`
  * File fields: `coverImage` (single file), `images` (up to 10 files)
* **Upload & Attach Photos (1 call)**: `POST /api/restaurants/:id/images?isCover=false`
  * File field: `images` (up to 10 files)
* **Remove Photo**: `DELETE /api/restaurants/:id/images?imageUrl=...`

### 6.3 Services, Tours & Spas (`/api/services`)
* **Create with Images (1 call)**: `POST /api/services`
  * Form fields: `branchId`, `code`, `category`, `kind`, `name`, `description`, `basePriceThb`, `pricingModel`, `tour`, `wellness`, `transfer`
  * File fields: `coverImage` (single file), `images` (up to 10 files)
* **Upload & Attach Photos (1 call)**: `POST /api/services/:id/images?isCover=false`
  * File field: `images` (up to 10 files)
* **Remove Photo**: `DELETE /api/services/:id/images?imageUrl=...`

### 6.4 Branches & Hotel Properties (`/api/branches`)
* **Create with Logo & Images (1 call)**: `POST /api/branches`
  * Form fields: `code`, `name`, `timezone`, `currency`, `contactPhoneE164`, `contactEmail`
  * File fields: `logo` (single file), `heroImage` (single file), `images` (up to 10 files)
* **Upload & Attach Photos (1 call)**: `POST /api/branches/:idOrCode/images?isHero=false`
  * File field: `images` (up to 10 files)
* **Upload Brand Logo (1 call)**: `POST /api/branches/:idOrCode/logo`
  * File field: `file` (single image)
* **Remove Photo**: `DELETE /api/branches/:idOrCode/images?imageUrl=...`

### 6.5 User Profile Avatar (`/api/users`)
* **Update Avatar (1 call)**: `POST /api/users/me/avatar`
  * File field: `file` (single image)
* **Update Profile with Avatar (1 call)**: `PATCH /api/users/me`
  * Form field: `displayName`
  * File field: `avatar` (single image)
