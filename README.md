# Street View Directions Video

A React application that generates street view videos from Google Maps directions. Users can select start and end locations and view the route as a controllable video-like experience using street view images.

## Features

- 🗺️ Interactive location selection with Google Maps autocomplete
- 🛣️ Route calculation using Google Directions API
- 📹 Street view video generation with smooth transitions
- ▶️ Video-like controls (play/pause, speed control, seek bar)
- 📱 Responsive design for desktop and mobile

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Get Google Maps API Key:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create a new project or select existing one
   - Enable the following APIs:
     - Maps JavaScript API
     - Places API
     - Directions API
     - Street View Static API
   - Create credentials (API key)
   - Restrict the API key to your domain for security

3. **Configure environment variables:**
   
   **Option 1: Using .env file (for development)**
   ```bash
   # Edit the .env file and add your API key
   echo "VITE_GOOGLE_MAPS_API_KEY=your_actual_api_key_here" > .env
   ```
   
   **Option 2: Using system environment variables (recommended for production)**
   ```bash
   # Linux/Mac
   export VITE_GOOGLE_MAPS_API_KEY=your_actual_api_key_here
   npm run dev
   
   # Windows
   set VITE_GOOGLE_MAPS_API_KEY=your_actual_api_key_here
   npm run dev
   ```

   **⚠️ Security Note:** 
   - Never commit your `.env` file to version control
   - The `.env` file is already added to `.gitignore`
   - For production deployments, use your platform's environment variable settings

4. **Run the development server:**
   ```bash
   npm run dev
   ```

5. **Open your browser:**
   Navigate to `http://localhost:3000`

## Usage

1. **Select Locations:** Use the location picker to select start and end points
2. **Generate Video:** Click "Generate Street View Video" to create the route
3. **Watch:** Use the video controls to play, pause, and navigate through the street view journey

## Google Maps API Pricing

Be aware of Google Maps API costs:
- Street View Static API: ~$0.007 per image
- Directions API: ~$0.005 per request
- Places API: ~$0.032 per request

The app generates multiple street view images based on route length, so costs can add up for long routes.

## Technical Details

- **Frontend:** React 18 with TypeScript
- **Build Tool:** Vite
- **APIs:** Google Maps JavaScript API, Directions API, Street View Static API
- **Styling:** CSS3 with responsive design

## Project Structure

```
src/
├── components/          # React components
│   ├── LocationPicker.tsx
│   └── StreetViewPlayer.tsx
├── hooks/              # Custom React hooks
│   └── useGoogleMaps.ts
├── services/           # API services
│   └── googleMaps.ts
├── types/              # TypeScript type definitions
│   └── index.ts
├── App.tsx             # Main app component
├── App.css             # Global styles
└── main.tsx           # React entry point
```

## Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory, ready for deployment.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.