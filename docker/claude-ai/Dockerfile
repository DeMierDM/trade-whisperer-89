# Claude AI Terminal Container
# Provides integrated Claude CLI access with full codebase visibility

FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive
ENV TERM=xterm-256color

# Install essential packages (excluding nodejs/npm - we'll install newer versions)
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    git \
    zsh \
    python3 \
    python3-pip \
    build-essential \
    ca-certificates \
    gnupg \
    lsb-release \
    nano \
    vim \
    htop \
    tree \
    jq \
    unzip \
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 18 LTS (required for Claude CLI)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs

# Install Oh My Zsh for better terminal experience
RUN sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended

# Clean any existing Claude CLI installation
RUN rm -rf /root/.local/bin/claude /root/.claude /root/.config/claude || true

# Install Claude CLI using the correct npm package
RUN npm install -g @anthropic-ai/claude-code

# Clean any cached authentication that might be using API
RUN rm -rf /root/.claude /root/.config/claude /root/.anthropic || true

# Verify Claude CLI installation (npm global installs to /usr/local/bin typically)
RUN which claude && claude --version || echo "Claude CLI installed, ready for authentication"

# Add npm global bin to PATH for all sessions (where claude will be installed)
RUN echo 'export PATH="/usr/local/bin:$PATH"' >> /root/.bashrc && \
    echo 'export PATH="/usr/local/bin:$PATH"' >> /root/.zshrc && \
    echo 'export PATH="/usr/local/bin:$PATH"' >> /root/.profile

# Setup terminal bridge application
WORKDIR /app

# Create package.json for the terminal bridge app
RUN echo '{"name":"claude-terminal-bridge","version":"1.0.0","dependencies":{"express":"^4.18.2","socket.io":"^4.7.2","cors":"^2.8.5","node-pty":"^1.0.0"}}' > package.json

# Install terminal bridge dependencies locally
RUN npm install

# Copy terminal bridge server
COPY terminal-bridge.js /app/terminal-bridge.js

# Setup workspace directory
WORKDIR /workspace

# Setup zsh as default shell with proper PATH and aliases
RUN echo 'export SHELL=/bin/zsh' >> /root/.zshrc && \
    echo 'export PATH="/root/.local/bin:$PATH"' >> /root/.zshrc && \
    echo 'cd /workspace' >> /root/.zshrc && \
    echo 'alias ll="ls -la"' >> /root/.zshrc && \
    echo 'alias cls="clear"' >> /root/.zshrc && \
    echo '# Claude CLI is available directly as "claude" - no alias needed' >> /root/.zshrc

# Create entrypoint script
RUN echo '#!/bin/bash\n\
echo "🤖 Initializing Claude AI Terminal..."\n\
echo "📁 Workspace: /workspace"\n\
echo "🔧 Available commands: claude, git, npm, python3, node"\n\
echo "✨ Type '\''claude help'\'' to get started"\n\
echo ""\n\
cd /app\n\
node terminal-bridge.js &\n\
cd /workspace\n\
exec "$@"' > /entrypoint.sh && \
    chmod +x /entrypoint.sh

# Expose port for WebSocket communication
EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
CMD ["tail", "-f", "/dev/null"]