# eLoan Frontend

Modern React-based frontend for the eLoan Management System with role-based authentication.

## Features

- Staff Login with Role Validation
- Forgot Password Flow
- Set Password (for new users and password reset)
- Role-based Routing (Bookkeeper, Treasurer, Credit Committee, Super Admin)
- JWT Token Authentication
- Modern UI with Purple/Pink Gradient Theme

## Technology Stack

- **React 19** - UI library
- **Vite** - Build tool and development server
- **React Router DOM** - Client-side routing
- **Axios** - HTTP client for API calls

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. **Install dependencies:**
   ```bash
   cd frontend
   npm install
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and configure the backend auth API URL if different from default.
   The role-specific services derive their module URLs from this value:
   ```
   VITE_API_URL=http://localhost:8000/api/auth
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

   The app will be available at `http://localhost:3000`

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Available Routes

### Authentication Routes
- `/login` - Staff login page
- `/forgot-password` - Request password reset
- `/set-password/:uid/:token` - Set new password

### Dashboard Routes (Placeholder)
- `/bookkeeper/dashboard` - Bookkeeper dashboard
- `/treasurer/dashboard` - Treasurer dashboard
- `/credit-committee/dashboard` - Credit Committee dashboard
- `/admin/dashboard` - Super Administrator dashboard

## Project Structure

```
frontend/
├── src/
│   ├── pages/
│   │   ├── Login.jsx              # Login page
│   │   ├── ForgotPassword.jsx     # Forgot password page
│   │   └── SetPassword.jsx        # Set password page
│   ├── services/
│   │   └── auth.service.js        # Authentication API service
│   ├── styles/
│   │   ├── index.css              # Global styles
│   │   └── Login.css              # Authentication pages styles
│   ├── App.jsx                    # Main app with routing
│   └── main.jsx                   # Entry point
├── index.html
├── vite.config.js
└── package.json
```

## API Integration

The frontend communicates with the Django backend API. All API calls are handled through the `authService` in `src/services/auth.service.js`.

### Available API Methods

- `login(email, password)` - Authenticate staff member
- `logout()` - Clear local storage
- `forgotPassword(email)` - Request password reset
- `validateToken(uid, token)` - Validate reset token
- `setPassword(uid, token, newPassword, confirmPassword)` - Set new password
- `refreshToken()` - Refresh access token
- `getCurrentUser()` - Get current user from localStorage
- `isAuthenticated()` - Check if user is logged in

## Authentication Flow

### Login Flow
1. User enters email and password
2. Frontend calls `/api/auth/login/`
3. Backend validates credentials and role
4. Returns JWT tokens and user info
5. Tokens stored in localStorage
6. User redirected to role-specific dashboard

### Forgot Password Flow
1. User clicks "Forgot Password?"
2. User enters email
3. Frontend calls `/api/auth/forgot-password/`
4. Backend sends password reset email
5. User clicks link in email
6. Redirected to Set Password page

### Set Password Flow
1. User clicks link from email (or admin invitation)
2. Frontend validates token via `/api/auth/validate-token/`
3. User enters new password
4. Frontend calls `/api/auth/set-password/`
5. Password updated, user redirected to login

## Styling

The application uses a modern purple/pink gradient theme:
- Primary gradient: `#667eea` to `#764ba2`
- Clean, rounded UI elements
- Responsive design
- Smooth transitions and hover effects

## Next Steps

- Implement actual dashboard components for each role
- Add protected route guards
- Implement token refresh logic
- Add loading states and better error handling
- Create additional pages (loans, payments, reports, etc.)

## Development Tips

### Hot Module Replacement
Vite provides instant HMR. Changes to your code will reflect immediately without full page reload.

### Environment Variables
All environment variables must be prefixed with `VITE_` to be accessible in your code via `import.meta.env.VITE_*`

### Debugging
- React DevTools browser extension recommended
- Network tab to inspect API calls
- Console logs for debugging

## Troubleshooting

### CORS Errors
Make sure the Django backend has `django-cors-headers` installed and configured with the frontend URL in `CORS_ALLOWED_ORIGINS`.

### API Connection Issues
- Verify backend is running on `http://localhost:8000`
- Check `.env` file has correct `VITE_API_URL`
- Check browser console for specific error messages

### Build Errors
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Clear Vite cache: `rm -rf node_modules/.vite`

## License

ISC
