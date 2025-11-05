# Trade Whisperer - GitHub Codespace Setup

This guide explains how to run Trade Whisperer in a GitHub Codespace environment.

## 🌐 Codespace vs Local Development

| Feature | Local (Electron) | Codespace (Web) |
|---------|------------------|-----------------|
| **Runtime** | Electron Desktop App | Web Browser |
| **Hot Reload** | Custom Chokidar System | Vite HMR |
| **API Access** | localhost:3001 | Forwarded Port |
| **WebSocket** | ws://localhost:3004 | wss://forwarded-port |
| **Docker** | docker-compose.yml | docker-compose.codespace.yml |

## 🚀 Quick Start in Codespace

### 1. Open in Codespace
- Click "Code" → "Codespaces" → "Create codespace on main"
- Wait for container to build (2-3 minutes)

### 2. Automatic Setup
The devcontainer will automatically:
- Install Node.js dependencies
- Start Docker services
- Forward required ports
- Launch the development server

### 3. Access the Application
- Frontend: Port 8080 (auto-opens in browser)
- Trading API: Port 3001
- Data Bus WebSocket: Port 3004
- PostgreSQL: Port 5432
- Redis: Port 6379

## 🔧 Manual Setup (if needed)

```bash
# Install dependencies
npm install

# Start all services
npm run codespace:setup

# Start development server
npm run dev:codespace
```

## 📊 Port Configuration

The following ports are automatically forwarded:

- **8080** - React Frontend (Public, auto-opens)
- **3001** - Trading API Server
- **3002** - Backtesting Server  
- **3003** - Options Data Service
- **3004** - Data Bus WebSocket
- **5432** - PostgreSQL Database
- **6379** - Redis Cache

## 🐳 Docker Services

Services available in Codespace:

1. **Frontend App** - React web application
2. **Trading API** - Main trading operations
3. **Backtesting Server** - Strategy backtesting
4. **Options Data Service** - Options chain data
5. **Data Bus Manager** - Real-time data coordination
6. **PostgreSQL** - Primary database
7. **Redis** - Caching and pub/sub

## 🔄 Development Workflow

### Making Changes
1. Edit files in the VS Code web interface
2. Vite automatically rebuilds and hot-reloads
3. Changes appear instantly in the browser

### Viewing Logs
```bash
# View all service logs
docker-compose -f docker-compose.codespace.yml logs

# View specific service logs
docker-compose -f docker-compose.codespace.yml logs api_server
docker-compose -f docker-compose.codespace.yml logs data_bus_manager
```

### Restarting Services
```bash
# Restart all services
docker-compose -f docker-compose.codespace.yml restart

# Restart specific service
docker-compose -f docker-compose.codespace.yml restart api_server
```

## 🌍 Environment Variables

Codespace automatically sets:
- `CODESPACE_MODE=true`
- `NODE_ENV=development`
- `VITE_API_URL` - Automatically configured for port forwarding
- `VITE_WS_URL` - Automatically configured for WebSocket forwarding

## 🔍 Debugging

### Check Service Status
```bash
docker-compose -f docker-compose.codespace.yml ps
```

### View Service Health
- API Health: `https://your-codespace-3001.app.github.dev/health`
- All ports are accessible via the forwarded URLs

### Common Issues

1. **Port not accessible**: Check port forwarding in VS Code
2. **Services not starting**: Check Docker logs
3. **WebSocket connection failed**: Verify port 3004 forwarding

## 📚 API Documentation

Once running, API documentation is available at:
- Trading API: `https://your-codespace-3001.app.github.dev/api/docs`
- Backtesting API: `https://your-codespace-3002.app.github.dev/api/docs`

## 🔒 Security Notes

- All forwarded ports are private by default
- Use HTTPS URLs for API calls in Codespace
- WebSocket connections use WSS (secure WebSocket)
- Environment variables are automatically configured

## 🆚 Differences from Local Setup

| Local Electron | Codespace Web |
|----------------|---------------|
| `npm run electron:docker:hot` | `npm run codespace:start` |
| Custom chokidar reload | Vite HMR |
| Desktop window | Browser tab |
| Local Docker | Codespace Docker |
| Electron APIs available | Web APIs only |

## 📞 Support

If you encounter issues:
1. Check the VS Code terminal for error messages
2. View Docker service logs
3. Verify port forwarding is working
4. Restart the Codespace if needed