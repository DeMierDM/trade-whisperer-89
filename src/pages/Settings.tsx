import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle } from "lucide-react";

const Settings = () => {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-6 space-y-4">
        <div>
          <h1 className="text-3xl font-bold">Settings</h1>
          <p className="text-muted-foreground">Configure API keys, risk controls, and preferences</p>
        </div>

        <Tabs defaultValue="api" className="w-full">
          <TabsList className="bg-secondary">
            <TabsTrigger value="api">API Keys</TabsTrigger>
            <TabsTrigger value="risk">Risk Controls</TabsTrigger>
            <TabsTrigger value="strategy">Strategy Defaults</TabsTrigger>
            <TabsTrigger value="system">System</TabsTrigger>
          </TabsList>

          <TabsContent value="api" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Polygon API */}
              <Card className="p-6 bg-gradient-card border-border shadow-card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">Polygon.io</h2>
                  <Badge variant="outline" className="bg-success/10 text-success border-success">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Connected
                  </Badge>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label>API Key</Label>
                    <Input type="password" placeholder="••••••••••••••••" className="mt-1" />
                  </div>
                  <div>
                    <Label>Rate Limit (req/min)</Label>
                    <Input type="number" placeholder="100" className="mt-1" disabled />
                  </div>
                  <Button variant="outline" className="w-full">Test Connection</Button>
                </div>
              </Card>

              {/* Alpaca API */}
              <Card className="p-6 bg-gradient-card border-border shadow-card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">Alpaca</h2>
                  <Badge variant="outline" className="bg-success/10 text-success border-success">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Connected
                  </Badge>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label>API Key</Label>
                    <Input type="password" placeholder="••••••••••••••••" className="mt-1" />
                  </div>
                  <div>
                    <Label>API Secret</Label>
                    <Input type="password" placeholder="••••••••••••••••" className="mt-1" />
                  </div>
                  <div>
                    <Label>Mode</Label>
                    <select className="w-full mt-1 p-2 rounded-lg bg-secondary border border-border text-foreground">
                      <option>Paper Trading</option>
                      <option>Live Trading</option>
                    </select>
                  </div>
                  <Button variant="outline" className="w-full">Test Connection</Button>
                </div>
              </Card>

              {/* OpenAI API */}
              <Card className="p-6 bg-gradient-card border-border shadow-card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">OpenAI (Claude MCP)</h2>
                  <Badge variant="outline" className="bg-warning/10 text-warning border-warning">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Not Configured
                  </Badge>
                </div>
                <div className="space-y-4">
                  <div>
                    <Label>API Key</Label>
                    <Input type="password" placeholder="sk-..." className="mt-1" />
                  </div>
                  <div>
                    <Label>Model</Label>
                    <select className="w-full mt-1 p-2 rounded-lg bg-secondary border border-border text-foreground">
                      <option>gpt-4</option>
                      <option>gpt-3.5-turbo</option>
                    </select>
                  </div>
                  <Button variant="outline" className="w-full">Save & Test</Button>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="risk" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="p-6 bg-gradient-card border-border shadow-card">
                <h2 className="text-xl font-semibold mb-4">Position Limits</h2>
                <div className="space-y-4">
                  <div>
                    <Label>Max Positions</Label>
                    <Input type="number" placeholder="10" className="mt-1" defaultValue="10" />
                  </div>
                  <div>
                    <Label>Max Position Size ($)</Label>
                    <Input type="number" placeholder="5000" className="mt-1" defaultValue="5000" />
                  </div>
                  <div>
                    <Label>Max Spread (¢)</Label>
                    <Input type="number" placeholder="12" className="mt-1" defaultValue="12" />
                  </div>
                  <div>
                    <Label>Min Open Interest</Label>
                    <Input type="number" placeholder="100" className="mt-1" defaultValue="100" />
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-gradient-card border-border shadow-card">
                <h2 className="text-xl font-semibold mb-4">Loss Limits</h2>
                <div className="space-y-4">
                  <div>
                    <Label>Daily Loss Limit ($)</Label>
                    <Input type="number" placeholder="5000" className="mt-1" defaultValue="5000" />
                  </div>
                  <div>
                    <Label>Weekly Loss Limit ($)</Label>
                    <Input type="number" placeholder="15000" className="mt-1" defaultValue="15000" />
                  </div>
                  <div>
                    <Label>Monthly Loss Limit ($)</Label>
                    <Input type="number" placeholder="50000" className="mt-1" defaultValue="50000" />
                  </div>
                  <div>
                    <Label>Max Drawdown (%)</Label>
                    <Input type="number" placeholder="15" className="mt-1" defaultValue="15" />
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-gradient-card border-border shadow-card">
                <h2 className="text-xl font-semibold mb-4">Time Controls</h2>
                <div className="space-y-4">
                  <div>
                    <Label>Trading Start Time</Label>
                    <Input type="time" className="mt-1" defaultValue="09:30" />
                  </div>
                  <div>
                    <Label>Trading End Time</Label>
                    <Input type="time" className="mt-1" defaultValue="15:45" />
                  </div>
                  <div>
                    <Label>Max Hold Time (minutes)</Label>
                    <Input type="number" placeholder="180" className="mt-1" defaultValue="180" />
                  </div>
                  <div>
                    <Label>Pre-Expiry Close (minutes)</Label>
                    <Input type="number" placeholder="15" className="mt-1" defaultValue="15" />
                  </div>
                </div>
              </Card>

              <Card className="p-6 bg-gradient-card border-border shadow-card">
                <h2 className="text-xl font-semibold mb-4">Kill Switch</h2>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-danger/10 border border-danger/30">
                    <div>
                      <p className="font-medium">Emergency Kill Switch</p>
                      <p className="text-sm text-muted-foreground">Immediately close all positions</p>
                    </div>
                    <Button variant="destructive">Activate</Button>
                  </div>
                  <div>
                    <Label>Auto-Kill on Data Loss (seconds)</Label>
                    <Input type="number" placeholder="30" className="mt-1" defaultValue="30" />
                  </div>
                  <div>
                    <Label>Auto-Kill on PnL Spike (%)</Label>
                    <Input type="number" placeholder="5" className="mt-1" defaultValue="5" />
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="strategy" className="mt-4">
            <Card className="p-6 bg-gradient-card border-border shadow-card max-w-2xl">
              <h2 className="text-xl font-semibold mb-4">Default Parameters</h2>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>EMA Length</Label>
                    <Input type="number" placeholder="21" className="mt-1" defaultValue="21" />
                  </div>
                  <div>
                    <Label>Entry Deviation (%)</Label>
                    <Input type="number" placeholder="0.18" className="mt-1" defaultValue="0.18" step="0.01" />
                  </div>
                  <div>
                    <Label>Near Deviation (%)</Label>
                    <Input type="number" placeholder="0.06" className="mt-1" defaultValue="0.06" step="0.01" />
                  </div>
                  <div>
                    <Label>Min Slope</Label>
                    <Input type="number" placeholder="0.00032" className="mt-1" defaultValue="0.00032" step="0.00001" />
                  </div>
                  <div>
                    <Label>RV Cap (bps)</Label>
                    <Input type="number" placeholder="50" className="mt-1" defaultValue="50" />
                  </div>
                  <div>
                    <Label>Time Stop (bars)</Label>
                    <Input type="number" placeholder="120" className="mt-1" defaultValue="120" />
                  </div>
                </div>
                <Button className="w-full bg-gradient-primary">Save Defaults</Button>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="system" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="p-6 bg-gradient-card border-border shadow-card">
                <h2 className="text-xl font-semibold mb-4">Data Storage</h2>
                <div className="space-y-4">
                  <div>
                    <Label>Database Path</Label>
                    <Input placeholder="./data/havwap.db" className="mt-1" disabled />
                  </div>
                  <div>
                    <Label>Cache Directory</Label>
                    <Input placeholder="./cache" className="mt-1" disabled />
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <span>Database Size</span>
                    <span className="font-medium">247 MB</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
                    <span>Cache Size</span>
                    <span className="font-medium">1.2 GB</span>
                  </div>
                  <Button variant="outline" className="w-full">Clear Cache</Button>
                </div>
              </Card>

              <Card className="p-6 bg-gradient-card border-border shadow-card">
                <h2 className="text-xl font-semibold mb-4">Logging</h2>
                <div className="space-y-4">
                  <div>
                    <Label>Log Level</Label>
                    <select className="w-full mt-1 p-2 rounded-lg bg-secondary border border-border text-foreground">
                      <option>DEBUG</option>
                      <option>INFO</option>
                      <option>WARNING</option>
                      <option>ERROR</option>
                    </select>
                  </div>
                  <div>
                    <Label>Log Retention (days)</Label>
                    <Input type="number" placeholder="30" className="mt-1" defaultValue="30" />
                  </div>
                  <Button variant="outline" className="w-full">View Logs</Button>
                  <Button variant="outline" className="w-full">Export Audit Trail</Button>
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Settings;
