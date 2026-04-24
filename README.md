# Geo-Fenced Attendance System - Backend

This is the backend server for the Geo-Fenced Attendance System, built with Node.js, Express, and TypeScript. It provides a secure API for managing users, locations, and attendance records with geo-fencing validation.

## 🚀 Technology Stack

- **Runtime**: [Node.js](https://nodejs.org/)
- **Framework**: [Express.js](https://expressjs.com/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Database**: [Supabase](https://supabase.com/) (PostgreSQL)
- **Authentication**: [JWT](https://jwt.io/) (JSON Web Tokens) with refresh token rotation
- **Security**: [Helmet](https://helmetjs.github.io/), [CORS](https://github.com/expressjs/cors), [Express Rate Limit](https://github.com/express-rate-limit/express-rate-limit)
- **Validation**: [Express Validator](https://express-validator.github.io/docs/)
- **Logging**: [Morgan](https://github.com/expressjs/morgan)

## 🛠️ Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- A Supabase account and project

## ⚙️ Setup Instructions

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Environment Configuration**:
   Create a `.env` file in the root directory based on the `.env.example`:
   ```bash
   cp .env.example .env
   ```
   Fill in your Supabase credentials and JWT secrets.

3. **Database Schema**:
   The database schema is managed in Supabase. Ensure your tables (`users`, `geo_fence_locations`, `attendance_records`, `invitations`, `refresh_tokens`) are correctly set up.

4. **Run in Development**:
   ```bash
   npm run dev
   ```

5. **Build for Production**:
   ```bash
   npm run build
   ```

## 📜 Available Scripts

- `npm run dev`: Starts the development server with hot-reloading using `ts-node-dev`.
- `npm run build`: Compiles TypeScript to JavaScript in the `dist` directory.
- `npm start`: Runs the compiled production build from the `dist` directory.
- `npm run lint`: Runs ESLint to check for code style issues.

## 🔑 Environment Variables

| Variable | Description |
| :--- | :--- |
| `PORT` | Port number for the server (default: 3000) |
| `NODE_ENV` | Environment mode (development/production) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key (for administrative access) |
| `JWT_SECRET` | Secret key for signing JWT tokens |
| `JWT_EXPIRES_IN` | Expiration time for access tokens (e.g., '7d') |
| `JWT_REFRESH_EXPIRES_IN` | Expiration time for refresh tokens (e.g., '30d') |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed CORS origins |

## 📁 Project Structure

```text
backend/
├── src/
│   ├── controllers/    # Request handlers
│   ├── middleware/     # Auth and validation middleware
│   ├── routes/         # API route definitions
│   ├── types/          # TypeScript interfaces and types
│   ├── utils/          # Utility functions (Supabase, JWT, Geofence)
│   └── index.ts        # Entry point
├── .env                # Environment variables (not tracked)
├── package.json        # Dependencies and scripts
└── tsconfig.json       # TypeScript configuration
```

## 🔐 API Documentation Overview

### Auth
- `POST /api/auth/register`: Register a new user (requires invitation).
- `POST /api/auth/login`: Authenticate and receive tokens.
- `POST /api/auth/refresh`: Refresh an expired access token.
- `GET /api/auth/me`: Get current user profile.

### Attendance
- `POST /api/attendance/mark`: Mark attendance (validates geofence).
- `GET /api/attendance/my`: Get current user's records.
- `GET /api/attendance`: Admin/Supervisor view of all records.

### Locations
- `GET /api/locations`: List active geofence locations.
- `POST /api/locations`: Create new location (Admin only).

### Users & Invitations
- `POST /api/invitations`: Invite a new user (Admin/Supervisor).
- `GET /api/users`: List users (Admin/Supervisor).
