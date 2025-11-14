import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Home, Activity, BarChart3, Sliders, History, Settings, Brain, Menu, X, Stethoscope } from "lucide-react";
import { useState } from "react";

const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const username = "Trader"; // Static username for local mode
  const [sidebarOpen, setSidebarOpen] = useState(true); // Hamburger menu state

  const navigation = [
    { name: "Home", href: "/", icon: Home },
    { name: "Trading", href: "/trading", icon: Activity },
    { name: "Backtesting", href: "/backtesting", icon: BarChart3 },
    { name: "Tuning", href: "/tuning", icon: Sliders },
    { name: "History", href: "/history", icon: History },
    { name: "Diagnostics", href: "/diagnostics", icon: Stethoscope },
    { name: "Settings", href: "/settings", icon: Settings },
    { name: "AI", href: "/ai", icon: Brain },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <div className={cn(
        "bg-card border-r border-border flex flex-col shadow-elevated transition-all duration-300",
        sidebarOpen ? "w-64" : "w-16"
      )}>
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className={cn("transition-opacity duration-300", sidebarOpen ? "opacity-100" : "opacity-0")}>
              <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                HAVWAP
              </h1>
              <p className="text-xs text-muted-foreground mt-1">Options Trading Platform</p>
            </div>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all relative group",
                  isActive
                    ? "bg-primary/10 text-primary font-medium shadow-glow"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                title={!sidebarOpen ? item.name : undefined}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className={cn(
                  "transition-opacity duration-300",
                  sidebarOpen ? "opacity-100" : "opacity-0 absolute"
                )}>
                  {item.name}
                </span>
                {/* Tooltip for collapsed state */}
                {!sidebarOpen && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-popover text-popover-foreground text-sm rounded-md shadow-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-nowrap">
                    {item.name}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className={cn(
            "flex items-center gap-2 text-sm text-muted-foreground transition-all duration-300",
            !sidebarOpen && "justify-center"
          )}>
            <div className="w-2 h-2 rounded-full bg-success animate-pulse flex-shrink-0" />
            <span className={cn(
              "transition-opacity duration-300",
              sidebarOpen ? "opacity-100" : "opacity-0 absolute"
            )}>
              System Online
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-auto">
        <div className="border-b border-border bg-secondary/50 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <p className="text-sm font-medium text-muted-foreground">
              {navigation.find(n => n.href === location.pathname)?.name || "Dashboard"}
            </p>
            {/* Quick nav for collapsed sidebar */}
            {!sidebarOpen && (
              <div className="flex items-center gap-2">
                {navigation.map((item) => {
                  const isActive = location.pathname === item.href;
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={cn(
                        "p-2 rounded-lg transition-all",
                        isActive
                          ? "bg-primary/10 text-primary"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                      title={item.name}
                    >
                      <item.icon className="w-4 h-4" />
                    </Link>
                  );
                })}
              </div>
            )}
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
