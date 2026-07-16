# Fashion Try-On Frontend

A modern Next.js 16 web application for virtual fashion try-on using AI.

## Features

- 🎨 Beautiful, responsive UI with Tailwind CSS
- 🌓 Dark mode support
- 📱 Mobile-friendly design
- 🖼️ Drag-and-drop image uploads
- ⚡ Fast API integration
- 📥 Download results
- 🎯 Three garment categories: tops, bottoms, and one-pieces

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Icons**: Lucide React
- **Package Manager**: pnpm

## Getting Started

### Prerequisites

- Node.js 20+ 
- pnpm (or npm/yarn)
- Backend API running (see `../backend/README.md`)

### Installation

```bash
# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env.local

# Update .env.local with your backend API URL (default: http://localhost:8000)
```

### Development

```bash
# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
# Build the application
pnpm build

# Start production server
pnpm start
```

## Project Structure

```
frontend/
├── src/
│   ├── app/              # Next.js app router pages
│   │   ├── page.tsx      # Homepage
│   │   ├── upload/       # Upload page
│   │   └── result/       # Result comparison page
│   ├── components/       # Reusable components
│   │   ├── Navbar.tsx
│   │   └── ImageUpload.tsx
│   ├── lib/              # Utility functions
│   │   └── api.ts        # API client
│   └── types/            # TypeScript types
│       └── index.ts
├── public/               # Static assets
└── package.json
```

## Environment Variables

Create a `.env.local` file with the following variables:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Pages

### Homepage (`/`)
- Explains how the virtual try-on works
- Features and benefits
- Call-to-action buttons

### Upload Page (`/upload`)
- Upload person image
- Upload garment image
- Select garment category (tops, bottoms, one-pieces)
- Submit for processing

### Result Page (`/result`)
- Side-by-side comparison of original, garment, and result
- Download button for the result image
- Try another button to start over

## API Integration

The frontend communicates with the backend API using the following endpoint:

**POST** `/try-on`
- Accepts: `person_image`, `garment_image`, `category`
- Returns: Result image (PNG)

See `src/lib/api.ts` for implementation details.

## Customization

### Styling

The app uses Tailwind CSS v4. Customize the theme in `src/app/globals.css`:

```css
:root {
  --background: #ffffff;
  --foreground: #171717;
}
```

### API URL

Update the `NEXT_PUBLIC_API_URL` in `.env.local` to point to your backend API.

## Development Tips

1. **Image Previews**: The `ImageUpload` component handles drag-and-drop and shows previews
2. **Session Storage**: Results are temporarily stored in `sessionStorage` for the result page
3. **Error Handling**: API errors are displayed to users with helpful messages
4. **Loading States**: UI shows loading indicators during API calls

## Deployment

### Vercel (Recommended)

1. Push your code to GitHub
2. Import project in Vercel
3. Add environment variable `NEXT_PUBLIC_API_URL` pointing to your production backend
4. Deploy

### Docker

```dockerfile
FROM node:20-alpine AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Build application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm install -g pnpm && pnpm build

# Production image
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
```

## Troubleshooting

### Images not uploading
- Check file size (max 10MB recommended)
- Verify file format (PNG, JPG, WEBP only)
- Check browser console for errors

### API connection failed
- Ensure backend is running on the correct port
- Verify `NEXT_PUBLIC_API_URL` in `.env.local`
- Check CORS settings in backend

### Build errors
- Clear `.next` folder: `rm -rf .next`
- Delete `node_modules` and reinstall: `rm -rf node_modules && pnpm install`
- Check TypeScript errors: `pnpm lint`

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request

## License

See the main project LICENSE file.
