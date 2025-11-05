// Environment detection utilities for Codespace vs Local development

export const isCodespace = () => {
  return !!(
    process.env.CODESPACE_NAME || 
    process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN ||
    (typeof window !== 'undefined' && window.location.hostname.includes('app.github.dev'))
  );
};

export const isElectron = () => {
  return typeof window !== 'undefined' && window.navigator?.userAgent?.includes('Electron');
};

export const getEnvironment = () => {
  if (isCodespace()) return 'codespace';
  if (isElectron()) return 'electron';
  return 'web';
};

export const getApiConfig = () => {
  const env = getEnvironment();
  
  switch (env) {
    case 'codespace':
      // In Codespace, use the forwarded port URLs
      const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
      const baseUrl = hostname.replace(/^[^-]*-8080/, ''); // Extract the base codespace URL
      
      return {
        API_URL: `https://${hostname.replace('8080', '3001')}`,
        WS_URL: `wss://${hostname.replace('8080', '3004')}`,
        BASE_URL: `https://${hostname}`,
      };
      
    case 'electron':
      return {
        API_URL: 'http://localhost:3001',
        WS_URL: 'ws://localhost:3004',
        BASE_URL: 'http://localhost:8080',
      };
      
    default: // web
      return {
        API_URL: 'http://localhost:3001',
        WS_URL: 'ws://localhost:3004',
        BASE_URL: 'http://localhost:8080',
      };
  }
};

export const getEnvironmentInfo = () => {
  const env = getEnvironment();
  const config = getApiConfig();
  
  return {
    environment: env,
    isCodespace: env === 'codespace',
    isElectron: env === 'electron',
    isWeb: env === 'web',
    config,
    userAgent: typeof window !== 'undefined' ? window.navigator?.userAgent : '',
    hostname: typeof window !== 'undefined' ? window.location.hostname : '',
  };
};