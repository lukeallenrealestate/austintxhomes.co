# Austin TX Homes — IDX Search Setup

## Step 1: Fill in your credentials

Edit the `.env` file:

```
MLSGRID_ACCESS_TOKEN=    ← your MLS GRID API token
MLSGRID_ORIGINATING_SYSTEM=actris
GOOGLE_MAPS_API_KEY=     ← your Google Maps API key
JWT_SECRET=              ← any long random string (e.g. 64 random chars)
ADMIN_EMAIL=             ← YOUR email address (this account gets admin access)
PORT=3000
```

## Step 2: Install dependencies

```bash
npm install
```

## Step 3: Start the server

```bash
npm start
```

On first boot it will automatically start syncing all ACTRIS listings into the local database.
This initial sync takes 20-60 minutes depending on how many listings ACTRIS has.
The server is usable while syncing — it shows what's already been loaded.

After that, it syncs every 15 minutes automatically to pick up new/changed listings.

## Step 4: Create your admin account

1. Go to your site and click **Sign Up**
2. Use the email you set as `ADMIN_EMAIL` in your `.env`
3. You'll automatically get admin access
4. Visit `/admin.html` to see your dashboard

## Google Maps Setup

In Google Cloud Console, make sure your API key has these APIs enabled:
- Maps JavaScript API
- Places API (for autocomplete)
- Drawing Library (included in Maps JS)
- Geometry Library (included in Maps JS)

Also add your domain to the **HTTP referrers** restriction for security.

## File Structure

```
idx-search/
├── server.js           Main Express server
├── db/database.js      SQLite database setup
├── sync/mlsSync.js     MLS GRID sync service
├── routes/
│   ├── properties.js   Property search API
│   ├── auth.js         User auth (register/login)
│   ├── favorites.js    Saved homes
│   ├── searches.js     Saved searches
│   └── admin.js        Admin dashboard API
└── public/
    ├── index.html      Main search page (list + map view)
    ├── property.html   Property detail page
    ├── account.html    User account / favorites
    └── admin.html      Realtor admin dashboard
```

## Features

- **List view**: Grid of property cards with photos, price, beds/baths/sqft
- **Map view**: Interactive Google Map with price pins, sidebar card list
- **Draw-to-search**: Draw a polygon on the map to search within that area
- **All filters**: Price, beds, baths, sqft, year built, property type, school district, pool, waterfront, new construction
- **For sale / For rent** toggle
- **Sort**: Price, newest, oldest, beds, sqft, days on market
- **Location search**: City, ZIP, neighborhood, or school district with autocomplete
- **User accounts**: Register, login, save homes (♥), save searches
- **Admin dashboard**: See all users, their favorites, their saved searches, sync status
