# QuickLink - URL Shortener

A modern, full-featured URL shortening service built with Next.js, TypeScript, and Tailwind CSS. Similar to Bitly, QuickLink provides URL shortening, click tracking, analytics, and a beautiful web interface.

## ✨ Features

- **URL Shortening**: Transform long URLs into short, memorable links
- **Custom Short Codes**: Create custom short codes for your links
- **Click Tracking**: Real-time click counting and analytics
- **Analytics Dashboard**: Detailed analytics including:
  - Clicks over time
  - Geographic data
  - Referrer tracking
  - Recent click history
- **Modern UI**: Beautiful, responsive design with Tailwind CSS
- **TypeScript**: Full type safety throughout the application
- **Database**: SQLite database with Prisma ORM
- **Fast Redirects**: Lightning-fast URL redirections

## 🚀 Tech Stack

- **Framework**: Next.js 15 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Database**: SQLite with Prisma ORM
- **UI Components**: Lucide React icons
- **Notifications**: React Hot Toast
- **Deployment**: Vercel-ready

## 📋 Prerequisites

- Node.js 18+ 
- npm, yarn, pnpm, or bun

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd urlshort
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up the database**
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. **Configure environment variables**
   
   The `.env` file is already configured with:
   ```env
   DATABASE_URL="file:./dev.db"
   NEXT_PUBLIC_BASE_URL="http://localhost:3000"
   JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
   ```

5. **Start the development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   
   Navigate to [http://localhost:3000](http://localhost:3000)

## 🎯 Usage

### Shortening URLs

1. Enter a long URL in the input field
2. Optionally provide a custom short code
3. Click "Shorten" to generate your short link
4. Copy and share your shortened URL

### Viewing Analytics

1. After creating a short URL, click on it to view analytics
2. Or navigate to `/analytics/[shortCode]` directly
3. View detailed statistics including clicks, geographic data, and referrers

## 📁 Project Structure

```
urlshort/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── dev.db                 # SQLite database
├── src/
│   ├── app/
│   │   ├── [shortCode]/       # Dynamic route for redirects
│   │   ├── analytics/         # Analytics pages
│   │   ├── api/               # API routes
│   │   │   ├── shorten/       # URL shortening endpoint
│   │   │   └── analytics/     # Analytics endpoint
│   │   ├── globals.css        # Global styles
│   │   ├── layout.tsx         # Root layout
│   │   └── page.tsx           # Homepage
│   └── lib/
│       ├── prisma.ts          # Prisma client
│       └── utils.ts           # Utility functions
├── .env                       # Environment variables
└── package.json
```

## 🔌 API Endpoints

### POST `/api/shorten`
Create a new shortened URL

**Request Body:**
```json
{
  "url": "https://example.com/very/long/url",
  "customCode": "optional-custom-code"
}
```

**Response:**
```json
{
  "id": "url-id",
  "originalUrl": "https://example.com/very/long/url",
  "shortCode": "abc123",
  "shortUrl": "http://localhost:3000/abc123",
  "title": "Page Title",
  "clicks": 0,
  "createdAt": "2025-05-23T..."
}
```

### GET `/api/analytics/[shortCode]`
Get analytics data for a shortened URL

**Response:**
```json
{
  "url": {
    "id": "url-id",
    "originalUrl": "https://example.com",
    "shortCode": "abc123",
    "title": "Page Title",
    "clicks": 42,
    "createdAt": "2025-05-23T..."
  },
  "analytics": {
    "totalClicks": 42,
    "clicksByDate": {...},
    "clicksByCountry": {...},
    "clicksByReferrer": {...},
    "recentClicks": [...]
  }
}
```

## 🚀 Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Connect your repository to Vercel
3. Set environment variables in Vercel dashboard:
   - `DATABASE_URL` (for production database)
   - `NEXT_PUBLIC_BASE_URL` (your domain)
   - `JWT_SECRET` (secure random string)
4. Deploy!

### Other Platforms

This Next.js application can be deployed to any platform that supports Node.js, including:
- Netlify
- Railway
- Heroku
- DigitalOcean App Platform

## 🔧 Configuration

### Database

For production, consider upgrading from SQLite to PostgreSQL:

1. Update `prisma/schema.prisma`:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

2. Update your `DATABASE_URL` environment variable

3. Run migrations:
   ```bash
   npx prisma migrate dev
   ```

### Custom Domain

Update `NEXT_PUBLIC_BASE_URL` in your environment variables to match your custom domain.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📝 License

This project is open source and available under the [MIT License](LICENSE).

## 🙏 Acknowledgments

- [Next.js](https://nextjs.org/) - The React framework
- [Tailwind CSS](https://tailwindcss.com/) - For styling
- [Prisma](https://prisma.io/) - Database ORM
- [Lucide](https://lucide.dev/) - Beautiful icons

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
