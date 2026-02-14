# Sri Krishna Aarti API

## Endpoints

### GET `/api/srikrishna-aarti/gallery`

Returns the complete gallery data including promo banner, hero sections, and categories with their images.

**Response Format:**

```json
{
  "promoBanner": {
    "isVisible": true,
    "title": "Holi Mahotsav 2026 🎨",
    "subtitle": "Celebrate the colors of divine love with Radha Krishna!",
    "actionText": "View Collection",
    "daysLeft": 2,
    "targetUrl": "https://play.google.com/store/apps/details?id=com.shrikrishna.daily.puja.aarti",
    "colors": ["#ff9966", "#ff5e62"]
  },
  "heroSections": [...],
  "categories": [...]
}
```

---

## POST Endpoints

### POST `/api/srikrishna-aarti/promo-banner`

Create a new promotional banner.

**Request Body:**
```json
{
  "isVisible": true,
  "title": "Holi Mahotsav 2026 🎨",
  "subtitle": "Celebrate the colors of divine love with Radha Krishna!",
  "actionText": "View Collection",
  "daysLeft": 2,
  "targetUrl": "https://play.google.com/store/apps/details?id=com.shrikrishna.daily.puja.aarti",
  "colors": ["#ff9966", "#ff5e62"]
}
```

### POST `/api/srikrishna-aarti/category`

Create a new category.

**Request Body:**
```json
{
  "title": "Nanha Kanhiya",
  "slug": "nanha-kanhiya",
  "thumbnailUrl": "https://krishna-wallpapers-bucket.s3.amazonaws.com/categories/thumb_nanha.jpg",
  "isActive": true,
  "order": 1
}
```

### POST `/api/srikrishna-aarti/hero-section`

Create a new hero section.

**Request Body:**
```json
{
  "title": "Holi Special",
  "slug": "holi-special",
  "isActive": true,
  "order": 1,
  "imageIds": []
}
```

### POST `/api/srikrishna-aarti/image`

Create a new image.

**Request Body:**
```json
{
  "imageUrl": "https://krishna-wallpapers-bucket.s3.amazonaws.com/holi/radha_krishna_holi_1.jpg",
  "shares": 1200,
  "downloads": 5400,
  "globalIndex": 0,
  "categories": ["<category_id>"],
  "isTrending": false,
  "isHero": true,
  "heroSection": "<hero_section_id>"
}
```

**Note:** Store shares and downloads as numbers (1200, not "1.2k"). The API will format them automatically.

---

## Notes

- Numbers are automatically formatted in GET responses (1200 → "1.2k")
- Only active promo banners, hero sections, and categories are returned in GET
- Images are sorted by globalIndex within each category
- Hero sections and categories are sorted by order field
