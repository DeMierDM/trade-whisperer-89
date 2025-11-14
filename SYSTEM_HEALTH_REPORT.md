# System Health Check Report

**Generated:** 2025-11-06T00:51:43.304Z

---

## Overall Status: ✅ HEALTHY

## Docker Containers

Status: 7/7 running

## Data Bus Manager

Health: ✅ Healthy

- Stock Channel Connected: true
- Active Symbols: SPY, QQQ, IWM
- Feed Type: indicative
- Subscriptions: 6

## API Server

Health: ✅ Healthy

## Backtesting Server

Health: ✅ Healthy

## Frontend

Health: ✅ Accessible

## Database

Tables: 4/4 found

## Data Bus Connection Details

- Alpaca Connected: ✅
- Has Subscriptions: ✅
- Tables Initialized: ✅
- No Errors: ✅

## Recommendations

✅ All systems are healthy and operational!

The following components are working correctly:
- All Docker containers are running
- Data Bus is connected to Alpaca and receiving data
- API Server and Backtesting Server are healthy
- Frontend is accessible
- Database tables are properly initialized

You can now:
1. Run the electron app with: `npm run start:dev`
2. Access the web UI at: http://localhost:8080
3. Run the audit script with: `node audit-electron-app.js`
