# Deployment Guide

## Quick Deploy to Netlify

### Option 1: Drag & Drop (Fastest)
1. Run `npm run build` locally
2. Go to [netlify.com](https://netlify.com)
3. Drag the `dist` folder to Netlify
4. Set environment variable: `VITE_GOOGLE_MAPS_API_KEY`

### Option 2: Git Integration (Recommended)
1. Push code to GitHub
2. Connect Netlify to your GitHub repository
3. Build settings:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Set environment variables in Netlify dashboard

## Environment Variables
Set this in your Netlify dashboard (Site settings > Environment variables):
- `VITE_GOOGLE_MAPS_API_KEY` = your Google Maps API key

## Cost Protection Features
- Routes limited to 50km maximum
- Warning message about API costs
- Users are notified about potential charges

## Adding Password Protection
1. Go to Site settings > Access control
2. Enable "Password protection"
3. Set a password for the site

## Google Maps API Setup
1. Enable these APIs in Google Cloud Console:
   - Maps JavaScript API
   - Places API  
   - Directions API
   - Street View Static API
2. Set API key restrictions:
   - HTTP referrers: `*.netlify.app/*`, `yourdomain.com/*`
   - Daily quotas recommended for cost control

## Domain Restrictions
In Google Cloud Console, restrict your API key to:
- `*.netlify.app/*` (if using Netlify subdomain)
- Your custom domain if you have one

This prevents unauthorized usage of your API key.