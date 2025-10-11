import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Home, Activity, BarChart3, Sliders, History, Settings, Brain } from "lucide-react";

const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const username = "Trader"; // Static username for local mode

  const navigation = [
    { name: "Home", href: "/", icon: Home },
    { name: "Trading", href: "/trading", icon: Activity },
    { name: "Backtesting", href: "/backtesting", icon: BarChart3 },
    { name: "Tuning", href: "/tuning", icon: Sliders },
    { name: "History", href: "/history", icon: History },
    { name: "Settings", href: "/settings", icon: Settings },
    { name: "AI", href: "/ai", icon: Brain },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <div className="w-64 bg-card border-r border-border flex flex-col shadow-elevated">
        <div className="p-6">
          <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            HAVWAP
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Options Trading Platform</p>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all",
                  isActive
                    ? "bg-primary/10 text-primary font-medium shadow-glow"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
            <span>System Online</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-auto">
        <div className="border-b border-border bg-secondary/50 px-6 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground">
              {navigation.find(n => n.href === location.pathname)?.name || "Dashboard"}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{username}</p>
              <p className="text-xs text-muted-foreground">Local Mode</p>
            </div>
          </div>
        </div>
        <div className="flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Layout;
